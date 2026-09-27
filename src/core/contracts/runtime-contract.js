/**
 * @typedef {Object} LocationRuntime
 * @property {string} locationCode Stable business identity.
 * @property {number} huCount
 * @property {number} outerBoxCount
 * @property {Object|null} skuSummary
 * @property {'EMPTY'|'OCCUPIED'|'UNKNOWN'} occupancyStatus
 * @property {string} lockStatus NORMAL or a WMS-defined non-normal lock state.
 * @property {string|null} taskStatus
 * @property {string|null} updatedAt
 * @property {number|string|null} version Per-location optional revision, distinct from stream sequence.
 */
/**
 * @typedef {Object} RuntimeSnapshot
 * @property {string} warehouseCode
 * @property {number} sequence Contiguous warehouse stream; safe JS integer.
 * @property {string} generatedAt ISO date/time.
 * @property {LocationRuntime[]} locations Complete scope; missing locations remain unknown.
 * @property {Object<string, VirtualAreaRuntime>} [virtualAreas] Keyed by WMS virtualLocationCode.
 */
// 运行态独立于 Layout；缺失货位状态表示未知，不能把未知库存自动显示为零。
export {};

/**
 * @typedef {Object} VirtualAreaRuntime
 * @property {number} huCount Additive: a HU has exactly one current Virtual Location at a time.
 * @property {number} palletCount
 * @property {number} outerBoxCount
 * @property {string|null} updatedAt
 * Summary only; HU/product/task detail is fetched on demand through the Runtime Repository.
 */
