import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { createBrowserLayoutRepository } from '../src/infrastructure/persistence/browser-layout-repository.js';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { createIndexedDbWorkspaceRepository } from '../src/infrastructure/persistence/indexeddb/workspace-repository.js';
import {
  migrateLegacyStorage,
  LEGACY_KEYS,
  MIGRATION_KEY,
} from '../src/infrastructure/persistence/legacy/localstorage-migration.js';
import { createLayoutStore } from '../src/infrastructure/persistence/layout-store.js';
import { LAYOUT_ID } from '../src/infrastructure/persistence/indexeddb/schema.js';
import { seed } from '../src/core/model/model.js';
import { ensureSpatial } from '../src/core/spatial/spatial.js';

const databases = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.delete()));
});
function database() {
  const db = createWorkspaceDatabase('test-' + crypto.randomUUID());
  databases.push(db);
  return db;
}
function storage() {
  const map = new Map();
  return {
    map,
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
  };
}
const layout = () => ensureSpatial(seed());
const counts = async db => [await db.drafts.count(), await db.history.count(), await db.snapshots.count()];

test('Dexie repository saves/loads unchanged contract, metadata, history and atomic before-replacement snapshots', async () => {
  const db = database(),
    repository = createIndexedDbWorkspaceRepository(db),
    initial = layout();
  expect(await repository.load()).toBe(null);
  await repository.save(initial, 'initial');
  const next = structuredClone(initial);
  next.racks[0].x += 1;
  await repository.save(next, 'import', initial);
  expect((await repository.load()).model).toEqual(next);
  expect((await repository.history()).find(entry => entry.label === '替换前备份').model).toEqual(initial);
  const draft = await db.drafts.get(LAYOUT_ID);
  expect(draft).toMatchObject({
    layoutId: 'main',
    layoutCode: 'MAIN',
    schemaVersion: 4,
    baseVersion: null,
    dirty: true,
  });
  expect(draft.data.racks[0].slots).toEqual(initial.racks[0].slots);
  for (let i = 0; i < 22; i++) await repository.save(next, 'save ' + i);
  expect(await db.history.count()).toBe(20);
  expect(await db.snapshots.count()).toBe(20);
});

test('a failure midway through save rolls back draft, history and snapshots together', async () => {
  const db = database(),
    repository = createIndexedDbWorkspaceRepository(db),
    initial = layout();
  await repository.save(initial, 'initial');
  const beforeCounts = await counts(db),
    beforeHistory = await repository.history();
  const reject = () => {
    throw Error('simulated quota');
  };
  db.history.hook('creating', reject);
  const next = structuredClone(initial);
  next.racks[0].x += 1;
  await expect(repository.save(next, 'new', initial)).rejects.toThrow('simulated quota');
  expect((await repository.load()).model).toEqual(initial);
  expect(await counts(db)).toEqual(beforeCounts);
  expect(await repository.history()).toEqual(beforeHistory);
  db.history.hook('creating').unsubscribe(reject);
  await repository.save(next, 'retry');
  expect((await repository.load()).model).toEqual(next);
});

test('all recognized legacy layouts/history migrate, preferences remain and repeated execution is idempotent', async () => {
  const db = database(),
    legacy = storage(),
    initial = layout(),
    old = createLayoutStore(legacy);
  old.save(initial, 'initial');
  const next = structuredClone(initial);
  next.racks[0].x += 1;
  old.save(next, 'edited', initial);
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(initial));
  legacy.setItem('wms-map.preference.theme', '"light"');
  legacy.setItem('unrecognized-user-key', 'keep');
  const raw = new Map(legacy.map);
  await migrateLegacyStorage(db, legacy);
  const repository = createIndexedDbWorkspaceRepository(db);
  expect((await repository.load()).model).toEqual(next);
  expect(
    (await repository.history()).some(
      entry => entry.label === '替换前备份' && entry.model.racks[0].x === initial.racks[0].x
    )
  ).toBe(true);
  expect(LEGACY_KEYS.every(key => legacy.getItem(key) === null)).toBe(true);
  expect(legacy.getItem('wms-map.preference.theme')).toBe('"light"');
  expect(legacy.getItem('unrecognized-user-key')).toBe('keep');
  const marker = await db.meta.get(MIGRATION_KEY);
  expect(marker.status).toBe('success');
  expect(marker.sources[0].raw).toBe(raw.get(LEGACY_KEYS[0]));
  const before = await counts(db);
  await migrateLegacyStorage(db, legacy);
  expect(await counts(db)).toEqual(before);
  await repository.save(next, 'new save');
  await migrateLegacyStorage(db, legacy);
  expect((await repository.load()).model).toEqual(next);
});

test('schema v1 migration preserves identities/codes and uses the existing FG conversion', async () => {
  const db = database(),
    legacy = storage(),
    initial = layout();
  initial.schemaVersion = 1;
  for (const rack of initial.racks) {
    rack.zone = rack.fgCode === 'FG02' ? 'B' : 'A';
    delete rack.spaceId;
    delete rack.fgCode;
  }
  const slots = structuredClone(initial.racks[0].slots);
  legacy.setItem(LEGACY_KEYS[3], JSON.stringify(initial));
  await migrateLegacyStorage(db, legacy);
  const model = (await createIndexedDbWorkspaceRepository(db).load()).model;
  expect(model.schemaVersion).toBe(4);
  expect(model.racks[1].fgCode).toBe('FG02');
  expect(model.racks[0].slots).toEqual(slots);
});

test('parse/validation failure retains every raw legacy value and does not mark success', async () => {
  const db = database(),
    legacy = storage();
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(layout()));
  legacy.setItem(LEGACY_KEYS[2], '{corrupt');
  const before = [...legacy.map];
  await expect(migrateLegacyStorage(db, legacy)).rejects.toThrow();
  expect([...legacy.map]).toEqual(before);
  expect(await db.meta.get(MIGRATION_KEY)).toBeUndefined();
  expect(await counts(db)).toEqual([0, 0, 0]);
});

test('migration transaction failure preserves raw data; retry succeeds without duplicate records', async () => {
  const db = database(),
    legacy = storage();
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(layout()));
  const raw = legacy.getItem(LEGACY_KEYS[1]);
  const reject = () => {
    throw Error('migration disk full');
  };
  db.drafts.hook('creating', reject);
  await expect(migrateLegacyStorage(db, legacy)).rejects.toThrow('migration disk full');
  expect(legacy.getItem(LEGACY_KEYS[1])).toBe(raw);
  expect(await counts(db)).toEqual([0, 0, 0]);
  expect(await db.meta.get(MIGRATION_KEY)).toBeUndefined();
  db.drafts.hook('creating').unsubscribe(reject);
  await migrateLegacyStorage(db, legacy);
  expect(await db.drafts.count()).toBe(1);
  expect(await db.snapshots.count()).toBe(1);
});

test('read-back failure leaves a pending marker and all originals; verified retry is idempotent', async () => {
  const db = database(),
    legacy = storage();
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(layout()));
  const raw = legacy.getItem(LEGACY_KEYS[1]);
  const corrupt = value => (value ? { ...value, label: 'read failure' } : value);
  db.snapshots.hook('reading', corrupt);
  await expect(migrateLegacyStorage(db, legacy)).rejects.toThrow('读回校验失败');
  expect(legacy.getItem(LEGACY_KEYS[1])).toBe(raw);
  expect((await db.meta.get(MIGRATION_KEY)).status).toBe('pending-verification');
  const before = await counts(db);
  db.snapshots.hook('reading').unsubscribe(corrupt);
  await migrateLegacyStorage(db, legacy);
  expect(await counts(db)).toEqual(before);
  expect((await db.meta.get(MIGRATION_KEY)).status).toBe('success');
});

test('cleanup failure resumes safely after verification and never removes unrelated keys', async () => {
  const db = database(),
    legacy = storage();
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(layout()));
  legacy.setItem(LEGACY_KEYS[2], JSON.stringify(layout()));
  const remove = legacy.removeItem;
  let fail = true;
  legacy.removeItem = key => {
    if (key === LEGACY_KEYS[2] && fail) throw Error('cleanup denied');
    remove(key);
  };
  await expect(migrateLegacyStorage(db, legacy)).rejects.toThrow('cleanup denied');
  const before = await counts(db);
  expect(legacy.getItem(LEGACY_KEYS[2])).not.toBe(null);
  fail = false;
  await migrateLegacyStorage(db, legacy);
  expect(await counts(db)).toEqual(before);
  expect(legacy.getItem(LEGACY_KEYS[2])).toBe(null);
});

test('an existing IndexedDB draft is never overwritten by migration and changed legacy sources are retained', async () => {
  const db = database(),
    repository = createIndexedDbWorkspaceRepository(db),
    existing = layout(),
    legacy = storage();
  await repository.save(existing, 'existing');
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(layout()));
  await migrateLegacyStorage(db, legacy);
  expect((await repository.load()).model).toEqual(existing);
  const changed = JSON.stringify(layout());
  legacy.setItem(LEGACY_KEYS[1], changed);
  await expect(migrateLegacyStorage(db, legacy)).rejects.toThrow('旧布局发生变化');
  expect(legacy.getItem(LEGACY_KEYS[1])).toBe(changed);
  expect((await repository.load()).model).toEqual(existing);
});

test('production repository factory migrates on load and subsequent saves only use IndexedDB', async () => {
  const legacy = storage(),
    initial = layout();
  legacy.setItem(LEGACY_KEYS[1], JSON.stringify(initial));
  const writes = vi.spyOn(legacy, 'setItem');
  vi.stubGlobal('window', { localStorage: legacy });
  const db = createWorkspaceDatabase();
  databases.push(db);
  const repository = createBrowserLayoutRepository();
  try {
    expect((await repository.load()).model).toEqual(initial);
    const next = structuredClone(initial);
    next.racks[0].x += 2;
    await repository.save(next, 'new');
    expect((await db.drafts.get(LAYOUT_ID)).data).toEqual(next);
    expect(writes).not.toHaveBeenCalled();
    expect(legacy.map.size).toBe(0);
  } finally {
    repository.close();
    vi.unstubAllGlobals();
  }
});
