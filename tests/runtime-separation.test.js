import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, test, vi } from 'vitest';
import { seed } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';
import { createRuntimeStore } from '../src/application/runtime/runtime-store.js';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { STORES_V1 } from '../src/infrastructure/persistence/indexeddb/schema.js';

test('legacy cartons are removed without changing identity; all runtime fields are excluded from layout', () => {
  const old = seed();
  old.schemaVersion = 2;
  old.racks[0].slots[0].cartons = 12;
  old.racks[0].slots[0].huCount = 4;
  const next = validateLayout(old);
  expect(next.schemaVersion).toBe(6);
  expect(next.racks[0].slots[0].id).toBe(old.racks[0].slots[0].id);
  expect(next.racks[0].slots[0].code).toBe(old.racks[0].slots[0].code);
  expect(JSON.stringify(next)).not.toMatch(/cartons|huCount/);
  expect(old.racks[0].slots[0].cartons).toBe(12);
});

test('v1 database upgrade removes runtime from drafts and every snapshot atomically', async () => {
  const name = 'phase8-' + crypto.randomUUID();
  const old = new Dexie(name);
  old.version(1).stores(STORES_V1);
  const data = seed();
  data.schemaVersion = 2;
  data.racks[0].slots[0].cartons = 18;
  await old.drafts.put({ layoutId: 'main', data });
  await old.snapshots.put({ id: 'old', data });
  old.close();
  const database = createWorkspaceDatabase(name);
  try {
    expect((await database.drafts.get('main')).data.schemaVersion).toBe(6);
    expect(JSON.stringify(await database.snapshots.get('old'))).not.toContain('cartons');
  } finally {
    await database.delete();
  }
});

test('Runtime starts loading with no demo; snapshot and targeted delta never mutate Layout', () => {
  const layout = validateLayout(seed());
  const before = JSON.stringify(layout);
  const changed = vi.fn();
  const store = createRuntimeStore('WMS-SCOPE', changed);
  expect(store.state.status).toBe('loading');
  expect(Object.keys(store.state.locations)).toHaveLength(0);
  const code = layout.racks[0].slots[0].code;
  store.snapshot({
    warehouseCode: 'WMS-SCOPE',
    sequence: 1,
    generatedAt: new Date().toISOString(),
    locations: [
      { locationCode: code, huCount: 1, outerBoxCount: 12, occupancyStatus: 'OCCUPIED', lockStatus: 'NORMAL' },
    ],
  });
  expect(store.state.status).toBe('ready');
  store.delta({
    eventType: 'LocationRuntimeChanged',
    warehouseCode: 'WMS-SCOPE',
    sequence: 2,
    locationCode: code,
    state: { huCount: 0, outerBoxCount: 0, occupancyStatus: 'EMPTY', lockStatus: 'NORMAL' },
  });
  expect(changed).toHaveBeenLastCalledWith(code);
  expect(JSON.stringify(layout)).toBe(before);
  store.status('error', 'API unavailable');
  expect(store.state.status).toBe('error');
});

test('failed database schema upgrade rolls back instead of erasing an invalid draft', async () => {
  const name = 'phase8-rollback-' + crypto.randomUUID();
  const old = new Dexie(name);
  old.version(1).stores(STORES_V1);
  const data = seed();
  data.schemaVersion = 99;
  await old.drafts.put({ layoutId: 'main', data });
  old.close();
  const upgraded = createWorkspaceDatabase(name);
  await expect(upgraded.open()).rejects.toThrow();
  upgraded.close();
  const recovery = new Dexie(name);
  recovery.version(1).stores(STORES_V1);
  try {
    expect((await recovery.drafts.get('main')).data).toEqual(data);
  } finally {
    await recovery.delete();
  }
});
