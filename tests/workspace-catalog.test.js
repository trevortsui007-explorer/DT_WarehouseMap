import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, test, vi } from 'vitest';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { createIndexedDbWorkspaceRepository } from '../src/infrastructure/persistence/indexeddb/workspace-repository.js';
import { createWorkspaceCatalog } from '../src/infrastructure/persistence/indexeddb/workspace-catalog.js';
import { STORES_V3 } from '../src/infrastructure/persistence/indexeddb/schema.js';
import { blankLayout } from '../src/core/workspace/projects.js';
import { projectBackup, emptyResources, parseProjectBackup } from '../src/core/workspace/resources.js';
import { createWorkspaceController } from '../src/application/workspace/workspace-controller.js';

vi.mock('../src/infrastructure/import-export/underlay-image.js', () => ({ verifyUnderlay: vi.fn(async () => {}) }));
const databases = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(db => db.delete()));
});
async function environment() {
  const db = createWorkspaceDatabase('catalog-' + crypto.randomUUID());
  databases.push(db);
  const root = createIndexedDbWorkspaceRepository(db),
    catalog = createWorkspaceCatalog(db, root);
  root.catalog = catalog;
  const initial = blankLayout('旧仓库');
  // 旧结构资源以业务 layoutId 存储，即使该身份不是 main，也必须无损迁移。
  await root.save(initial);
  const resources = {
    underlay: {
      dataUrl: 'data:image/png;base64,AAAA',
      name: '图纸',
      pixelWidth: 100,
      pixelHeight: 50,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 0.2,
      opacity: 0.5,
      locked: true,
      visible: true,
      calibration: null,
      needsReview: false,
    },
    surveys: [
      {
        objectId: 'boundary',
        kind: 'space',
        date: '2026-10-07',
        notes: '现场',
        values: { width: 30, depth: 20 },
        appliedGeometry: null,
        needsReview: false,
      },
    ],
  };
  await db.localResources.put({ layoutId: initial.layoutId, data: resources });
  return { db, root, catalog, initial, resources };
}

test('v3 catalog migration is atomic, retryable and preserves non-main resources and history', async () => {
  const { db, root, catalog, initial, resources } = await environment();
  await db.projectBackups.put({
    id: 'old-recovery',
    layoutId: initial.layoutId,
    data: projectBackup(initial, resources),
  });
  const fail = () => {
    throw Error('quota');
  };
  db.workspaces.hook('creating', fail);
  await expect(catalog.ready()).rejects.toThrow('quota');
  expect(await db.projects.count()).toBe(0);
  expect(await db.meta.get('workspace-catalog-v4')).toBeUndefined();
  expect((await db.localResources.get(initial.layoutId)).data).toEqual(resources);
  db.workspaces.hook('creating').unsubscribe(fail);
  await catalog.ready();
  await catalog.ready();
  expect(await db.projects.count()).toBe(1);
  expect(await db.workspaces.count()).toBe(1);
  expect((await catalog.info('main')).name).toBe('现状方案');
  expect(await root.loadResources()).toEqual(resources);
  expect((await root.history())[0].model).toEqual(initial);
  expect((await root.getProjectRecovery('old-recovery')).resources).toEqual(resources);
});

test('opening an actual database v3 retains all tables while upgrading to v4', async () => {
  const name = 'upgrade-projects-' + crypto.randomUUID(),
    old = new Dexie(name);
  old.version(3).stores(STORES_V3);
  const model = blankLayout('现有地图');
  await old.drafts.put({ layoutId: 'main', data: model });
  await old.localResources.put({ layoutId: model.layoutId, data: emptyResources() });
  await old.meta.put({ key: 'remote:old', value: { draftRevision: 7 } });
  old.close();
  const db = createWorkspaceDatabase(name);
  databases.push(db);
  const root = createIndexedDbWorkspaceRepository(db),
    catalog = createWorkspaceCatalog(db, root);
  await catalog.ready();
  expect(db.verno).toBe(4);
  expect((await root.load()).model).toEqual(model);
  expect(await root.getRemoteState('old')).toEqual({ draftRevision: 7 });
});

test('new blank maps and copied schemes isolate all resources, histories and server checkpoints', async () => {
  const { root, catalog, initial, resources } = await environment();
  await catalog.ready();
  await root.setRemoteState('api:MAIN', { draftRevision: 9 });
  const id = await catalog.copy('main', '方案 A'),
    branch = catalog.repository(id);
  expect((await branch.load()).model).toEqual(initial);
  const copy = await branch.loadResources();
  expect(copy.underlay).toEqual(resources.underlay);
  expect(copy.surveys[0].needsReview).toBe(true);
  expect(await branch.history()).toHaveLength(1);
  expect(await branch.listProjectRecoveries()).toEqual([]);
  expect(await branch.getRemoteState('api:MAIN')).toBe(null);
  expect((await catalog.info(id)).remoteEligible).toBe(false);
  const changed = (await branch.load()).model;
  changed.boundary.width = 42;
  await branch.save(changed, '修改', initial);
  await branch.saveResources(null, emptyResources());
  expect((await root.load()).model.boundary.width).toBe(30);
  expect(await root.loadResources()).toEqual(resources);
  expect((await root.history())[0].model).toEqual(initial);
  const recovery = (await branch.listProjectRecoveries())[0];
  await expect(root.getProjectRecovery(recovery.id)).rejects.toThrow();
  const mapId = await catalog.createMap({ name: '新仓库' }),
    blank = (await catalog.repository(mapId).load()).model;
  expect(blank.layoutId).not.toBe(initial.layoutId);
  expect(blank.warehouseCode).toBe(null);
  for (const key of ['racks', 'areas', 'rooms', 'fixtures', 'areaBindings']) expect(blank[key]).toEqual([]);
  expect(blank.boundary).toMatchObject({ width: 30, depth: 20, doors: [] });
  await catalog.renameWorkspace(id, '调整方案');
  await catalog.renameProject((await catalog.info(id)).projectId, '一楼仓库');
  expect(await catalog.info(id)).toMatchObject({ name: '调整方案', projectName: '一楼仓库' });
  await expect(catalog.renameWorkspace(id, '现状方案')).rejects.toThrow(/同名/);
  await catalog.remember(id);
  expect(await catalog.last()).toBe(id);
});

test('v1/v2 project backups import into isolated new projects and v2 names round trip', async () => {
  const { catalog, initial, resources } = await environment();
  await catalog.ready();
  const backup = projectBackup(initial, resources, { projectName: '备份项目', schemeName: '方案 B' });
  const parsed = parseProjectBackup(JSON.stringify(backup));
  expect(parsed.names).toEqual(backup.names);
  const first = await catalog.importProject(parsed);
  expect(await catalog.info(first)).toMatchObject({ projectName: '备份项目', name: '方案 B', remoteEligible: false });
  const legacy = { ...backup, formatVersion: 1 };
  delete legacy.names;
  const second = await catalog.importProject(parseProjectBackup(JSON.stringify(legacy)));
  expect((await catalog.info(second)).projectId).not.toBe((await catalog.info(first)).projectId);
  expect((await catalog.repository(second).load()).model).toEqual(initial);
  expect(await catalog.repository(first).loadResources()).toEqual(resources);
});

test('failed new-project transaction creates neither directory nor partial draft', async () => {
  const { db, catalog } = await environment();
  await catalog.ready();
  const fail = () => {
    throw Error('quota');
  };
  db.snapshots.hook('creating', fail);
  await expect(catalog.createMap({ name: '失败项目' })).rejects.toThrow('quota');
  expect(await db.projects.count()).toBe(1);
  expect(await db.workspaces.count()).toBe(1);
  expect(await db.drafts.count()).toBe(1);
});

async function controllerHarness(overrides = {}) {
  const env = await environment();
  await env.catalog.ready();
  const patches = [],
    sessions = [];
  const createApplication = vi.fn(async (ui, repo, services) => {
    const state = { ui, repo, services, failedSave: false, disposed: false, releases: [] };
    sessions.push(state);
    const app = {
      async prepareWorkspaceSwitch() {
        if (state.failedSave) throw Error('save failed');
        await Promise.all(state.releases);
      },
      cancelWorkspaceSwitch: vi.fn(),
      async dispose() {
        state.disposed = true;
      },
      refreshWorkspaceInfo() {},
      name: () => services.workspaceInfo.name,
    };
    state.app = app;
    return app;
  });
  const controller = await createWorkspaceController({
    ui: { patch: p => patches.push(p), afterUpdate: cb => cb() },
    root: env.root,
    services: { remote: { server: true }, layoutCode: null, warehouseCode: 'W', ...overrides },
    createApplication,
  });
  return { ...env, controller, sessions, patches, createApplication };
}

test('upload remounts the same workspace with remote enabled; reopening server layout retains local work', async () => {
  const remote = {
    getPublishedLayout: vi.fn(async code => ({ layoutCode: code, exists: false })),
    initializeLayout: vi.fn(async code => ({ layoutCode: code, draftRevision: 0, basedOnPublishedVersion: null })),
  };
  const h = await controllerHarness({ remote, remoteScope: 'server' });
  const id = await h.catalog.copy('main', '上传方案');
  await h.controller.openWorkspace(id);
  const before = (await h.catalog.repository(id).load()).model;
  expect(await h.controller.uploadWorkspace('NEW_MAP')).toBe(true);
  expect(h.sessions.at(-1).services.remote).toBe(remote);
  expect(h.sessions.at(-1).services.initialLayout.layoutId).toBe(before.layoutId);
  expect(h.sessions.at(-1).services.layoutCode).toBe('NEW_MAP');
  await h.controller.openWorkspace('main');
  expect(await h.controller.openServerLayout('NEW_MAP')).toBe(true);
  expect(await h.catalog.last()).toBe(id);
  expect(await h.db.workspaces.count()).toBe(2);
});

test('another browser can open server draft into a new bound workspace without overwriting its original', async () => {
  const layout = blankLayout('远程布局');
  layout.layoutCode = 'REMOTE';
  const remote = {
    getServerDraft: vi.fn(async () => ({ layoutCode: 'REMOTE', draftRevision: 7, basedOnPublishedVersion: 2, layout })),
  };
  const h = await controllerHarness({ remote, remoteScope: 'server', layoutCode: null });
  const before = await h.root.load();
  expect(await h.controller.openServerLayout('REMOTE')).toBe(true);
  expect(h.sessions.at(-1).services.initialLayout).toEqual(layout);
  expect(await h.root.load()).toEqual(before);
  expect(await h.catalog.repository(await h.catalog.last()).getRemoteState('server:REMOTE')).toMatchObject({
    draftRevision: 7,
  });
});

test('switch waits for pending resources, drops late callbacks, resets remote capability and restores last selection', async () => {
  const h = await controllerHarness(),
    id = await h.catalog.copy('main', '方案 A');
  const old = h.sessions[0];
  let release;
  old.releases.push(
    new Promise(resolve => {
      release = resolve;
    })
  );
  const switching = h.controller.openWorkspace(id);
  await Promise.resolve();
  expect(h.sessions).toHaveLength(1);
  release();
  expect(await switching).toBe(true);
  expect(old.disposed).toBe(true);
  expect(h.sessions[1].services.remote).toBe(null);
  const count = h.patches.length;
  old.ui.patch({ runtime: 'STALE' });
  expect(h.patches).toHaveLength(count);
  expect(await h.catalog.last()).toBe(id);
  expect(h.controller.name()).toBe('方案 A');
  // 旧仓库引用保持 main，不会因为当前选择改变而写入新分区。
  const oldModel = (await old.repo.load()).model;
  oldModel.boundary.width = 51;
  await old.repo.save(oldModel);
  expect((await h.catalog.repository(id).load()).model.boundary.width).toBe(30);
});

test('save failure or broken target keeps source session and rejects concurrent switch', async () => {
  const h = await controllerHarness(),
    id = await h.catalog.copy('main', '方案 A');
  h.sessions[0].failedSave = true;
  expect(await h.controller.openWorkspace(id)).toBe(false);
  expect(h.sessions[0].disposed).toBe(false);
  h.sessions[0].failedSave = false;
  await h.db.drafts.update(id, { data: { schemaVersion: 6 } });
  expect(await h.controller.openWorkspace(id)).toBe(false);
  expect(h.sessions).toHaveLength(1);
  expect(await h.catalog.last()).toBe('main');
  let release;
  h.sessions[0].releases.push(
    new Promise(resolve => {
      release = resolve;
    })
  );
  const opening = h.controller.openWorkspace(id);
  expect(await h.controller.createMap({ name: '不会创建' })).toBe(false);
  release();
  await opening;
  expect(await h.db.projects.count()).toBe(1);
});
