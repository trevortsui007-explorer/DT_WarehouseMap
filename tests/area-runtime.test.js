import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import { seed, migrate } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';
import { activeAreaBindings, equalAreaSections } from '../src/core/spatial/area-bindings.js';
import { resolvePhysicalArea, affectedPhysicalAreas } from '../src/application/runtime/physical-area-runtime.js';
import { createRuntimeStore } from '../src/application/runtime/runtime-store.js';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { createIndexedDbWorkspaceRepository } from '../src/infrastructure/persistence/indexeddb/workspace-repository.js';

function fixture() {
  const layout = validateLayout(seed());
  layout.areas = ['A', 'B'].map((id, index) => ({
    id,
    name: id,
    type: 'inbound',
    x: index * 10,
    y: 0,
    width: 9,
    depth: 6,
    rotation: 30,
  }));
  layout.areaBindings = ['RECEIVE-01', 'PUTAWAY-01', 'RETURN-01'].map((code, index) => ({
    id: 'binding-' + index,
    areaId: 'A',
    virtualLocationCode: code,
    displayName: code,
    purpose: 'RECEIVING',
    isActive: true,
  }));
  return layout;
}
const counts = (huCount, palletCount, outerBoxCount) => ({
  huCount,
  palletCount,
  outerBoxCount,
  updatedAt: '2026-09-26T00:00:00Z',
});
const snapshot = virtualAreas => ({
  warehouseCode: 'W',
  sequence: 10,
  generatedAt: '2026-09-26T00:00:00Z',
  locations: {},
  virtualAreas,
});

test('schema 3 to 4 adds empty bindings and preserves physical geometry and identity', () => {
  const old = fixture();
  old.schemaVersion = 3;
  delete old.areaBindings;
  const next = migrate(old);
  expect(next.schemaVersion).toBe(4);
  expect(next.areaBindings).toEqual([]);
  expect(next.areas).toEqual(old.areas);
  expect(old).not.toHaveProperty('areaBindings');
});

test('one physical area binds many unique locations; duplicate code including inactive bindings is rejected', () => {
  const layout = fixture();
  expect(validateLayout(layout).areaBindings).toHaveLength(3);
  layout.areaBindings.push({ ...layout.areaBindings[0], id: 'other', areaId: 'B', isActive: false });
  expect(() => validateLayout(layout)).toThrow('只能绑定一个');
});

test.each(['missing-area', 'empty-code', 'duplicate-id', 'state-tag', 'priority'])(
  'invalid area binding rejected: %s',
  kind => {
    const layout = fixture();
    if (kind === 'missing-area') layout.areaBindings[0].areaId = 'missing';
    if (kind === 'empty-code') layout.areaBindings[0].virtualLocationCode = '';
    if (kind === 'duplicate-id') layout.areaBindings[1].id = layout.areaBindings[0].id;
    if (kind === 'state-tag') layout.areaBindings[0].virtualLocationCode = 'HOLD';
    if (kind === 'priority') layout.areaBindings[0].displayPriority = 1;
    expect(() => validateLayout(layout)).toThrow();
  }
);

test('aggregate sums all active counts, excludes inactive, and leaves unknown totals unknown', () => {
  const layout = fixture();
  const store = createRuntimeStore('W');
  store.snapshot(
    snapshot({ 'RECEIVE-01': counts(9, 4, 56), 'PUTAWAY-01': counts(8, 3, 49), 'RETURN-01': counts(2, 1, 10) })
  );
  expect(resolvePhysicalArea(layout, store.state, 'A').totals).toEqual({
    huCount: 19,
    palletCount: 8,
    outerBoxCount: 115,
  });
  layout.areaBindings[2].isActive = false;
  expect(resolvePhysicalArea(layout, store.state, 'A').rows).toHaveLength(2);
  expect(resolvePhysicalArea(layout, store.state, 'A').totals.huCount).toBe(17);
  delete store.state.virtualAreas['PUTAWAY-01'];
  expect(resolvePhysicalArea(layout, store.state, 'A').totals.huCount).toBe(null);
});

test('equal split uses longer axis deterministically with full area for one and unchanged footprint for zero', () => {
  const layout = fixture(),
    area = layout.areas[0],
    before = structuredClone(layout);
  const bindings = activeAreaBindings(layout, 'A');
  const sections = equalAreaSections(area, bindings);
  expect(sections.map(section => [section.x, section.y, section.width, section.depth])).toEqual([
    [0, 0, 3, 6],
    [3, 0, 3, 6],
    [6, 0, 3, 6],
  ]);
  expect(equalAreaSections(area, bindings.slice(0, 1))[0]).toMatchObject({ x: 0, y: 0, width: 9, depth: 6 });
  expect(equalAreaSections(area, [])).toEqual([]);
  expect(equalAreaSections({ ...area, width: 6, depth: 9 }, bindings)[2]).toMatchObject({
    x: 0,
    y: 6,
    width: 6,
    depth: 3,
  });
  expect(layout).toEqual(before);
});

test('virtual delta uses shared sequence, rejects stale, targets binding, and never mutates layout', () => {
  const layout = fixture(),
    before = JSON.stringify(layout),
    changed = vi.fn();
  const store = createRuntimeStore('W', changed);
  store.snapshot(snapshot({ 'RECEIVE-01': counts(9, 4, 56) }));
  const event = {
    eventType: 'VirtualAreaRuntimeChanged',
    warehouseCode: 'W',
    sequence: 11,
    virtualLocationCode: 'RECEIVE-01',
    state: counts(10, 5, 60),
  };
  expect(store.delta(event)).toBe('applied');
  expect(changed).toHaveBeenLastCalledWith('RECEIVE-01', 'virtualArea');
  expect(affectedPhysicalAreas(layout, 'RECEIVE-01')).toEqual(['A']);
  expect(store.delta({ ...event, state: counts(1, 1, 1) })).toBe('stale');
  expect(store.state.virtualAreas['RECEIVE-01'].huCount).toBe(10);
  expect(store.delta({ ...event, sequence: 13 })).toBe('gap');
  expect(JSON.stringify(layout)).toBe(before);
  expect(JSON.stringify(validateLayout({ ...layout, virtualAreas: store.state.virtualAreas }))).not.toContain(
    'virtualAreas'
  );
});

test('existing database JSON migrates without changing IndexedDB version and bindings persist through snapshots', async () => {
  const db = createWorkspaceDatabase('area-' + crypto.randomUUID());
  const old = fixture();
  old.schemaVersion = 3;
  delete old.areaBindings;
  await db.drafts.put({ layoutId: 'main', schemaVersion: 3, data: old });
  await db.snapshots.put({ id: 'old', layoutId: 'main', kind: 'legacy', data: old });
  const repo = createIndexedDbWorkspaceRepository(db);
  try {
    expect((await repo.load()).model.areaBindings).toEqual([]);
    expect(db.verno).toBe(2);
    expect((await db.snapshots.get('old')).data.schemaVersion).toBe(4);
    const layout = fixture();
    await repo.save(layout);
    expect((await repo.load()).model.areaBindings).toEqual(layout.areaBindings);
    expect((await repo.history())[0].model.areaBindings).toEqual(layout.areaBindings);
  } finally {
    await db.delete();
  }
});

test('content migration is atomic and retryable when an old binding is invalid', async () => {
  const db = createWorkspaceDatabase('area-rollback-' + crypto.randomUUID());
  const old = fixture();
  old.schemaVersion = 3;
  delete old.areaBindings;
  const invalid = structuredClone(old);
  invalid.areaBindings = [
    { id: 'bad', areaId: 'missing', virtualLocationCode: 'V', displayName: 'V', purpose: 'RECEIVING', isActive: true },
  ];
  await db.drafts.put({ layoutId: 'main', schemaVersion: 3, data: old });
  await db.snapshots.put({ id: 'bad', data: invalid });
  const repo = createIndexedDbWorkspaceRepository(db);
  try {
    await expect(repo.load()).rejects.toThrow('Physical Area');
    expect((await db.drafts.get('main')).data).toEqual(old);
    expect(db.verno).toBe(2);
    await db.snapshots.put({ id: 'bad', data: old });
    expect((await repo.load()).model.schemaVersion).toBe(4);
  } finally {
    await db.delete();
  }
});
