import { expect, test, vi } from 'vitest';
import { seed } from '../src/core/model/model.js';
import { validateLayout, parseLayout } from '../src/core/model/layout-validation.js';
import { corners, spatialWarnings } from '../src/core/spatial/spatial.js';
import { spaces, coveredByRooms } from '../src/core/spatial/rooms.js';
import { copies, transform } from '../src/core/geometry/cad-geometry.js';
import { fitView } from '../src/core/geometry/fit-view.js';
import { createGeometryCommands } from '../src/application/commands/geometry-commands.js';
import { createSessionHistory } from '../src/application/history/session-history.js';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { createIndexedDbWorkspaceRepository } from '../src/infrastructure/persistence/indexeddb/workspace-repository.js';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const room = () => ({
  id: 'room1',
  name: '小房间',
  x: 60,
  y: 0,
  width: 8,
  depth: 6,
  rotation: 0,
  doors: [{ id: 'door1', name: '房间门', side: 'top', offset: 2, width: 3, type: 'general' }],
});

test('v4 migration preserves old boundary and doors, validates room identity and round trips v5', () => {
  const old = validateLayout(seed());
  old.schemaVersion = 4;
  delete old.rooms;
  old.boundary.doors = [{ ...room().doors[0], id: 'old-door' }];
  const next = validateLayout(old);
  expect(next.schemaVersion).toBe(6);
  expect(next.rooms).toEqual([]);
  expect(next.boundary).toEqual(old.boundary);
  expect(old.rooms).toBeUndefined();
  next.rooms.push(room());
  expect(parseLayout(JSON.stringify(next))).toEqual(next);
  next.rooms[0].doors[0].id = 'old-door';
  expect(() => validateLayout(next)).toThrow(/重复/);
});

test('complete polygon coverage rejects gaps even when all corners are indoors; aisles may connect rooms', () => {
  const a = { x: 0, y: 0, width: 3, depth: 10 },
    b = { x: 7, y: 0, width: 3, depth: 10 };
  const polygon = corners({ x: 1, y: 1, width: 8, depth: 2, rotation: 0 });
  expect(coveredByRooms(polygon, [a, b])).toBe(false);
  expect(coveredByRooms(polygon, [a, { ...b, x: 3, width: 7 }])).toBe(true);
  const model = validateLayout(seed());
  model.racks = [];
  model.rooms = [room()];
  model.areas = [{ id: 'aisle', name: '连接走廊', type: 'aisle', x: 50, y: 0, width: 10, depth: 2, rotation: 0 }];
  expect(spatialWarnings(model)).toEqual([]);
  model.areas[0].type = 'inbound';
  expect(spatialWarnings(model)).toHaveLength(1);
  model.areas[0].x = 61;
  model.areas[0].width = 2;
  expect(spatialWarnings(model)).toEqual([]);
});

test.each([
  [100, 150, 1000, 600],
  [-150, -80, 500, 900],
  [0, 0, 300, 200],
])('fit centers actual distant geometry at %s %s without clipping', (x, y, width, height) => {
  const box = { x, y, width: 200, depth: 4 };
  const fit = fitView(box, width, height);
  const top = Math.min(90, height * 0.2),
    bottom = Math.min(140, height * 0.3);
  expect(fit.x + (x + 100) * 22 * fit.scale).toBeCloseTo(width / 2);
  expect(fit.y + (y + 2) * 22 * fit.scale).toBeCloseTo((top + height - bottom) / 2);
  expect(fit.x + x * 22 * fit.scale).toBeGreaterThanOrEqual(0);
});

test('room moves keep contents fixed unless selected; commands preserve doors and undo atomically', () => {
  let model = validateLayout(seed());
  model.rooms.push(room());
  const changed = vi.fn();
  const history = createSessionHistory({
    model: () => model,
    replace: next => (model = next),
    canEdit: () => true,
    beforeCommand() {},
    afterRestore() {},
    changed,
    render() {},
    toast() {},
    validate: validateLayout,
  });
  const commands = createGeometryCommands({
    model: () => model,
    objects: () => [...model.racks, ...spaces(model)],
    execute: history.execute,
    select() {},
  });
  const before = structuredClone(model);
  commands.move([model.rooms[0]], 2, 1);
  expect(model.racks).toEqual(before.racks);
  expect(model.rooms[0].doors).toEqual(before.rooms[0].doors);
  history.undo();
  expect(model).toEqual(before);
  commands.move([model.rooms[0], model.racks[0]], 2, 1);
  expect(model.racks[0].x).toBe(before.racks[0].x + 2);
  expect(model.rooms[0].x).toBe(62);
  history.undo();
  expect(model).toEqual(before);
  commands.resize(model.rooms[0], 3, 6);
  expect(model).toEqual(before);
  commands.remove(['room1']);
  expect(model.rooms).toEqual([]);
  expect(model.racks).toEqual(before.racks);
  history.undo();
  expect(model).toEqual(before);
  expect(() => transform([room()], 0, 0, 90, { x: 0, y: 0 })).toThrow(/轴对齐/);
  const cloned = copies([room()], [{ dx: 10, dy: 0 }], model)[0];
  expect(cloned.id).not.toBe('room1');
  expect(cloned.doors[0].id).not.toBe('door1');
  expect(cloned.doors[0].offset).toBe(2);
});

test('database v2 migrates JSON v4 to v5 transactionally and retains room snapshots', async () => {
  const db = createWorkspaceDatabase('rooms-' + crypto.randomUUID(), { indexedDB, IDBKeyRange });
  try {
    const old = validateLayout(seed());
    old.schemaVersion = 4;
    delete old.rooms;
    await db.drafts.put({ layoutId: 'main', schemaVersion: 4, data: old });
    await db.snapshots.put({ id: 'broken', layoutId: 'main', data: { schemaVersion: 4 } });
    const repo = createIndexedDbWorkspaceRepository(db);
    await expect(repo.load()).rejects.toThrow();
    expect((await db.drafts.get('main')).data.schemaVersion).toBe(4);
    await db.snapshots.delete('broken');
    const loaded = (await repo.load()).model;
    expect(loaded.schemaVersion).toBe(6);
    expect(db.verno).toBe(4);
    loaded.rooms.push(room());
    await repo.save(loaded, '房间');
    expect((await repo.load()).model.rooms).toEqual(loaded.rooms);
    expect((await repo.history())[0].model.rooms).toEqual(loaded.rooms);
  } finally {
    await db.delete();
  }
});
