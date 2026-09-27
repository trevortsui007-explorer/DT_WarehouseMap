import { edgePoints } from '../../core/doors/doors.js';
import { corners } from '../../core/spatial/spatial.js';
// 协调区域、边界和门的主选状态；几何仍从共享模型读取。
export function createSpatialEditor(api) {
  let active = null,
    activeDoor = null;
  const selected = () => (active === 'boundary' ? api.model().boundary : api.model().areas.find(a => a.id === active));
  // 选择门时先清除其他选择，同时激活边界属性面板。
  function selectDoor(id, redraw = true) {
    if (!api.model().boundary.doors?.some(d => d.id === id)) return;
    api.prepareDoor();
    active = 'boundary';
    activeDoor = id;
    if (redraw) api.render();
  }
  function select(id, event) {
    api.selectArea(id, event);
  }
  // 模型替换或删除后清除已失效的区域与门选择。
  function render() {
    if (activeDoor && !api.model().boundary.doors?.some(d => d.id === activeDoor)) activeDoor = null;
    if (active && !selected()) active = null;
  }

  return {
    selected,
    activeId: () => active,
    // 将门洞线段扩展一米边距，给 F 聚焦提供可见范围。
    doorBounds() {
      const b = api.model().boundary,
        d = b.doors?.find(x => x.id === activeDoor);
      if (!d) return null;
      const [p, q] = edgePoints(b, d.side, d.offset, d.offset + d.width);
      return {
        x: Math.min(p.x, q.x) - 1,
        y: Math.min(p.y, q.y) - 1,
        width: Math.abs(q.x - p.x) + 2,
        depth: Math.abs(q.y - p.y) + 2,
      };
    },
    selectDoor,
    doorId: () => activeDoor,

    // 切换主选区域时取消门子选择，避免属性面板混用两种对象。
    setActive(id) {
      active = id;
      activeDoor = null;
    },
    render,
    select,
    clear() {
      active = null;
      activeDoor = null;
    },
    // 汇总边界与区域角点，供视图计算整体范围。
    points() {
      return [...corners(api.model().boundary), ...api.model().areas.flatMap(corners)];
    },
  };
}
