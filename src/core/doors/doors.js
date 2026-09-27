export const SIDES = { top: '上边', bottom: '下边', left: '左边', right: '右边' };
export const DOOR_TYPES = {
  inbound: { label: '入库门', color: '#c9e4f5' },
  outbound: { label: '出库门', color: '#f7d9bc' },
  general: { label: '通用门', color: '#f9e6a8' },
};
// 门的位置是所选边上的偏移：上下边用宽度，左右边用深度，统一以米计。
export const edgeLength = (b, side) => (['top', 'bottom'].includes(side) ? b.width : b.depth);
/** @param {import('../contracts/layout-contract.js').Boundary} b
 * @param {import('../contracts/layout-contract.js').Door} d
 * @param {number} delta Movement along the edge, in metres.
 * @param {boolean} snap
 */
// 沿边移动后按 0.1 米吸附并限制在边内；这里只算偏移，门间重叠由提交时统一校验。
export function draggedDoorOffset(b, d, delta, snap = true) {
  let offset = d.offset + delta;
  if (snap) offset = Math.round(offset * 10) / 10;
  return Math.max(0, Math.min(edgeLength(b, d.side) - d.width, offset));
}
// 校验门身份、尺寸、边界范围及同边重叠；允许门端点恰好相接。
export function validateDoors(b) {
  const doors = b.doors || [];
  if (!Array.isArray(doors)) throw Error('门数据格式无效');
  const ids = new Set();
  for (const d of doors) {
    if (!d.id || ids.has(d.id)) throw Error('门标识重复');
    ids.add(d.id);
    if (typeof d.name !== 'string' || !d.name.trim()) throw Error('请填写门名称');
    if (!SIDES[d.side] || !DOOR_TYPES[d.type]) throw Error('门的位置或用途无效');
    if (
      !Number.isFinite(d.offset) ||
      !Number.isFinite(d.width) ||
      d.offset < 0 ||
      d.width < 0.5 ||
      d.offset + d.width > edgeLength(b, d.side) + 1e-8
    )
      throw Error(`${d.name}：门宽至少 0.5 米，且门必须完整位于所选边上`);
  }
  for (const side of Object.keys(SIDES)) {
    const sorted = doors.filter(d => d.side === side).sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].offset < sorted[i - 1].offset + sorted[i - 1].width - 1e-8)
        throw Error(`${SIDES[side]}的门相互重叠，请调整位置`);
  }
}
// 把沿边的一维起止偏移转换为地图世界坐标，供 2D 和 3D 共用。
export function edgePoints(b, side, start, end) {
  if (side === 'top' || side === 'bottom') {
    const y = b.y + (side === 'bottom' ? b.depth : 0);
    return [
      { x: b.x + start, y },
      { x: b.x + end, y },
    ];
  }
  const x = b.x + (side === 'right' ? b.width : 0);
  return [
    { x, y: b.y + start },
    { x, y: b.y + end },
  ];
}
// 按门偏移排序并从四条边扣除门洞，返回剩余墙段的端点。
export function wallSegments(b) {
  const result = [];
  for (const side of Object.keys(SIDES)) {
    let start = 0;
    for (const door of (b.doors || []).filter(d => d.side === side).sort((a, b) => a.offset - b.offset)) {
      if (door.offset > start) result.push(edgePoints(b, side, start, door.offset));
      start = door.offset + door.width;
    }
    if (start < edgeLength(b, side)) result.push(edgePoints(b, side, start, edgeLength(b, side)));
  }
  return result;
}
// 依次搜索下、上、左、右边的空隙；创建最多 3 米宽的新门，空间不足时抛错。
export function newDoor(b) {
  for (const side of ['bottom', 'top', 'left', 'right']) {
    const length = edgeLength(b, side),
      doors = (b.doors || []).filter(d => d.side === side).sort((a, b) => a.offset - b.offset);
    let start = 0;
    for (const stop of [
      ...doors.map(d => ({ offset: d.offset, end: d.offset + d.width })),
      { offset: length, end: length },
    ]) {
      if (stop.offset - start >= 0.5) {
        let i = 1;
        while ((b.doors || []).some(d => d.name === `门 ${i}`)) i++;
        return {
          id: crypto.randomUUID(),
          name: `门 ${i}`,
          side,
          type: 'general',
          offset: start,
          width: Math.min(3, stop.offset - start),
        };
      }
      start = stop.end;
    }
  }
  throw Error('边界上没有足够空间新增门');
}
