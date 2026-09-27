// 这些运行态字段不能进入布局草稿、快照或发布版本，包括旧版示例 cartons。
export const RUNTIME_FIELDS = new Set([
  'cartons',
  'virtualAreas',
  'palletCount',
  'huCount',
  'outerBoxCount',
  'occupancyStatus',
  'lockStatus',
  'taskStatus',
  'runtimeUpdatedAt',
  'skuSummary',
]);

// Applied at every layout ingestion boundary, including legacy snapshots.
// JSON replacer 对每一层字段生效；返回 undefined 会省略对象属性，同时得到独立的 JSON 数据副本。
export function withoutRuntime(input) {
  return JSON.parse(JSON.stringify(input, (key, value) => (RUNTIME_FIELDS.has(key) ? undefined : value)));
}
