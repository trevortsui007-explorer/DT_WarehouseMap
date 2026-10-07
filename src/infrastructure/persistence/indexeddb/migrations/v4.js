import { validateLayout } from '../../../../core/model/layout-validation.js';
import { validateResources, emptyResources, parseProjectBackup } from '../../../../core/workspace/resources.js';
// 结构升级和数据收纳分开；失败不写标记，下一次载入可以重试。
export async function migrateWorkspaceCatalog(db) {
  await db.transaction(
    'rw',
    db.projects,
    db.workspaces,
    db.drafts,
    db.history,
    db.snapshots,
    db.localResources,
    db.projectBackups,
    db.meta,
    async () => {
      if (await db.meta.get('workspace-catalog-v4')) return;
      const draft = await db.drafts.get('main');
      if (!draft) return;
      const model = validateLayout(draft.data);
      for (const snapshot of await db.snapshots.where('layoutId').equals('main').toArray())
        validateLayout(snapshot.data);
      for (const entry of await db.history.where('layoutId').equals('main').toArray()) {
        if (!(await db.snapshots.get(entry.snapshotId))) throw Error('旧工作区历史快照缺失，尚未迁移');
      }
      const source = await db.localResources.get(model.layoutId);
      const resources = validateResources(source?.data || emptyResources());
      if (model.layoutId !== 'main' && (await db.localResources.get('main')))
        throw Error('本机资源归属冲突，旧数据已保留');
      await db.localResources.put({ layoutId: 'main', data: resources });
      for (const recovery of await db.projectBackups.where('layoutId').equals(model.layoutId).toArray()) {
        parseProjectBackup(JSON.stringify(recovery.data));
        await db.projectBackups.put({ ...recovery, layoutId: 'main' });
      }
      const projectId = 'legacy-project',
        at = draft.updatedAt || new Date().toISOString();
      await db.projects.add({ projectId, name: model.boundary.name || '成品仓', createdAt: at });
      await db.workspaces.add({
        workspaceId: 'main',
        projectId,
        name: '现状方案',
        remoteEligible: true,
        updatedAt: at,
      });
      const readback = await db.localResources.get('main');
      if (JSON.stringify(readback.data) !== JSON.stringify(resources) || !(await db.workspaces.get('main')))
        throw Error('目录迁移读回校验失败');
      await db.meta.put({ key: 'workspace-catalog-v4', value: true });
      // 不删除原资源备份；未知归属的数据保留，不猜测其用途。
    }
  );
}
