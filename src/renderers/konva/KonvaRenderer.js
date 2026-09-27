import { runtimeCount, runtimeColor } from '../../core/runtime/runtime.js';
import Konva from 'konva';
import { fgColor } from '../../core/model/model.js';
import { drawSpatial2d } from './spatial.js';
// 二维渲染适配器：读取 Layout、Runtime 和视图状态，只缓存图形与刷新回调。
export function createKonvaRenderer(api) {
  // 模型长度统一为米；22 像素/米是未缩放画布比例，视图缩放另由 stage 控制。
  const unit = 22;
  const runtimeNodes = new Map();
  const areaNodes = new Map();
  // 只刷新对应物理区域的文字，batchDraw 合并本帧绘制请求。
  function updateArea(id) {
    areaNodes.get(id)?.();
    layer?.batchDraw();
  }
  // 按货位编码查找刷新回调；同一列汇总依赖多个货位，因此使用回调集合。
  function updateLocation(code) {
    for (const update of runtimeNodes.get(code) || []) update();
    layer?.batchDraw();
  }
  // 整份快照或运行状态改变时更新已有图形，不销毁地图节点。
  function updateRuntime() {
    for (const code of runtimeNodes.keys()) updateLocation(code);
    for (const id of areaNodes.keys()) updateArea(id);
  }
  let stage, grid, layer, wrap;
  // 创建舞台与分层；网格不参与命中，滚轮缩放保持鼠标指向的世界坐标不变。
  function mount(container, viewport) {
    wrap = viewport;
    stage = new Konva.Stage({ container, width: wrap.clientWidth, height: wrap.clientHeight, draggable: true });
    grid = new Konva.Layer({ listening: false });
    layer = new Konva.Layer();
    stage.add(grid, layer);
    stage.on('wheel', e => {
      e.evt.preventDefault();
      const old = stage.scaleX(),
        p = stage.getPointerPosition(),
        next = Math.max(0.25, Math.min(4, old * (e.evt.deltaY > 0 ? 0.9 : 1.1))),
        anchor = { x: (p.x - stage.x()) / old, y: (p.y - stage.y()) / old };
      stage.scale({ x: next, y: next });
      stage.position({ x: p.x - anchor.x * next, y: p.y - anchor.y * next });
    });
  }
  // 布局或视图结构变化时重建图形及运行态映射；单条 Runtime Delta 使用定向更新接口。
  function renderLayout() {
    const { model, level, colorMode, selected, slotId, cad, spatial } = api.state();
    const visible = () => model.racks.filter(r => r.spaceId === 'main');
    const matches = r => api.state().zone === 'ALL' || r.fgCode === api.state().zone;
    runtimeNodes.clear();
    areaNodes.clear();
    cad.beforeDraw();
    cad.beginNodes();
    grid.destroyChildren();
    for (let i = -200; i <= 200; i += 2) {
      grid.add(
        new Konva.Line({ points: [i * unit, -200 * unit, i * unit, 200 * unit], stroke: '#e1e8ed', strokeWidth: 0.6 })
      );
      grid.add(
        new Konva.Line({ points: [-200 * unit, i * unit, 200 * unit, i * unit], stroke: '#e1e8ed', strokeWidth: 0.6 })
      );
    }
    layer.destroyChildren();
    drawSpatial2d(
      {
        ...api.spatial(),
        ...spatial,
        model: () => model,
        areaRuntime: id => api.state().areaRuntime(id),
        registerArea: (id, refresh) => areaNodes.set(id, refresh),
        selectVirtualArea: api.selectVirtualArea,
      },
      layer,
      unit
    );
    for (const r of visible()) {
      const w = r.cols * r.width * unit,
        d = r.depth * unit,
        g = new Konva.Group({
          x: r.x * unit,
          y: r.y * unit,
          rotation: r.rotation,
          draggable: matches(r),
          opacity: matches(r) ? 1 : 0.22,
        });
      g.add(
        new Konva.Rect({
          width: w,
          height: d,
          fill: 'white',
          stroke: cad.has(r.id) ? '#167f73' : '#b9cbd6',
          strokeWidth: cad.has(r.id) ? 3 : 1,
          cornerRadius: 3,
          shadowColor: '#466372',
          shadowBlur: 8,
          shadowOpacity: 0.1,
          shadowOffsetY: 4,
        })
      );
      for (let c = 1; c <= r.cols; c++) {
        const list = r.slots.filter(s => s.col === c && (!level || s.level === level)),
          count = list.reduce((n, s) => n + (runtimeCount(api.state().runtime, s.code) || 0), 0);
        const rect = new Konva.Rect({
          x: (c - 1) * r.width * unit + 3,
          y: 3,
          width: r.width * unit - 6,
          height: d - 6,
          fill: !list.length
            ? '#f0f3f5'
            : list.some(s => s.id === slotId)
              ? '#f9e6a8'
              : colorMode === 'fg'
                ? fgColor(r.fgCode)
                : count
                  ? '#22a694'
                  : '#dce6ec',
          cornerRadius: 2,
        });
        g.add(rect);
        g.add(
          new Konva.Text({
            x: (c - 1) * r.width * unit,
            y: d / 2 - 6,
            width: r.width * unit,
            text: list.length ? String(count) : '—',
            fontSize: 11,
            align: 'center',
            fill: colorMode === 'fg' || list.some(s => s.id === slotId) ? '#394e59' : count ? '#fff' : '#81949f',
            listening: false,
          })
        );
        const label = g.children[g.children.length - 1];
        // 每次从独立 Runtime 取最新状态；缺失数量显示 —，初始图形在绘制前也经过同一刷新。
        const refresh = () => {
          const values = list.map(slot => runtimeCount(api.state().runtime, slot.code));
          const known = values.length && values.every(value => value !== null);
          const total = values.reduce((sum, value) => sum + (value || 0), 0);
          const chosen = list.some(slot => slot.id === slotId);
          rect.fill(
            chosen
              ? '#f9e6a8'
              : colorMode === 'fg'
                ? fgColor(r.fgCode)
                : runtimeColor(
                    api.state().runtime,
                    list.map(slot => slot.code)
                  )
          );
          label.text(known ? String(total) : '—');
          label.fill(known && total && !chosen && colorMode !== 'fg' ? '#fff' : '#81949f');
        };
        for (const slot of list) {
          if (!runtimeNodes.has(slot.code)) runtimeNodes.set(slot.code, new Set());
          runtimeNodes.get(slot.code).add(refresh);
        }
        refresh();
        rect.on('click tap', e => {
          e.cancelBubble = true;
          if (!matches(r)) return;
          cad.select(r.id, e.evt);
          if (cad.ids().length === 1) {
            api.selectSlot(level ? list[0]?.id : null);
          }
        });
      }
      g.add(
        new Konva.Text({
          x: 0,
          y: -21,
          text: `${r.name}  /  ${r.fgCode} · ${r.levels} 层`,
          fontSize: 12,
          fill: r.id === selected ? '#137f71' : '#627e8e',
        })
      );
      if (matches(r)) cad.bind(g, r);
      layer.add(g);
    }
    // 门移至内容层顶部，避免被区域或货架遮挡而无法命中。
    layer.find('.boundary-door').forEach(node => node.moveToTop());
    cad.paintSelection();
    layer.batchDraw();
    grid.batchDraw();
  }
  // 计算全部货架和空间对象的范围，适配二维视图并同步三维全局视角。
  function fitToView() {
    const { model, spatial } = api.state();
    const visible = () => model.racks.filter(r => r.spaceId === 'main');
    const points = visible().flatMap(r => {
      const a = (r.rotation * Math.PI) / 180;
      return [
        [0, 0],
        [r.cols * r.width, 0],
        [0, r.depth],
        [r.cols * r.width, r.depth],
      ].map(([x, y]) => ({ x: r.x + x * Math.cos(a) - y * Math.sin(a), y: r.y + x * Math.sin(a) + y * Math.cos(a) }));
    });
    points.push(...spatial.points());
    const minX = Math.min(0, ...points.map(p => p.x)),
      minY = Math.min(0, ...points.map(p => p.y)),
      maxX = Math.max(35, ...points.map(p => p.x)),
      maxY = Math.max(20, ...points.map(p => p.y));
    const scale = Math.max(
      0.08,
      Math.min(
        1.5,
        (wrap.clientWidth - 70) / ((maxX - minX) * unit),
        (wrap.clientHeight - 230) / ((maxY - minY) * unit)
      )
    );
    stage.scale({ x: scale, y: scale });
    stage.position({ x: 35 - minX * unit * scale, y: 90 - minY * unit * scale });
    api.fit3d({ minX, minY, maxX, maxY });
    renderLayout();
  }
  // 按世界外包矩形居中与缩放，保留边距，并同步三维聚焦。
  function focusObjects(b) {
    const scale = Math.max(
      0.08,
      Math.min(4, (wrap.clientWidth - 100) / ((b.width + 2) * unit), (wrap.clientHeight - 180) / ((b.depth + 2) * unit))
    );
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: wrap.clientWidth / 2 - (b.x + b.width / 2) * unit * scale,
      y: wrap.clientHeight / 2 - (b.y + b.depth / 2) * unit * scale,
    });
    api.focus3d(b);
    renderLayout();
  }
  return {
    mount,
    renderLayout,
    updateRuntime,
    updateLocation,
    updateArea,
    fitToView,
    focusObjects,
    unit,
    get stage() {
      return stage;
    },
    // 容器尺寸变化只调整画布大小，不改变模型坐标。
    resize() {
      stage.size({ width: wrap.clientWidth, height: wrap.clientHeight });
    },
    // 销毁舞台及其子节点，释放二维渲染资源。
    destroy() {
      stage.destroy();
    },
  };
}
