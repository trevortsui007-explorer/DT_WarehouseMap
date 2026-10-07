export const spaces = model => [model.boundary, ...(model.rooms || [])].filter(Boolean);
export const isRoom = object => object?.id === 'boundary' || Array.isArray(object?.doors);
export const doorOwner = (model, id) => spaces(model).find(room => room.doors?.some(door => door.id === id));

// 将多边形裁剪到轴向半平面；连续扣除房间覆盖，剩余面积才是真正的室外部分。
function clip(points, axis, limit, inside) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const av = inside * (a[axis] - limit) >= 0,
      bv = inside * (b[axis] - limit) >= 0;
    if (av) result.push(a);
    if (av !== bv) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      result.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return result;
}
const area = p =>
  Math.abs(
    p.reduce((sum, a, i) => {
      const b = p[(i + 1) % p.length];
      return sum + a.x * b.y - b.x * a.y;
    }, 0)
  ) / 2;

export function coveredByRooms(points, rooms) {
  let remaining = [points];
  for (const room of rooms) {
    const next = [];
    for (let polygon of remaining) {
      for (const [axis, limit, sign] of [
        ['x', room.x, 1],
        ['x', room.x + room.width, -1],
        ['y', room.y, 1],
        ['y', room.y + room.depth, -1],
      ]) {
        const outside = clip(polygon, axis, limit, -sign);
        if (area(outside) > 1e-8) next.push(outside);
        polygon = clip(polygon, axis, limit, sign);
        if (!polygon.length) break;
      }
    }
    remaining = next;
    if (!remaining.length) return true;
  }
  return !remaining.some(p => area(p) > 1e-8);
}
