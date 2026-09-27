import * as THREE from 'three';
import { wallSegments, edgePoints, DOOR_TYPES } from '../../core/doors/doors.js';
import { AREA_TYPES } from '../../core/spatial/spatial.js';
import { equalAreaSections } from '../../core/spatial/area-bindings.js';
// 把共享空间绘制成三维地面、门和区域，所有业务身份来自原布局。
export function drawSpatial3d(api, world, box) {
  const active = api.activeId(),
    activeDoor = api.doorId();
  // 用 Canvas 纹理生成面向相机的文字精灵，返回更新函数供运行态定向刷新。
  function label(parent, a) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.font = '40px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#435967';
    const texture = new THREE.CanvasTexture(canvas),
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.position.set(
      a.x +
        (Math.cos((a.rotation * Math.PI) / 180) * a.width) / 2 -
        (Math.sin((a.rotation * Math.PI) / 180) * a.depth) / 2,
      0.35,
      a.y +
        (Math.sin((a.rotation * Math.PI) / 180) * a.width) / 2 +
        (Math.cos((a.rotation * Math.PI) / 180) * a.depth) / 2
    );
    sprite.scale.set(7, 1.17, 1);
    parent.add(sprite);
    // 只重画文字画布；needsUpdate 通知 Three 上传新纹理，不创建新网格。
    const update = text => {
      c.clearRect(0, 0, 768, 128);
      c.font = '40px "Microsoft YaHei", sans-serif';
      c.fillStyle = '#435967';
      c.fillText(text, 384, 64, 740);
      texture.needsUpdate = true;
    };
    update(a.name);
    return { sprite, update };
  }
  // 复用 Core 的墙段与门洞位置，保持二维、三维空间一致。
  function draw3d(world, box) {
    const m = api.model(),
      b = m.boundary;
    box(world, b.width, 0.025, b.depth, b.x + b.width / 2, -0.06, b.y + b.depth / 2, '#f9fbfc');
    for (const [p, q] of wallSegments(b))
      box(
        world,
        Math.max(0.1, Math.abs(q.x - p.x)),
        0.1,
        Math.max(0.1, Math.abs(q.y - p.y)),
        (p.x + q.x) / 2,
        0,
        (p.y + q.y) / 2,
        '#9aabb7',
        { areaId: 'boundary' }
      );
    for (const d of b.doors || []) {
      const [p, q] = edgePoints(b, d.side, d.offset, d.offset + d.width),
        color = activeDoor === d.id ? '#b28b35' : DOOR_TYPES[d.type].color;
      for (const v of [p, q]) box(world, 0.12, 2.4, 0.12, v.x, 1.2, v.y, color, { doorId: d.id });
      box(
        world,
        Math.max(0.12, Math.abs(q.x - p.x)),
        0.14,
        Math.max(0.12, Math.abs(q.y - p.y)),
        (p.x + q.x) / 2,
        2.4,
        (p.y + q.y) / 2,
        color,
        { doorId: d.id }
      );
      label(world, { name: d.name, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, width: 0, depth: 0, rotation: 0 });
    }
    for (const a of m.areas) {
      const g = new THREE.Group();
      g.position.set(a.x, -0.015, a.y);
      g.rotation.y = (-a.rotation * Math.PI) / 180;
      world.add(g);
      box(g, a.width, 0.025, a.depth, a.width / 2, 0, a.depth / 2, AREA_TYPES[a.type].color, { areaId: a.id });
      for (const [x, z, w, d] of [
        [a.width / 2, 0, a.width, 0.06],
        [a.width / 2, a.depth, a.width, 0.06],
        [0, a.depth / 2, 0.06, a.depth],
        [a.width, a.depth / 2, 0.06, a.depth],
      ])
        box(g, w, 0.03, d, x, 0.02, z, active === a.id ? '#996c27' : AREA_TYPES[a.type].stroke, { areaId: a.id });
      const rows = api.areaRuntime?.(a.id)?.rows || [];
      if (!rows.length) label(world, a);
      else {
        label(g, { ...a, x: 0, y: 0, depth: 0, rotation: 0 });
        // 沿长轴稳定等分所有启用绑定；这是局部视觉分区，不生成物理隔断，也不写回 Layout。
        const labels = equalAreaSections(a, rows).map((section, index) => {
          const data = { areaId: a.id, virtualLocationCode: section.binding.virtualLocationCode };
          box(
            g,
            section.width,
            0.015,
            section.depth,
            section.x + section.width / 2,
            0.04,
            section.y + section.depth / 2,
            ['#c9e4f5', '#f7d9bc', '#f9e6a8'][index % 3],
            data
          );
          const caption = label(g, {
            name: section.binding.displayName,
            x: section.x,
            y: section.y,
            width: section.width,
            depth: section.depth,
            rotation: 0,
          });
          caption.sprite.userData = data;
          const scale = Math.min(7, section.width);
          caption.sprite.scale.set(scale, scale / 6, 1);
          return caption;
        });
        // 更新受影响区域已有标签，未知摘要用 — 显示。
        const refresh = () =>
          api
            .areaRuntime(a.id)
            .rows.forEach((row, index) =>
              labels[index].update(
                `${row.displayName} · ${row.summary?.huCount ?? '—'} HU · ${row.summary?.palletCount ?? '—'} 托`
              )
            );
        api.registerArea?.(a.id, refresh);
        refresh();
      }
    }
  }
  draw3d(world, box);
}
