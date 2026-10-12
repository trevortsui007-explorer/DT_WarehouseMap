import { migrateWorkspaceCatalog } from './migrations/v4.js';
import { workspaceName, blankLayout } from '../../../core/workspace/projects.js';
import { emptyResources, projectBackup } from '../../../core/workspace/resources.js';
import { draftRecord } from './schema.js';
import { validateLayout } from '../../../core/model/layout-validation.js';

// 目录和方案正文在同一数据库事务中创建，方案仓库始终绑定不可变 workspaceId。
export function createWorkspaceCatalog(db, root) {
  const ready = async () => {
    await root.ready();
    await migrateWorkspaceCatalog(db);
  };
  async function info(workspaceId) {
    await ready();
    const workspace = await db.workspaces.get(workspaceId);
    if (!workspace) throw Error('方案不存在');
    const project = await db.projects.get(workspace.projectId);
    if (!project) throw Error('地图项目目录缺失');
    return { ...workspace, projectName: project.name };
  }
  async function create({ name, model, resources, projectId, schemeName = '现状方案' }) {
    await ready();
    const clean = projectBackup(model, resources),
      workspaceId = crypto.randomUUID(),
      at = new Date().toISOString();
    const existingProject = projectId;
    projectId ||= crypto.randomUUID();
    name = workspaceName(name);
    schemeName = workspaceName(schemeName);
    await db.transaction(
      'rw',
      db.projects,
      db.workspaces,
      db.drafts,
      db.history,
      db.snapshots,
      db.localResources,
      async () => {
        if (existingProject) {
          if (!(await db.projects.get(projectId))) throw Error('地图项目不存在');
          if ((await db.workspaces.where('projectId').equals(projectId).toArray()).some(row => row.name === schemeName))
            throw Error('本地图内已有同名方案');
        } else await db.projects.add({ projectId, name, createdAt: at });
        await db.workspaces.add({ workspaceId, projectId, name: schemeName, updatedAt: at, remoteEligible: false });
        await db.drafts.add(draftRecord(clean.layout, at, workspaceId));
        await db.localResources.add({ layoutId: workspaceId, data: clean.resources });
        const id = crypto.randomUUID();
        await db.snapshots.add({
          id,
          layoutId: workspaceId,
          kind: 'history',
          at,
          label: '初始方案',
          data: clean.layout,
        });
        await db.history.add({ id, layoutId: workspaceId, snapshotId: id, order: 0, at, label: '初始方案' });
      }
    );
    return workspaceId;
  }
  return {
    ready,
    info,
    repository: id => root.forWorkspace(id),
    // 身份切换、原方案恢复包、修订基线和工作区标记必须一起落盘。
    async connectRemote(id, scope, uploaded, draft, pendingKey) {
      await ready();
      const prefix = id === 'main' ? 'remote:' : 'remote-workspace:' + id + ':';
      await db.transaction(
        'rw',
        db.workspaces,
        db.projects,
        db.drafts,
        db.localResources,
        db.projectBackups,
        db.meta,
        async () => {
          const workspace = await db.workspaces.get(id);
          const previous = await db.drafts.get(id);
          if (!workspace || !previous || workspace.remoteEligible) throw Error('本机工作区状态已变化，请重新打开方案');
          if (previous.data.layoutId !== uploaded.layoutId) throw Error('本机布局身份已变化，未连接服务器');
          const project = await db.projects.get(workspace.projectId);
          const resources = (await db.localResources.get(id))?.data || emptyResources();
          await db.projectBackups.add({
            id: crypto.randomUUID(),
            layoutId: id,
            at: new Date().toISOString(),
            data: projectBackup(previous.data, resources, { projectName: project.name, schemeName: workspace.name }),
          });
          const layout = validateLayout({ ...previous.data, layoutCode: uploaded.layoutCode });
          await db.drafts.put(draftRecord(layout, new Date().toISOString(), id));
          await db.workspaces.update(id, {
            remoteEligible: true,
            remoteScope: scope,
            remoteLayoutCode: uploaded.layoutCode,
          });
          await db.meta.put({
            key: prefix + scope + ':' + uploaded.layoutCode,
            value: {
              draftRevision: draft.draftRevision,
              basedOnPublishedVersion: draft.basedOnPublishedVersion,
              synced: JSON.stringify(uploaded),
              pendingPublication: null,
            },
          });
          if (pendingKey) await db.meta.delete(prefix + pendingKey);
        }
      );
    },
    async list() {
      await ready();
      const projects = await db.projects.toArray(),
        workspaces = await db.workspaces.toArray();
      return projects.map(project => ({
        ...project,
        workspaces: workspaces
          .filter(row => row.projectId === project.projectId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      }));
    },
    async last() {
      await ready();
      const id = (await db.meta.get('preference:lastWorkspaceId'))?.value;
      return id && (await db.workspaces.get(id)) ? id : 'main';
    },
    async remember(id) {
      await info(id);
      await db.meta.put({ key: 'preference:lastWorkspaceId', value: id });
    },
    async createMap({ name, width = 30, depth = 20 }) {
      return create({ name, model: blankLayout(name, width, depth), resources: emptyResources() });
    },
    async copy(id, name) {
      const current = await info(id),
        repo = root.forWorkspace(id),
        loaded = await repo.load();
      if (!loaded) throw Error('原方案草稿缺失');
      const resources = await repo.loadResources();
      resources.surveys.forEach(record => {
        record.needsReview = true;
      });
      return create({
        name: current.projectName,
        projectId: current.projectId,
        schemeName: name,
        model: loaded.model,
        resources,
      });
    },
    async importProject(backup) {
      return create({
        name: backup.names?.projectName || '导入地图',
        schemeName: backup.names?.schemeName || '现状方案',
        model: backup.layout,
        resources: backup.resources,
      });
    },
    async renameProject(projectId, name) {
      await ready();
      name = workspaceName(name);
      if (!(await db.projects.update(projectId, { name }))) throw Error('地图项目不存在');
    },
    async renameWorkspace(id, name) {
      const current = await info(id);
      name = workspaceName(name);
      await db.transaction('rw', db.workspaces, async () => {
        if (
          (await db.workspaces.where('projectId').equals(current.projectId).toArray()).some(
            row => row.workspaceId !== id && row.name === name
          )
        )
          throw Error('本地图内已有同名方案');
        await db.workspaces.update(id, { name, updatedAt: new Date().toISOString() });
      });
    },
  };
}
