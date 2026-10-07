import { withoutRuntime } from './layout-runtime-separation.js';
// 内部对象 ID 使用 UUID；它与 WMS 货位编码是两种身份，移动或旋转时不应重建。
export const uid = () => crypto.randomUUID();
/** @param {import('../contracts/layout-contract.js').Rack} r
 * @param {import('../contracts/layout-contract.js').Slot[]} old
 * @returns {import('../contracts/layout-contract.js').Slot[]}
 */
// 按层列生成货位；已有层列复用原对象，保留 ID 与业务编码，仅为空位生成新身份。
export function slots(r, old = []) {
  return Array.from({ length: r.levels * r.cols }, (_, i) => {
    const level = Math.floor(i / r.cols) + 1,
      col = (i % r.cols) + 1;
    return (
      old.find(s => s.level === level && s.col === col) || {
        id: uid(),
        level,
        col,
        code: `${r.name}-${String(col).padStart(2, '0')}-${level}`,
      }
    );
  });
}
// 生成示例布局几何，不生成库存；正式远程加载失败不能用它冒充服务器布局。
export function seed() {
  const racks = [];
  for (let i = 0; i < 18; i++) {
    const fgCode = i % 2 ? 'FG02' : 'FG01',
      r = {
        id: uid(),
        spaceId: 'main',
        fgCode,
        name: `R-${String(i + 1).padStart(2, '0')}`,
        x: 3 + (i % 3) * 10,
        y: 4 + Math.floor(i / 3) * 4,
        cols: 6,
        levels: 1 + (i % 3),
        width: 1.35,
        depth: 1.4,
        levelHeight: 1.5,
        rotation: 0,
      };
    r.slots = slots(r);
    racks.push(r);
  }
  return {
    schemaVersion: 6,
    areaBindings: [],
    rooms: [],
    fixtures: [],
    layoutId: 'main',
    layoutCode: 'MAIN',
    warehouseCode: null,
    floorNo: null,
    racks,
  };
}
export const fgColor = code => (code === 'FG01' ? '#a8d5f0' : code === 'FG02' ? '#f5bf8e' : '#f9e6a8');
// 返回剥离运行态后的 v6 布局副本；不支持的输入返回 null，完整合法性由 validateLayout 校验。
export function migrate(saved) {
  if (!saved) return null;
  if (![1, 2, 3, 4, 5, 6].includes(saved.schemaVersion) || !Array.isArray(saved.racks)) return null;
  const result = withoutRuntime(saved);
  delete result.underlay;
  delete result.surveys;
  delete result.resources;
  result.schemaVersion = 6;
  if (saved.schemaVersion < 6) result.fixtures ??= [];
  if (saved.schemaVersion < 5) result.rooms ??= [];
  // ??= 仅在字段为 null 或 undefined 时补默认值；已有绑定不会因迁移被覆盖。
  if (saved.schemaVersion < 4) result.areaBindings ??= [];
  result.layoutId ??= 'main';
  result.layoutCode ??= 'MAIN';
  result.warehouseCode ??= null;
  result.floorNo ??= null;
  if (saved.schemaVersion === 1)
    result.racks.forEach(r => {
      r.spaceId = 'main';
      r.fgCode = r.zone === 'B' ? 'FG02' : 'FG01';
      delete r.zone;
    });
  return result;
}
// 校验单个货架的名称、尺寸与层列范围；抛错交给调用方阻止提交。
export function validate(r, racks) {
  if (!r.name.trim()) throw Error('请填写货架名称');
  for (const key of ['x', 'y', 'cols', 'levels', 'width', 'depth', 'levelHeight', 'rotation'])
    if (!Number.isFinite(r[key])) throw Error('请输入有效数值');
  if (
    r.cols < 1 ||
    r.cols > 30 ||
    !Number.isInteger(r.cols) ||
    r.levels < 1 ||
    r.levels > 3 ||
    !Number.isInteger(r.levels)
  )
    throw Error('列数为 1–30，层数为 1–3');
  if (r.width < 0.3 || r.width > 5 || r.depth < 0.3 || r.depth > 5 || r.levelHeight < 0.3 || r.levelHeight > 5)
    throw Error('尺寸需在 0.3–5 米之间');
  if (Math.abs(r.x) > 200 || Math.abs(r.y) > 200) throw Error('坐标需在 -200 至 200 米之间');
  if (racks.some(x => x.id !== r.id && x.name === r.name)) throw Error('货架名称不能重复');
}
