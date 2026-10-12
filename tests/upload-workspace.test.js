import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { createIndexedDbWorkspaceRepository } from '../src/infrastructure/persistence/indexeddb/workspace-repository.js';
import { createWorkspaceCatalog } from '../src/infrastructure/persistence/indexeddb/workspace-catalog.js';
import { uploadWorkspace } from '../src/application/workspace/upload-workspace.js';
import { seed } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';
import { emptyResources } from '../src/core/workspace/resources.js';
const databases = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(db => db.delete()));
});
async function setup() {
  const db = createWorkspaceDatabase('upload-' + crypto.randomUUID());
  databases.push(db);
  const catalog = createWorkspaceCatalog(db, createIndexedDbWorkspaceRepository(db));
  const model = validateLayout(seed());
  const id = await catalog.importProject({ layout: model, resources: emptyResources() });
  let draft;
  const remote = {
    getPublishedLayout: vi.fn(async code => ({
      layoutCode: code,
      exists: !!draft,
      publishedVersion: null,
      layout: null,
    })),
    initializeLayout: vi.fn(
      async (code, layout) =>
        (draft = { layoutCode: code, draftRevision: 0, basedOnPublishedVersion: null, layout: structuredClone(layout) })
    ),
    getServerDraft: vi.fn(async () => draft),
  };
  const args = { catalog, remote, id, code: 'TEST_UPLOAD', scope: 'test' };
  return { db, catalog, model, id, remote, args, upload: () => uploadWorkspace(args) };
}
test('upload preserves geometry and resources, backs up original, and persists remote binding and revision atomically', async () => {
  const e = await setup();
  await e.upload();
  expect(await e.catalog.info(e.id)).toMatchObject({
    remoteEligible: true,
    remoteLayoutCode: 'TEST_UPLOAD',
    remoteScope: 'test',
  });
  expect((await e.catalog.repository(e.id).load()).model).toEqual({ ...e.model, layoutCode: 'TEST_UPLOAD' });
  expect((await e.db.projectBackups.toArray())[0].data.layout).toEqual(e.model);
  expect(await e.catalog.repository(e.id).getRemoteState('test:TEST_UPLOAD')).toMatchObject({ draftRevision: 0 });
  expect(await e.catalog.repository(e.id).getRemoteState('upload:test')).toBe(null);
  await expect(e.upload()).rejects.toThrow('已连接');
  expect(e.remote.initializeLayout).toHaveBeenCalledTimes(1);
});
test('existing code is never overwritten or connected based only on matching identity', async () => {
  const e = await setup();
  await e.remote.initializeLayout(e.args.code, { ...e.model, layoutCode: e.args.code });
  await expect(e.upload()).rejects.toThrow('已存在');
  expect(e.remote.initializeLayout).toHaveBeenCalledTimes(1);
  expect((await e.catalog.info(e.id)).remoteEligible).toBe(false);
});
test('lost response is recoverable after reload without second insert and preserves later local edits as dirty', async () => {
  const e = await setup();
  const insert = e.remote.initializeLayout.getMockImplementation();
  e.remote.initializeLayout.mockImplementationOnce(async (...args) => {
    await insert(...args);
    throw Error('offline');
  });
  await expect(e.upload()).rejects.toThrow('offline');
  const repo = e.catalog.repository(e.id);
  const next = structuredClone(e.model);
  next.racks[0].x++;
  await repo.save(next);
  await expect(uploadWorkspace({ ...e.args, code: 'OTHER' })).rejects.toThrow('上一次上传');
  await e.upload();
  expect(e.remote.initializeLayout).toHaveBeenCalledTimes(1);
  expect((await repo.load()).model.racks[0].x).toBe(next.racks[0].x);
  expect(JSON.parse((await repo.getRemoteState('test:TEST_UPLOAD')).synced).racks[0].x).toBe(e.model.racks[0].x);
});
test('quota failure after server commit rolls local binding back and retry completes it', async () => {
  const e = await setup();
  const fail = () => {
    throw Error('quota');
  };
  e.db.projectBackups.hook('creating', fail);
  await expect(e.upload()).rejects.toThrow('quota');
  expect((await e.catalog.info(e.id)).remoteEligible).toBe(false);
  expect((await e.catalog.repository(e.id).load()).model).toEqual(e.model);
  e.db.projectBackups.hook('creating').unsubscribe(fail);
  await e.upload();
  expect(e.remote.initializeLayout).toHaveBeenCalledTimes(1);
});
test('validation refusal permits corrected layout and a new upload intent', async () => {
  const e = await setup();
  e.remote.initializeLayout.mockRejectedValueOnce(Object.assign(Error('invalid'), { status: 422 }));
  await expect(e.upload()).rejects.toThrow('invalid');
  expect(await e.catalog.repository(e.id).getRemoteState('upload:test')).toBe(null);
  await e.upload();
  expect((await e.catalog.info(e.id)).remoteEligible).toBe(true);
});
