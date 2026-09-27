import Konva from 'konva';
import { wallSegments, edgePoints, DOOR_TYPES } from '../../core/doors/doors.js';
import { AREA_TYPES } from '../../core/spatial/spatial.js';
// 绘制物理区域、边界和门；绑定交互回调，不在渲染层修改布局。
export function drawSpatial2d(api, layer, unit) {
  const active = api.activeId(),
    activeDoor = api.doorId(),
    selectDoor = api.selectDoor;
  // 共享空间始终绘制；FG 筛选作用于货架，不分割仓库坐标系。
  function draw2d(layer, unit) {
    const m = api.model(),
      b = m.boundary;
    const boundary = new Konva.Rect({
      x: b.x * unit,
      y: b.y * unit,
      width: b.width * unit,
      height: b.depth * unit,
      fill: '#ffffff60',
    });
    boundary.setAttr('cadBackground', true);
    layer.add(boundary);
    for (const points of wallSegments(b)) {
      const line = new Konva.Line({
        points: points.flatMap(p => [p.x * unit, p.y * unit]),
        stroke: active === 'boundary' ? '#b59646' : '#9aabb7',
        strokeWidth: active === 'boundary' ? 3 : 2,
        dash: [10, 5],
      });
      line.setAttr('cadBackground', true);
      layer.add(line);
    }
    for (const d of b.doors || []) {
      const [p, q] = edgePoints(b, d.side, d.offset, d.offset + d.width),
        g = new Konva.Group({ name: 'boundary-door' });
      // 按缩放补偿命中范围，让缩小时的门仍有足够点击面积。
      const padding = 12 / layer.getStage().scaleX();
      g.add(
        new Konva.Rect({
          x: Math.min(p.x, q.x) * unit - padding,
          y: Math.min(p.y, q.y) * unit - padding,
          width: Math.abs(q.x - p.x) * unit + padding * 2,
          height: Math.abs(q.y - p.y) * unit + padding * 2,
          fill: 'rgba(255,255,255,0.001)',
        })
      );
      g.add(
        new Konva.Line({
          name: 'door-line',
          points: [p.x * unit, p.y * unit, q.x * unit, q.y * unit],
          stroke: activeDoor === d.id ? '#b28b35' : DOOR_TYPES[d.type].color,
          strokeWidth: activeDoor === d.id ? 10 : 8,
          hitStrokeWidth: Math.max(18, 22 / layer.getStage().scaleX()),
          dash: [5, 3],
        })
      );
      for (const v of [p, q]) g.add(new Konva.Circle({ x: v.x * unit, y: v.y * unit, radius: 3, fill: '#758f9e' }));
      g.add(
        new Konva.Text({
          x: ((p.x + q.x) / 2) * unit - 50,
          y: ((p.y + q.y) / 2) * unit + (d.side === 'top' ? -20 : 8),
          width: 100,
          text: d.name + ' · ' + d.width + 'm',
          align: 'center',
          fontSize: 12,
          fill: '#546e7d',
        })
      );
      g.on('click tap', e => {
        e.cancelBubble = true;
        if (!api.isPanning()) selectDoor(d.id);
      });
      api.bindDoor(g, d, b, () => selectDoor(d.id, false));
      layer.add(g);
    }
    layer.add(
      new Konva.Text({
        x: b.x * unit,
        y: (b.y - 0.8) * unit,
        text: `${b.name} · ${b.width.toFixed(1)} × ${b.depth.toFixed(1)} m`,
        fontSize: 12,
        fill: '#6f8391',
        listening: false,
      })
    );
    for (const a of m.areas) {
      const colors = AREA_TYPES[a.type],
        g = new Konva.Group({ x: a.x * unit, y: a.y * unit, rotation: a.rotation, draggable: true });
      g.add(
        new Konva.Rect({
          width: a.width * unit,
          height: a.depth * unit,
          fill: colors.color,
          opacity: 0.8,
          stroke: api.isSelected(a.id) ? '#996c27' : colors.stroke,
          strokeWidth: api.isSelected(a.id) ? 3 : 1.5,
          dash: a.type === 'aisle' ? [8, 4] : undefined,
        })
      );
      g.add(
        new Konva.Text({
          x: 6,
          y: 6,
          width: Math.max(20, a.width * unit - 12),
          text: `${a.name}\n${a.width} × ${a.depth} m`,
          fontSize: 12,
          lineHeight: 1.5,
          fill: '#576872',
          listening: false,
        })
      );
      if (a.type === 'aisle')
        g.add(
          new Konva.Line({
            points: [8, (a.depth * unit) / 2, a.width * unit - 8, (a.depth * unit) / 2],
            stroke: colors.stroke,
            dash: [12, 8],
            opacity: 0.5,
            listening: false,
          })
        );
      const rows = api.areaRuntime?.(a.id)?.rows || [];
      if (rows.length) {
        // 全部启用绑定均分可用文字高度；空间不足缩字或省略文字，不按优先级隐藏绑定。
        const rowHeight = (a.depth * unit) / (rows.length + 2);
        const fontSize = Math.min(12, rowHeight / 1.4);
        const title = g.children[1];
        title.text(a.name);
        title.y(1);
        title.fontSize(fontSize);
        title.wrap('none');
        const labels = rows.map((row, index) => {
          const text = new Konva.Text({
            name: 'virtual-area-row',
            x: 4,
            y: (index + 1) * rowHeight,
            width: a.width * unit - 8,
            fontSize,
            fill: '#435967',
            wrap: 'none',
            ellipsis: true,
          });
          text.setAttr('virtualLocationCode', row.virtualLocationCode);
          text.on('click tap', event => {
            if (event.evt?.shiftKey || api.isPanning()) return;
            event.cancelBubble = true;
            api.selectVirtualArea(a.id, row.virtualLocationCode);
          });
          g.add(text);
          return text;
        });
        const total = new Konva.Text({
          x: 4,
          y: (rows.length + 1) * rowHeight,
          width: a.width * unit - 8,
          fontSize,
          fill: '#435967',
          listening: false,
          wrap: 'none',
          ellipsis: true,
        });
        g.add(total);
        // 只更新现有行标签与合计；绑定结构变化由布局重绘处理，运行态变化无需重建区域。
        const refresh = () => {
          const current = api.areaRuntime(a.id);
          current.rows.forEach((row, index) =>
            labels[index].text(
              `${row.displayName} · ${row.summary?.huCount ?? '—'} HU · ${row.summary?.palletCount ?? '—'} 托`
            )
          );
          total.text(`合计 ${current.totals.huCount ?? '—'} HU · ${current.totals.palletCount ?? '—'} 托`);
        };
        api.registerArea?.(a.id, refresh);
        refresh();
      }
      api.bindArea(g, a);
      if (active === a.id) {
        const handle = new Konva.Rect({
          x: a.width * unit - 5,
          y: a.depth * unit - 5,
          width: 10,
          height: 10,
          fill: '#fff',
          stroke: '#996c27',
          strokeWidth: 2,
          draggable: true,
        });
        api.bindResize(handle, a);
        g.add(handle);
      }
      layer.add(g);
    }
  }
  draw2d(layer, unit);
}
