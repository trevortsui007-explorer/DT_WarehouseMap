import { isFixture, validateFixture } from '../spatial/fixtures.js';
import { isRoom, spaces } from '../spatial/rooms.js';
import { validateDoors } from '../doors/doors.js';
import { corners, overlaps, validateArea } from '../spatial/spatial.js';
import { uid, slots, validate } from '../model/model.js';
// 计算旋转后对象集合的世界轴对齐外包矩形，长度单位为米；空集合返回零范围。
export function bounds(objects) {
  const points = objects.flatMap(corners);
  if (!points.length) return { x: 0, y: 0, width: 0, depth: 0 };
  const x = Math.min(...points.map(p => p.x)),
    y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, depth: Math.max(...points.map(p => p.y)) - y };
}
// crossing 为 true 时选相交对象（右向左框选），否则四角必须完全包含（左向右）。
export function boxSelect(objects, rect, crossing) {
  return objects
    .filter(o =>
      crossing
        ? overlaps(o, rect)
        : corners(o).every(
            p =>
              p.x >= rect.x - 1e-8 &&
              p.x <= rect.x + rect.width + 1e-8 &&
              p.y >= rect.y - 1e-8 &&
              p.y <= rect.y + rect.depth + 1e-8
          )
    )
    .map(o => o.id);
}
// 先绕世界坐标 pivot 旋转，再平移 dx/dy；返回浅拷贝，不修改原对象或嵌套货位。
export function transform(objects, dx, dy, degrees, pivot) {
  if (![dx, dy, degrees, pivot.x, pivot.y].every(Number.isFinite)) throw Error('请输入有效的移动距离、角度和基点');
  if (degrees % 360 && objects.some(isRoom)) throw Error('房间保持轴对齐，请取消选择房间后旋转');
  const a = (degrees * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return objects.map(o => ({
    ...o,
    x: pivot.x + (o.x - pivot.x) * c - (o.y - pivot.y) * s + dx,
    y: pivot.y + (o.x - pivot.x) * s + (o.y - pivot.y) * c + dy,
    rotation: (((o.rotation + degrees) % 360) + 360) % 360,
  }));
}
// 按是否具有列数区分货架与区域，复用领域校验；任一对象无效即抛错。
export function validateObjects(objects, model) {
  for (const o of objects) {
    if (isRoom(o)) {
      validateArea(o, true);
      validateDoors(o);
    } else if (isFixture(o)) validateFixture(o);
    else o.cols ? validate(o, model.racks) : validateArea(o);
  }
}
// 组合移动以外包矩形吸附 0.5 米网格，再尝试边/中心及角点；Alt 对应 disabled，直接保留位移。
export function snapMove(objects, others, dx, dy, tolerance, disabled = false) {
  if (disabled) return { dx, dy, guides: [] };
  const b = bounds(objects),
    moved = { ...b, x: b.x + dx, y: b.y + dy },
    guides = [];
  let outX = Math.round(moved.x * 2) / 2 - b.x,
    outY = Math.round(moved.y * 2) / 2 - b.y;
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? 'width' : 'depth',
      source = [moved[axis], moved[axis] + moved[size] / 2, moved[axis] + moved[size]];
    let best = null;
    for (const o of others) {
      const t = bounds([o]);
      for (const target of [t[axis], t[axis] + t[size] / 2, t[axis] + t[size]])
        for (const value of source) {
          const delta = target - value;
          if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta)))
            best = { delta, target };
        }
    }
    if (best) {
      if (axis === 'x') outX = dx + best.delta;
      else outY = dy + best.delta;
      guides.push({ axis, value: best.target });
    }
  }
  // Exact corner snaps take priority over projected edge/centre alignment.
  // 角点采用欧氏距离，在容差内优先于边线投影；tolerance 已由交互层从屏幕像素换算成米。
  let corner = null;
  for (const p of objects.flatMap(corners))
    for (const q of others.flatMap(corners)) {
      const ex = q.x - p.x - dx,
        ey = q.y - p.y - dy,
        d = Math.hypot(ex, ey);
      if (d <= tolerance && (!corner || d < corner.d)) corner = { d, dx: dx + ex, dy: dy + ey, q };
    }
  if (corner)
    return {
      dx: corner.dx,
      dy: corner.dy,
      guides: [
        { axis: 'x', value: corner.q.x },
        { axis: 'y', value: corner.q.y },
      ],
    };
  return { dx: outX, dy: outY, guides };
}
// 沿世界 X/Y 轴计算副本偏移：步长为组外包尺寸加净间距；行列包含原件，偏移列表排除原点。
export function arrayOffsets(objects, rows, cols, gapX, gapY) {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows < 1 ||
    cols < 1 ||
    rows > 20 ||
    cols > 20 ||
    ![gapX, gapY].every(v => Number.isFinite(v) && v >= 0 && v <= 100)
  )
    throw Error('行列为 1–20，净间距为 0–100 米');
  if (!objects.length) throw Error('请先选择货架或区域');
  if ((rows * cols - 1) * objects.length > 200) throw Error('一次最多新增 200 个对象，请减少行列数');
  const b = bounds(objects),
    result = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (r || c) result.push({ dx: c * (b.width + gapX), dy: r * (b.depth + gapY) });
  return result;
}
// 深拷贝对象并创建新身份；复制货架时重建货位并避开编码冲突，不复制区域的外部绑定关系。
export function copies(objects, offsets, model) {
  if (objects.some(o => o.id === 'boundary')) throw Error('主边界不能复制，请取消选择主边界');
  const names = new Set([...model.racks, ...model.areas, ...(model.fixtures || []), ...spaces(model)].map(o => o.name)),
    codes = new Set(model.racks.flatMap(r => r.slots.map(s => s.code)));
  const result = [];
  for (const offset of offsets)
    for (const o of objects) {
      let n = 1,
        name;
      do {
        name = `${o.name}-副本${n++}`;
      } while (names.has(name));
      const copy = { ...structuredClone(o), id: uid(), name, x: o.x + offset.dx, y: o.y + offset.dy };
      if (isRoom(copy)) copy.doors = copy.doors.map(door => ({ ...door, id: uid() }));
      if (copy.cols) {
        copy.slots = slots(copy);
        while (copy.slots.some(s => codes.has(s.code))) {
          copy.name = `${o.name}-副本${n++}`;
          if (names.has(copy.name)) continue;
          copy.slots = slots(copy);
        }
        copy.slots.forEach(s => codes.add(s.code));
      }
      names.add(copy.name);
      result.push(copy);
    }
  validateObjects(result, model);
  return result;
}
