import {
  emptyResources,
  validateResources,
  markResourcesForReview,
  projectBackup,
} from '../../../core/workspace/resources.js';
import { validateLayout } from '../../../core/model/layout-validation.js';
import { LAYOUT_ID, draftRecord } from './schema.js';
import { migrateLayoutSchema4 } from './migrations/layout-schema-4.js';

/** @returns {import('../../../application/persistence/workspace-contract.js').WorkspaceRepository} */
// 实现工作区 Repository，封装 Dexie 事务与历史维护，让应用层仅依赖异步接口。
export function createIndexedDbWorkspaceRepository(
  database,
  { initialize = async () => {}, workspaceId = LAYOUT_ID, ownsConnection = true } = {}
) {
  let initialized;
  // ??= 复用进行中的初始化 Promise；失败清空缓存允许重试，成功后不反复迁移。
  async function ready() {
    initialized ??= initialize()
      .then(() => migrateLayoutSchema4(database))
      .catch(error => {
        initialized = undefined;
        throw error;
      });
    await initialized;
  }
  // 按历史顺序批量读取快照正文，缺失快照直接报错，不静默丢弃恢复记录。
  async function entries() {
    const rows = await database.history.where('layoutId').equals(workspaceId).sortBy('order');
    const snapshots = await database.snapshots.bulkGet(rows.map(row => row.snapshotId));
    return rows.map((row, index) => {
      const snapshot = snapshots[index];
      if (!snapshot) throw Error('本机历史快照缺失，请重试或导入备份');
      return { id: row.id, at: row.at, label: row.label, model: validateLayout(snapshot.data) };
    });
  }
  // 迁移完成后读取当前草稿，并通过统一布局校验才交给应用。
  async function load() {
    await ready();
    const draft = await database.drafts.get(workspaceId);
    return draft ? { model: validateLayout(draft.data), savedAt: draft.updatedAt } : null;
  }
  // 一致性读取近期历史和迁移归档；迁移归档不受最近 20 条历史上限影响。
  async function history() {
    await ready();
    return database.transaction('r', database.history, database.snapshots, async () => {
      const recent = await entries(),
        ids = new Set(recent.map(entry => entry.id));
      // Migrated recovery copies are retained independently of the rolling 20-entry history.
      const archived = (await database.snapshots.where('layoutId').equals(workspaceId).toArray()).filter(
        snapshot => snapshot.kind === 'legacy' && !ids.has(snapshot.id)
      );
      return [
        ...recent,
        ...archived.map(snapshot => ({
          id: snapshot.id,
          at: snapshot.at,
          label: '迁移保留 · ' + snapshot.label,
          model: validateLayout(snapshot.data),
        })),
      ];
    });
  }
  // 草稿、历史索引和快照在同一个 rw 事务中更新，任何步骤失败均回滚。
  async function save(model, label = '自动备份', before, incomingResources) {
    await ready();
    const current = validateLayout(model),
      backup = before ? validateLayout(before) : null;
    return database.transaction(
      'rw',
      database.drafts,
      database.history,
      database.snapshots,
      database.localResources,
      database.projectBackups,
      database.workspaces,
      database.projects,
      async () => {
        const previous = (await database.localResources.get(workspaceId))?.data || emptyResources();
        if (backup) {
          const workspace = await database.workspaces.get(workspaceId);
          const project = workspace ? await database.projects.get(workspace.projectId) : null;
          const names = workspace && project ? { projectName: project.name, schemeName: workspace.name } : undefined;
          await database.projectBackups.put({
            id: crypto.randomUUID(),
            layoutId: workspaceId,
            at: new Date().toISOString(),
            data: projectBackup(backup, previous, names),
          });
          await database.localResources.put({
            layoutId: workspaceId,
            data: incomingResources ? validateResources(incomingResources) : markResourcesForReview(previous),
          });
        }
        const old = await database.drafts.get(workspaceId);
        let history = await entries();
        const snapshot = (data, title) => ({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          label: title,
          model: structuredClone(data),
        });
        if (backup) history = [snapshot(backup, '替换前备份'), ...history];
        else if (old && JSON.stringify(old.data) !== JSON.stringify(current))
          history = [snapshot(old.data, '上次保存'), ...history];
        history = [snapshot(current, label), ...history].slice(0, 20);
        const existing = await database.snapshots.where('layoutId').equals(workspaceId).toArray();
        const keep = new Set(history.map(entry => entry.id));
        await database.drafts.put(draftRecord(current, new Date().toISOString(), workspaceId));
        await database.history.where('layoutId').equals(workspaceId).delete();
        await database.snapshots.bulkDelete(
          existing.filter(item => item.kind !== 'legacy' && !keep.has(item.id)).map(item => item.id)
        );
        const existingById = new Map(existing.map(item => [item.id, item]));
        for (const [order, entry] of history.entries()) {
          const prior = existingById.get(entry.id);
          await database.snapshots.put({
            id: entry.id,
            layoutId: workspaceId,
            kind: prior?.kind || 'history',
            at: entry.at,
            label: entry.label,
            data: entry.model,
          });
          await database.history.put({
            id: entry.id,
            layoutId: workspaceId,
            order,
            snapshotId: entry.id,
            at: entry.at,
            label: entry.label,
          });
        }
        await database.workspaces.update(workspaceId, { updatedAt: new Date().toISOString() });
        return { savedAt: new Date().toISOString() };
      }
    );
  }
  return {
    ready,
    workspaceId,
    forWorkspace: id =>
      createIndexedDbWorkspaceRepository(database, { initialize: ready, workspaceId: id, ownsConnection: false }),
    load,
    save,
    history,
    async loadResources() {
      await ready();
      return validateResources((await database.localResources.get(workspaceId))?.data || emptyResources());
    },
    async saveResources(_layoutId, resources) {
      await ready();
      await database.transaction('rw', database.localResources, database.workspaces, async () => {
        await database.localResources.put({ layoutId: workspaceId, data: validateResources(resources) });
        await database.workspaces.update(workspaceId, { updatedAt: new Date().toISOString() });
      });
    },
    async replaceProject(backup, before) {
      const validated = projectBackup(backup.layout, backup.resources);
      return save(validated.layout, '导入项目备份', before, validated.resources);
    },
    async listProjectRecoveries() {
      await ready();
      return (await database.projectBackups.where('layoutId').equals(workspaceId).toArray()).map(row => ({
        id: row.id,
        at: row.at,
      }));
    },
    async getProjectRecovery(id) {
      await ready();
      const row = await database.projectBackups.get(id);
      if (!row || row.layoutId !== workspaceId) throw Error('项目恢复包不存在');
      return projectBackup(row.data.layout, row.data.resources, row.data.names);
    },
    // 按服务范围和布局读取并发检查点，避免不同服务共用修订基线。
    async getRemoteState(scope) {
      await ready();
      return (
        (
          await database.meta.get(
            (workspaceId === LAYOUT_ID ? 'remote:' : 'remote-workspace:' + workspaceId + ':') + scope
          )
        )?.value || null
      );
    },
    // 单独保存远程同步元数据，不将它混入布局几何或会话 Undo。
    async setRemoteState(scope, value) {
      await ready();
      await database.meta.put({
        key: (workspaceId === LAYOUT_ID ? 'remote:' : 'remote-workspace:' + workspaceId + ':') + scope,
        value,
      });
    },
    close: () => {
      if (ownsConnection) database.close();
    },
  };
}
