import { validateLayout } from '../model/layout-validation.js';
export function workspaceName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100)
    throw Error('名称不能为空或超过 100 字符');
  return value.trim();
}
// 新地图是空白几何，不生成演示货架或运行态；本地名称与业务布局身份分开。
export function blankLayout(name, width = 30, depth = 20) {
  const layoutId = crypto.randomUUID();
  return validateLayout({
    schemaVersion: 6,
    layoutId,
    layoutCode: 'LOCAL-' + layoutId,
    warehouseCode: null,
    floorNo: null,
    racks: [],
    areas: [],
    rooms: [],
    fixtures: [],
    areaBindings: [],
    boundary: {
      id: 'boundary',
      name: workspaceName(name),
      x: 0,
      y: 0,
      width: Number(width),
      depth: Number(depth),
      rotation: 0,
      doors: [],
    },
  });
}
