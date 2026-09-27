import assert from 'node:assert/strict';
import {
  corners,
  overlaps,
  ensureSpatial,
  defaultAreas,
  spatialWarnings,
  validateArea,
} from '../src/core/spatial/spatial.js';
const boundary = { id: 'boundary', name: '仓库', x: 0, y: 0, width: 20, depth: 20, rotation: 0 };
const area = { id: 'a', name: '通道', type: 'aisle', x: 5, y: 5, width: 2, depth: 10, rotation: 0 };
const rack = { id: 'r', name: '货架', x: 6, y: 6, width: 2, cols: 2, depth: 1, rotation: 0 };
assert(overlaps(rack, area));
assert(!overlaps({ ...rack, x: 7 }, area));
assert(overlaps({ ...rack, x: 7.5, y: 6, rotation: 90 }, area));
assert(!overlaps({ ...rack, x: 12, y: 12, rotation: 45 }, area));
assert.equal(corners({ ...rack, rotation: 90 })[1].y, 10);
assert(spatialWarnings({ boundary, areas: [area], racks: [rack] }).some(w => w.text.includes('占用')));
assert(spatialWarnings({ boundary, areas: [], racks: [{ ...rack, x: 19 }] }).some(w => w.text.includes('超出')));
assert.equal(spatialWarnings({ boundary, areas: [area], racks: [{ ...rack, x: 10 }] }).length, 0);
assert.throws(() => validateArea({ ...area, width: 0 }));
assert.throws(() => validateArea({ ...area, depth: NaN }));
assert.throws(() => validateArea({ ...boundary, rotation: 1 }, true));
const legacy = { racks: [rack] },
  before = structuredClone(rack);
ensureSpatial(legacy);
assert.deepEqual(legacy.racks[0], before);
assert.equal(legacy.areas.length, 0);
validateArea(legacy.boundary, true);
legacy.areas = defaultAreas(legacy);
assert.equal(legacy.areas.length, 3);
legacy.areas.forEach(a => validateArea(a));
assert.equal(spatialWarnings(legacy).length, 0);
const clone = JSON.parse(JSON.stringify(legacy));
ensureSpatial(clone);
assert.deepEqual(clone, legacy);
console.log('PASS: rotated overlap, touching edges, boundaries, invalid dimensions, migration and spatial persistence');
