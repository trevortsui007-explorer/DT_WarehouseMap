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
/**
 * 本机资源 Repository 扩展，独立于布局历史和服务端发布契约。
 * loadResources(layoutId) / saveResources(layoutId, {underlay, surveys})
 * replaceProject(backup, beforeLayout)：新草稿、资源及替换前完整恢复包原子提交。
 * listProjectRecoveries(layoutId) / getProjectRecovery(id)：恢复包不受普通 20 条布局历史轮转影响。
 */

/**
 * 多方案扩展：forWorkspace(workspaceId) 返回永久绑定此分区的仓库。
 * load/save/history/resources/recovery 均只操作该方案；data.layoutId 保持真实 Layout 身份。
 * catalog 管理项目和方案目录，切换不能通过修改共享仓库的当前 ID 实现。
 */
