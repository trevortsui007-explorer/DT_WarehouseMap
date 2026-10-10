import { bounds } from './cad-geometry.js';
// 世界轴外接边缘对齐，不额外吸附网格；只输出新坐标。
export function alignObjects(objects, reference, mode, gap = 0) {
  if (objects.length < 2 && !reference) throw Error('请至少选择两个对象');
  if (mode.startsWith('beside') && !reference) throw Error('靠边留距需要指定基准对象');
  if (!Number.isFinite(gap) || gap < 0) throw Error('净间距必须为非负数');
  const moving = reference ? objects.filter(o => o.id !== reference.id) : objects;
  if (!moving.length) throw Error('至少选择一个基准以外的移动对象');
  const ref = bounds(reference ? [reference] : objects);
  const modes = [
    'left',
    'right',
    'top',
    'bottom',
    'centerX',
    'centerY',
    'besideRight',
    'besideLeft',
    'besideTop',
    'besideBottom',
    'distributeX',
    'distributeY',
  ];
  if (!modes.includes(mode)) throw Error('未知对齐方式');
  if (mode.startsWith('distribute')) {
    if (objects.length < 3) throw Error('等间距需要至少选中三个对象');
    const axis = mode === 'distributeX' ? 'x' : 'y',
      size = axis === 'x' ? 'width' : 'depth';
    const sorted = objects.map(o => ({ o, b: bounds([o]) })).sort((a, b) => a.b[axis] - b.b[axis]);
    const first = sorted[0],
      last = sorted.at(-1);
    const spacing =
      (last.b[axis] + last.b[size] - first.b[axis] - sorted.reduce((n, item) => n + item.b[size], 0)) /
      (sorted.length - 1);
    if (spacing < -1e-8) throw Error('首尾之间空间不足，请先拉开距离');
    let cursor = first.b[axis];
    return sorted.map(({ o, b }) => {
      const result = { ...o, [axis]: o[axis] + cursor - b[axis] };
      cursor += b[size] + Math.max(0, spacing);
      return result;
    });
  }
  return moving.map(o => {
    const b = bounds([o]);
    let dx = 0,
      dy = 0;
    if (mode === 'left') dx = ref.x - b.x;
    if (mode === 'right') dx = ref.x + ref.width - b.x - b.width;
    if (mode === 'top') dy = ref.y - b.y;
    if (mode === 'bottom') dy = ref.y + ref.depth - b.y - b.depth;
    if (mode === 'centerX') dx = ref.x + ref.width / 2 - b.x - b.width / 2;
    if (mode === 'centerY') dy = ref.y + ref.depth / 2 - b.y - b.depth / 2;
    if (mode === 'besideRight') dx = ref.x + ref.width + gap - b.x;
    if (mode === 'besideLeft') dx = ref.x - gap - b.x - b.width;
    if (mode === 'besideTop') dy = ref.y - gap - b.y - b.depth;
    if (mode === 'besideBottom') dy = ref.y + ref.depth + gap - b.y;
    return { ...o, x: o.x + dx, y: o.y + dy };
  });
}
