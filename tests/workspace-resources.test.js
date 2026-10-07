import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, test, vi } from 'vitest';
import { seed } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';
import { spatialWarnings } from '../src/core/spatial/spatial.js';
import { copies, boxSelect, bounds } from '../src/core/geometry/cad-geometry.js';
import { createGeometryCommands } from '../src/application/commands/geometry-commands.js';
import { createSessionHistory } from '../src/application/history/session-history.js';
import { imageToWorld, worldToImage, calibrate } from '../src/core/workspace/calibration.js';
import { surveyTarget, surveyStatus, createSurvey, geometryStamp } from '../src/core/workspace/survey.js';
import {
  emptyResources,
  projectBackup,
  parseProjectBackup,
  validateResources,
} from '../src/core/workspace/resources.js';
import { createWorkspaceDatabase } from '../src/infrastructure/persistence/indexeddb/db.js';
import { STORES_V1 } from '../src/infrastructure/persistence/indexeddb/schema.js';
import { createIndexedDbWorkspaceRepository } from '../src/infrastructure/persistence/indexeddb/workspace-repository.js';
import { createWorkspaceResources } from '../src/application/workspace/workspace-resources.js';

// 在服务单测中只替换图片解码器；持久化用真实 Dexie + fake IndexedDB。
vi.mock('../src/infrastructure/import-export/underlay-image.js', () => ({
  verifyUnderlay: vi.fn(async () => {}),
  readUnderlay: vi.fn(async file => {
    if (file.bad) throw Error('图片损坏');
    return { dataUrl: 'data:image/png;base64,AAAA', name: '图纸', pixelWidth: 1000, pixelHeight: 500 };
  }),
}));
const databases = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.delete()));
  vi.restoreAllMocks();
});
function database() {
  const db = createWorkspaceDatabase('resources-' + crypto.randomUUID());
  databases.push(db);
  return db;
}
const layout = () => validateLayout(seed());
const fixture = () => ({
  id: 'fixture1',
  name: '电柜',
  type: 'cabinet',
  x: 3,
  y: 4,
  width: 1,
  depth: 1,
  height: 2,
  rotation: 0,
});
const image = () => ({
  dataUrl: 'data:image/png;base64,AAAA',
  name: '图纸',
  pixelWidth: 1000,
  pixelHeight: 500,
  x: 10,
  y: -5,
  rotation: 30,
  scale: 0.03,
  opacity: 0.5,
  visible: true,
  locked: true,
  calibration: null,
  needsReview: false,
});

test.each([0, 30, 90, -125])('pixel calibration preserves anchor at %s degrees and never changes geometry', angle => {
  const model = layout(),
    before = structuredClone(model),
    source = { ...image(), rotation: angle };
  const points = [
    { x: 120, y: 80 },
    { x: 420, y: 480 },
  ];
  // 画布缩放不进入标定算法：屏幕先变回世界，再反转图片变换。
  for (const zoom of [0.25, 1, 4]) {
    const world = imageToWorld(source, points[0]);
    const screen = { x: world.x * 22 * zoom + 53, y: world.y * 22 * zoom - 12 };
    const pixel = worldToImage(source, { x: (screen.x - 53) / zoom / 22, y: (screen.y + 12) / zoom / 22 });
    expect(pixel.x).toBeCloseTo(points[0].x);
    expect(pixel.y).toBeCloseTo(points[0].y);
  }
  const next = calibrate(source, points, 10000, 'mm');
  expect(next.scale).toBeCloseTo(0.02);
  expect(imageToWorld(next, points[0]).x).toBeCloseTo(imageToWorld(source, points[0]).x);
  expect(imageToWorld(next, points[0]).y).toBeCloseTo(imageToWorld(source, points[0]).y);
  expect(model).toEqual(before);
  expect(source.scale).toBe(0.03);
  expect(() => calibrate(source, [points[0], points[0]], 10, 'm')).toThrow();
});

test('schema 5 migration adds fixtures without changing doors, rooms, IDs or bindings', () => {
  const old = layout();
  old.schemaVersion = 5;
  delete old.fixtures;
  const next = validateLayout(old);
  expect(next.schemaVersion).toBe(6);
  expect(next.fixtures).toEqual([]);
  for (const key of ['racks', 'rooms', 'boundary', 'areaBindings']) expect(next[key]).toEqual(old[key]);
  expect(old.fixtures).toBeUndefined();
  next.fixtures.push(fixture());
  expect(validateLayout(next)).toEqual(next);
  next.fixtures[0].id = next.racks[0].id;
  expect(() => validateLayout(next)).toThrow(/重复/);
});

test('general areas can contain racks and fixtures, operational area collisions remain warning-only', () => {
  const m = layout();
  m.racks = [m.racks[0]];
  m.areas = [
    { id: 'general', name: '备货区', type: 'general', x: 2, y: 3, width: 12, depth: 5, rotation: 0, color: '#d9edf9' },
  ];
  expect(spatialWarnings(m)).toEqual([]);
  m.fixtures.push(fixture());
  expect(spatialWarnings(m)).toHaveLength(1);
  m.areas[0].type = 'inbound';
  expect(spatialWarnings(m)).toHaveLength(3);
  expect(() => validateLayout(m)).not.toThrow();
});

function editor(initial = layout()) {
  let model = initial;
  const changed = vi.fn();
  const history = createSessionHistory({
    model: () => model,
    replace: next => {
      model = next;
    },
    canEdit: () => true,
    beforeCommand() {},
    afterRestore() {},
    render() {},
    toast() {},
    changed,
    validate: validateLayout,
  });
  const commands = createGeometryCommands({
    model: () => model,
    objects: () => [...model.racks, ...model.areas, ...model.fixtures],
    execute: history.execute,
    select() {},
  });
  return { model: () => model, history, commands, changed };
}
test('fixture move/rotation/copy/delete share command history and selection geometry', () => {
  const m = layout();
  m.fixtures = [fixture()];
  const e = editor(m),
    before = structuredClone(m);
  e.commands.move([m.racks[0], m.fixtures[0]], 2, 3);
  expect(e.model().fixtures[0].x).toBe(5);
  e.history.undo();
  expect(e.model()).toEqual(before);
  e.commands.rotate([e.model().fixtures[0]], 0, 0, 90);
  expect(e.model().fixtures[0].rotation).toBe(90);
  e.history.undo();
  e.commands.copy([e.model().fixtures[0]], [{ dx: 10, dy: 0 }]);
  expect(e.model().fixtures).toHaveLength(2);
  expect(e.model().fixtures[1].id).not.toBe('fixture1');
  e.commands.remove(['fixture1']);
  expect(e.model().fixtures).toHaveLength(1);
  e.history.undo();
  expect(e.model().fixtures).toHaveLength(2);
  expect(bounds(e.model().fixtures).width).toBe(11);
  expect(boxSelect(e.model().fixtures, { x: 0, y: 0, width: 20, depth: 10 }, false)).toHaveLength(2);
});

test('database v2 to v3 preserves drafts/history/meta and JSON migrates independently', async () => {
  const name = 'upgrade-' + crypto.randomUUID();
  const oldDb = new Dexie(name);
  oldDb.version(2).stores(STORES_V1);
  const old = layout();
  old.schemaVersion = 5;
  delete old.fixtures;
  await oldDb.drafts.put({ layoutId: 'main', data: old });
  await oldDb.snapshots.put({ id: 's', layoutId: 'main', kind: 'history', data: old });
  await oldDb.history.put({ id: 'h', layoutId: 'main', snapshotId: 's', order: 0 });
  await oldDb.meta.put({ key: 'remote:scope', value: 7 });
  oldDb.close();
  const db = createWorkspaceDatabase(name);
  databases.push(db);
  const repo = createIndexedDbWorkspaceRepository(db);
  expect((await repo.load()).model.fixtures).toEqual([]);
  expect(db.verno).toBe(4);
  expect((await repo.history())[0].model.racks).toEqual(old.racks);
  expect((await db.meta.get('remote:scope')).value).toBe(7);
  expect(await repo.loadResources('main')).toEqual(emptyResources());
});

test('project round trip excludes runtime and ordinary layout excludes local resources', () => {
  const m = layout();
  m.racks[0].slots[0].cartons = [{ id: 'demo' }];
  m.underlay = image();
  m.resources = { virtualAreas: {} };
  const bundle = projectBackup(m, { underlay: image(), surveys: [] });
  expect(parseProjectBackup(JSON.stringify(bundle))).toMatchObject({
    layout: bundle.layout,
    resources: bundle.resources,
  });
  expect(bundle.layout.underlay).toBeUndefined();
  expect(bundle.layout.resources).toBeUndefined();
  expect(bundle.layout.racks[0].slots[0].cartons).toBeUndefined();
  expect(() =>
    validateResources({ underlay: { ...image(), dataUrl: 'data:text/html;base64,AAAA' }, surveys: [] })
  ).toThrow();
});

test('backup replacement atomically saves prior layout and resources; quota failure rolls all back and retry succeeds', async () => {
  const db = database(),
    repo = createIndexedDbWorkspaceRepository(db),
    m = layout();
  const resources = { underlay: image(), surveys: [] };
  await repo.save(m);
  await repo.saveResources('main', resources);
  const next = structuredClone(m);
  next.fixtures.push(fixture());
  const backup = projectBackup(next, emptyResources());
  const fail = () => {
    throw Error('quota');
  };
  db.history.hook('creating', fail);
  await expect(repo.replaceProject(backup, m)).rejects.toThrow('quota');
  expect((await repo.load()).model).toEqual(m);
  expect(await repo.loadResources('main')).toEqual(resources);
  expect(await repo.listProjectRecoveries('main')).toEqual([]);
  db.history.hook('creating').unsubscribe(fail);
  await repo.replaceProject(backup, m);
  expect((await repo.load()).model).toEqual(next);
  expect(await repo.loadResources('main')).toEqual(emptyResources());
  const recovery = await repo.getProjectRecovery((await repo.listProjectRecoveries('main'))[0].id);
  expect(recovery.layout).toEqual(m);
  expect(recovery.resources).toEqual(resources);
  await repo.replaceProject(recovery, next);
  expect((await repo.load()).model).toEqual(m);
});

test('ordinary import/history keeps resources but marks them for review in same transaction', async () => {
  const db = database(),
    repo = createIndexedDbWorkspaceRepository(db),
    m = layout();
  const record = createSurvey(surveyTarget(m, m.racks[0].id), {
    unit: 'm',
    date: '2026-10-07',
    values: { width: 1.4, depth: 1.5, levelHeight: 1.6 },
  });
  await repo.save(m);
  await repo.saveResources('main', { underlay: image(), surveys: [record] });
  await repo.save(m, '恢复', m);
  const stored = await repo.loadResources('main');
  expect(stored.underlay.needsReview).toBe(true);
  expect(stored.surveys[0].needsReview).toBe(true);
});

test('survey save is separate from Undo; mm application validates and later geometry changes need review', async () => {
  const db = database(),
    repo = createIndexedDbWorkspaceRepository(db),
    e = editor();
  const id = e.model().racks[0].id;
  const service = createWorkspaceResources({
    repository: repo,
    model: e.model,
    canEdit: () => true,
    execute: e.history.execute,
    selectedId: () => id,
    changed() {},
    cancelCad() {},
  });
  await service.reload();
  await service.commands.saveSurvey(id, {
    unit: 'mm',
    date: '2026-10-07',
    values: { width: 1500, depth: 1800, levelHeight: 1600 },
  });
  expect(e.changed).not.toHaveBeenCalled();
  expect(e.history.canUndo()).toBe(false);
  expect(service.snapshot().survey.status).toBe('已记录待应用');
  await service.commands.applySurvey(id);
  expect(e.model().racks[0].width).toBe(1.5);
  expect(service.snapshot().survey.status).toBe('已应用');
  e.history.undo();
  expect(service.snapshot().survey.status).toBe('待复核');
  e.history.redo();
  expect(service.snapshot().survey.status).toBe('已应用');
  const cloned = copies([e.model().racks[0]], [{ dx: 3, dy: 0 }], e.model())[0];
  expect((await repo.loadResources('main')).surveys.find(record => record.objectId === cloned.id)).toBeUndefined();
  e.commands.remove([id]);
  expect((await repo.loadResources('main')).surveys).toHaveLength(1);
  e.history.undo();
  expect(service.snapshot().survey.record.objectId).toBe(id);
});

test('survey application rejects a room shrink that cannot contain its door and retains record', async () => {
  const db = database(),
    repo = createIndexedDbWorkspaceRepository(db),
    m = layout();
  m.boundary.doors = [{ id: 'door1', name: '门', type: 'general', side: 'top', width: 3, offset: 2 }];
  const e = editor(m),
    before = structuredClone(m);
  const service = createWorkspaceResources({
    repository: repo,
    model: e.model,
    canEdit: () => true,
    execute: e.history.execute,
    selectedId: () => 'boundary',
    changed() {},
    cancelCad() {},
  });
  await service.reload();
  await service.commands.saveSurvey('boundary', { unit: 'm', date: '2026-10-07', values: { width: 2, depth: 5 } });
  expect(await service.commands.applySurvey('boundary')).toBe(false);
  expect(e.model()).toEqual(before);
  expect(e.history.canUndo()).toBe(false);
  expect(service.snapshot().survey.record.values.width).toBe(2);
});

test('failed image read or save preserves previous underlay and layout', async () => {
  const db = database(),
    repo = createIndexedDbWorkspaceRepository(db),
    m = layout();
  await repo.saveResources('main', { underlay: image(), surveys: [] });
  const before = structuredClone(m);
  const service = createWorkspaceResources({
    repository: repo,
    model: () => m,
    canEdit: () => true,
    selectedId: () => null,
    changed() {},
    cancelCad() {},
  });
  await service.reload();
  expect(await service.commands.uploadUnderlay({ bad: true })).toBe(false);
  expect(service.image).toEqual(image());
  vi.spyOn(repo, 'saveResources').mockRejectedValue(Error('quota'));
  expect(await service.commands.updateUnderlay({ x: 88 })).toBe(false);
  expect(service.image.x).toBe(10);
  expect(m).toEqual(before);
});

test('survey stamps include owner movement and zero offset is a measured value', () => {
  const m = layout();
  m.boundary.doors = [{ id: 'door', name: '门', type: 'general', side: 'top', width: 2, offset: 0 }];
  const target = surveyTarget(m, 'door');
  const record = createSurvey(target, { date: '2026-10-07', unit: 'mm', values: { width: 2000, offset: 0 } });
  record.appliedGeometry = geometryStamp(target);
  expect(surveyStatus(record, target)).toBe('已应用');
  m.boundary.x++;
  expect(surveyStatus(record, target)).toBe('待复核');
});

test('survey metadata write failure restores geometry and original Undo stack', async () => {
  const db = database(),
    repo = createIndexedDbWorkspaceRepository(db),
    e = editor();
  const id = e.model().racks[0].id,
    before = structuredClone(e.model());
  const service = createWorkspaceResources({
    repository: repo,
    model: e.model,
    canEdit: () => true,
    execute: e.history.execute,
    checkpoint: e.history.checkpoint,
    selectedId: () => id,
    changed() {},
    cancelCad() {},
  });
  await service.reload();
  await service.commands.saveSurvey(id, {
    unit: 'm',
    date: '2026-10-07',
    values: { width: 1.7, depth: 1.8, levelHeight: 1.9 },
  });
  vi.spyOn(repo, 'saveResources').mockRejectedValue(Error('quota'));
  expect(await service.commands.applySurvey(id)).toBe(false);
  expect(e.model()).toEqual(before);
  expect(e.history.canUndo()).toBe(false);
  expect(e.history.canRedo()).toBe(false);
  expect(service.snapshot().survey.status).toBe('已记录待应用');
});
