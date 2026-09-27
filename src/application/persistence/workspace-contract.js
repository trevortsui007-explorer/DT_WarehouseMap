/**
 * One workspace repository keeps draft/history/before-replacement snapshots atomic.
 * Editor session undo/redo is deliberately not part of this contract.
 * @typedef {Object} WorkspaceRepository
 * @property {function(): Promise<{model: Object, savedAt: string}|null>} load
 * @property {function(Object, string, Object=): Promise<unknown>} save
 * @property {function(): Promise<Array<{id:string, at:string, label:string, model:Object}>>} history
 * @property {function(): void} [close]
 */
// save 的可选 before 参数用于替换前备份；草稿与恢复快照必须一起成功，且不包含 Runtime。
export {};
