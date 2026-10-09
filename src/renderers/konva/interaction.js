import Konva from 'konva';
import { corners } from '../../core/spatial/spatial.js';

// Graphics handles and pointer events stay here. Callbacks only request application intents.
// 管理命中节点、拖动及辅助图形；所有业务提交通过 events 交还 Application。
export function createInteractionSurface({ stage, unit, host, canEdit, isPanning }, events) {
  const overlay = new Konva.Layer({ listening: false });
  stage.add(overlay);
  let nodes = new Map();
  // 屏幕点先减平移、再除缩放与像素/米比例，得到世界坐标。
  const point = () => {
    const p = stage.getPointerPosition();
    return { x: (p.x - stage.x()) / stage.scaleX() / unit, y: (p.y - stage.y()) / stage.scaleY() / unit };
  };
  const clear = () => overlay.destroyChildren();
  // 绘制选中或预览轮廓；线宽和虚线间距除以缩放，使屏幕粗细基本恒定。
  function outline(objects, preview = false) {
    for (const object of objects)
      overlay.add(
        new Konva.Line({
          points: corners(object).flatMap(p => [p.x * unit, p.y * unit]),
          closed: true,
          stroke: preview ? '#b18a35' : '#a77b28',
          fill: preview ? '#f9e6a833' : undefined,
          strokeWidth: (preview ? 1 : 2) / stage.scaleX(),
          dash: preview ? [5 / stage.scaleX(), 3 / stage.scaleX()] : [4 / stage.scaleX(), 2 / stage.scaleX()],
        })
      );
    if (preview) overlay.batchDraw();
  }
  // 绑定对象命中及拖动；.cad 是事件命名空间，target 检查避免子手柄冒泡触发整组拖动。
  function bind(node, object) {
    nodes.set(object.id, node);
    node.setAttr('objectId', object.id);
    node.draggable(canEdit() && !isPanning());
    node.on('click.cad tap.cad', event => {
      event.cancelBubble = true;
      events.select(object.id, event.evt);
    });
    node.on('dragstart.cad', event => {
      if (event.target === node) events.dragStart(object.id);
    });
    node.on('dragmove.cad', event => {
      if (event.target === node) events.dragMove(object.id, node.x() / unit, node.y() / unit, event.evt?.altKey);
    });
    node.on('dragend.cad', event => {
      if (event.target === node) events.dragEnd(object.id);
    });
  }
  // 尺寸手柄仅编辑模式可用；换算局部尺寸后由应用校验和提交。
  function bindResize(handle, area) {
    handle.visible(canEdit());
    handle.draggable(canEdit());
    handle.on('dragstart', event => {
      event.cancelBubble = true;
      events.resizeStart();
    });
    handle.on('dragmove', event => {
      event.cancelBubble = true;
      const width = Math.max(0.5, (handle.x() + 5) / unit);
      const depth = Math.max(0.5, (handle.y() + 5) / unit);
      handle.position({ x: width * unit - 5, y: depth * unit - 5 });
      handle.getAttr('resizePreview')?.(width, depth);
    });
    handle.on('dragend', event => {
      event.cancelBubble = true;
      events.resizeEnd(area, (handle.x() + 5) / unit, (handle.y() + 5) / unit);
    });
  }
  // 门节点只沿所属边移动；预览偏移经领域回调约束，结束时提交而非逐帧写模型。
  function bindDoor(node, door, boundary, onSelect) {
    nodes.set('door:' + door.id, node);
    node.draggable(canEdit() && !isPanning());
    const horizontal = ['top', 'bottom'].includes(door.side);
    let offset = door.offset;
    node.on('dragstart', event => {
      event.cancelBubble = true;
      events.doorStart(onSelect);
      node.findOne('.door-line')?.stroke('#b28b35');
    });
    node.on('dragmove', event => {
      event.cancelBubble = true;
      offset = events.doorOffset(boundary, door, (horizontal ? node.x() : node.y()) / unit, !event.evt?.altKey);
      node.position({
        x: horizontal ? (offset - door.offset) * unit : 0,
        y: horizontal ? 0 : (offset - door.offset) * unit,
      });
    });
    node.on('dragend', event => {
      event.cancelBubble = true;
      events.doorEnd(door, boundary, offset);
    });
  }
  stage.draggable(false);
  stage.on('mousedown.cad touchstart.cad', event => {
    if (isPanning()) {
      stage.startDrag();
      return;
    }
    if (!canEdit()) {
      if (event.target === stage || event.target.getAttr('cadBackground')) stage.startDrag();
      return;
    }
    if (event.evt?.button && event.evt.button !== 0) return;
    if (event.target !== stage && !event.target.getAttr('cadBackground')) return;
    events.marqueeStart(point(), stage.getPointerPosition(), !!event.evt.shiftKey);
  });
  stage.on('mousemove.cad touchmove.cad', () => events.marqueeMove(point()));
  stage.on('mouseup.cad touchend.cad', () => events.marqueeEnd(point()));
  return {
    bind,
    bindResize,
    bindDoor,
    clear,
    scale: () => stage.scaleX(),
    // 布局重绘后重建 ID 到节点的映射，避免继续操作已销毁的图形。
    beginNodes() {
      nodes = new Map();
    },
    // 停止节点和舞台拖动；是否取消提交由应用的 cancelling 状态判断。
    stopDragging() {
      stage.find(node => node.isDragging?.()).forEach(node => node.stopDrag());
      stage.stopDrag();
    },
    // 组合拖动只改节点位置，传入对象仍是拖动开始时的基准副本。
    moveObjects(objects, dx, dy) {
      for (const object of objects)
        nodes.get(object.id)?.position({ x: (object.x + dx) * unit, y: (object.y + dy) * unit });
    },
    // 切换舞台平移和对象拖动，避免同一手势同时移动视图与货架。
    setPan(enabled) {
      stage.draggable(enabled);
      nodes.forEach(node => node.draggable(canEdit() && !enabled));
      host.style.cursor = enabled ? 'grab' : 'default';
    },
    // 根据世界坐标绘制对齐辅助线，不参与命中或持久化。
    guides(guides) {
      clear();
      for (const guide of guides)
        overlay.add(
          new Konva.Line({
            points:
              guide.axis === 'x'
                ? [guide.value * unit, -220 * unit, guide.value * unit, 220 * unit]
                : [-220 * unit, guide.value * unit, 220 * unit, guide.value * unit],
            stroke: '#c38e39',
            strokeWidth: 1 / stage.scaleX(),
            dash: [6 / stage.scaleX(), 4 / stage.scaleX()],
          })
        );
      overlay.batchDraw();
    },
    // 按框选方向改变颜色和虚实线；真正的包含/相交判断由 Core 完成。
    marquee(start, end) {
      clear();
      overlay.add(
        new Konva.Rect({
          x: Math.min(start.x, end.x) * unit,
          y: Math.min(start.y, end.y) * unit,
          width: Math.abs(end.x - start.x) * unit,
          height: Math.abs(end.y - start.y) * unit,
          fill: end.x >= start.x ? '#c9e4f544' : '#b9dfce44',
          stroke: end.x >= start.x ? '#6196b5' : '#349078',
          strokeWidth: 1 / stage.scaleX(),
          dash: end.x < start.x ? [5 / stage.scaleX(), 3 / stage.scaleX()] : undefined,
        })
      );
      overlay.batchDraw();
    },
    // 替换临时预览轮廓，不把副本加入正式内容层。
    preview(objects) {
      clear();
      outline(objects, true);
    },
    selection: objects => outline(objects),
  };
}
