import { spaces, coveredByRooms } from './rooms.js';
export const AREA_COLORS = ['#fff0bf', '#d9edf9', '#fbe0c6', '#e4efdf', '#eee3f4'];
export const AREA_TYPES = {
  general: { label: '通用区域', color: '#e4efdf', stroke: '#91a68a' },
  aisle: { label: '通道', color: '#fff0bf', stroke: '#c7a34b' },
  inbound: { label: '入库暂存区', color: '#d9edf9', stroke: '#77a8c3' },
  outbound: { label: '出库暂存区', color: '#fbe0c6', stroke: '#c69a72' },
};
// 以对象局部原点旋转四角，再平移到世界坐标；货架总宽度为列数乘单列宽度。
export function corners(r) {
  const a = ((r.rotation || 0) * Math.PI) / 180,
    w = r.cols ? r.cols * r.width : r.width,
    d = r.depth;
  return [
    [0, 0],
    [w, 0],
    [w, d],
    [0, d],
  ].map(([x, y]) => ({ x: r.x + x * Math.cos(a) - y * Math.sin(a), y: r.y + x * Math.sin(a) + y * Math.cos(a) }));
}
// 分离轴检测旋转矩形：任一边法线上的投影分离即可判定不重叠；仅接触边缘不算占用。
export function overlaps(a, b) {
  const pa = corners(a),
    pb = corners(b);
  for (const p of [pa, pb])
    for (let i = 0; i < 4; i++) {
      const q = p[(i + 1) % 4],
        axis = { x: -(q.y - p[i].y), y: q.x - p[i].x };
      const av = pa.map(v => v.x * axis.x + v.y * axis.y),
        bv = pb.map(v => v.x * axis.x + v.y * axis.y);
      if (Math.max(...av) <= Math.min(...bv) + 1e-8 || Math.max(...bv) <= Math.min(...av) + 1e-8) return false;
    }
  return true;
}
// 校验区域或边界的名称、尺寸和坐标；仓库边界额外要求旋转角为零。
export function validateArea(a, boundary = false) {
  if (typeof a.name !== 'string' || !a.name.trim()) throw Error('请填写名称');
  if (!boundary && !AREA_TYPES[a.type]) throw Error('区域类型无效');
  for (const k of ['x', 'y', 'width', 'depth', 'rotation']) if (!Number.isFinite(a[k])) throw Error('请输入有效数值');
  if (a.width < 0.5 || a.depth < 0.5 || a.width > 400 || a.depth > 400) throw Error('长宽需在 0.5–400 米之间');
  if (Math.abs(a.x) > 200 || Math.abs(a.y) > 200) throw Error('坐标需在 -200 至 200 米之间');
  if (a.color !== undefined && !AREA_COLORS.includes(a.color)) throw Error('请选择预设淡色');
  if (boundary && a.rotation !== 0) throw Error('矩形仓库边界暂不支持旋转');
}
// 为缺少空间结构的旧布局原地补充边界和空区域列表；已有完整空间结构直接复用。
export function ensureSpatial(model) {
  if (model.boundary && Array.isArray(model.areas)) return model;
  const points = model.racks.flatMap(corners),
    minX = Math.min(0, ...points.map(p => p.x)) - 2,
    minY = Math.min(0, ...points.map(p => p.y)) - 2,
    maxX = Math.max(33, ...points.map(p => p.x)) + 3,
    maxY = Math.max(26, ...points.map(p => p.y)) + 3;
  model.boundary = {
    id: 'boundary',
    name: '成品仓边界',
    x: minX,
    y: minY,
    width: Math.min(400, maxX - minX),
    depth: Math.min(400, maxY - minY + 8),
    rotation: 0,
  };
  model.areas = [];
  return model;
}
// 根据边界生成通道和暂存区示例，返回新对象，由调用方决定是否加入布局。
export function defaultAreas(model) {
  const b = model.boundary,
    y = b.y + b.depth - 7;
  return [
    {
      id: crypto.randomUUID(),
      name: '主通道',
      type: 'aisle',
      x: b.x + 1,
      y: y - 3,
      width: b.width - 2,
      depth: 2.5,
      rotation: 0,
    },
    { id: crypto.randomUUID(), name: '入库暂存区', type: 'inbound', x: b.x + 2, y, width: 10, depth: 5, rotation: 0 },
    {
      id: crypto.randomUUID(),
      name: '出库暂存区',
      type: 'outbound',
      x: b.x + 15,
      y,
      width: 12,
      depth: 5,
      rotation: 0,
    },
  ];
}
// 生成越界和货架占用区域的提示列表；这些警告不在此处阻止编辑或修改几何。
export function spatialWarnings(model) {
  const result = [];
  for (const o of [...model.racks, ...model.areas, ...(model.fixtures || [])]) {
    if (o.type !== 'aisle' && !coveredByRooms(corners(o), spaces(model)))
      result.push({ id: o.id, text: `${o.name} 超出仓库边界` });
  }
  for (const r of model.racks)
    for (const a of model.areas)
      if (a.type !== 'general' && overlaps(r, a)) result.push({ id: r.id, text: `${r.name} 占用${a.name}` });
  for (const fixture of model.fixtures || [])
    for (const object of [...model.racks, ...model.areas.filter(area => area.type !== 'general')])
      if (overlaps(fixture, object)) result.push({ id: object.id, text: `${object.name} 与设施 ${fixture.name} 重叠` });
  return result;
}
