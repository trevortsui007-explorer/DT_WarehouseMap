// 固定设施只有几何身份，不生成货位或运行态。
export const FIXTURE_TYPES = {
  cabinet: { label: '电柜', color: '#d9e4ee', stroke: '#849cad' },
  pillar: { label: '柱子', color: '#e1dfd6', stroke: '#99978c' },
  other: { label: '其他设施', color: '#eadff1', stroke: '#a595ae' },
};
export const isFixture = object => !!object && Object.hasOwn(FIXTURE_TYPES, object.type);
export function validateFixture(object) {
  if (!isFixture(object) || typeof object.name !== 'string' || !object.name.trim()) throw Error('设施名称或类型无效');
  for (const key of ['x', 'y', 'width', 'depth', 'height', 'rotation'])
    if (!Number.isFinite(object[key])) throw Error('设施数值无效');
  if (Math.abs(object.x) > 200 || Math.abs(object.y) > 200) throw Error('设施坐标需在 -200 至 200 米之间');
  if (['width', 'depth', 'height'].some(key => object[key] < 0.05 || object[key] > 400))
    throw Error('设施尺寸需在 0.05–400 米之间');
}
