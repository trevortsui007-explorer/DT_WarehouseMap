import assert from 'node:assert/strict';
import {
  bounds,
  boxSelect,
  transform,
  snapMove,
  arrayOffsets,
  copies,
  validateObjects,
} from '../src/core/geometry/cad-geometry.js';
import { seed } from '../src/core/model/model.js';
const model = seed();
model.areas = [];
const r = model.racks[0],
  a = { id: 'area', name: '通道', type: 'aisle', x: 20, y: 5, width: 2, depth: 8, rotation: 0 };
const b = bounds([r]);
assert.equal(b.width, 8.100000000000001);
assert.deepEqual(boxSelect([r], { x: r.x - 0.1, y: r.y - 0.1, width: 9, depth: 2 }, false), [r.id]);
assert.deepEqual(boxSelect([r], { x: r.x + 1, y: r.y, width: 1, depth: 1 }, false), []);
assert.deepEqual(boxSelect([r], { x: r.x + 1, y: r.y, width: 1, depth: 1 }, true), [r.id]);
const list = [r, a],
  pivot = { x: 10, y: 10 },
  turned = transform(list, 0, 0, 90, pivot),
  back = transform(turned, 0, 0, -90, pivot);
for (let i = 0; i < list.length; i++) {
  assert(Math.abs(back[i].x - list[i].x) < 1e-9);
  assert(Math.abs(back[i].y - list[i].y) < 1e-9);
}
assert(
  Math.abs(Math.hypot(turned[0].x - turned[1].x, turned[0].y - turned[1].y) - Math.hypot(r.x - a.x, r.y - a.y)) < 1e-9
);
assert.throws(() => transform(list, NaN, 0, 0, pivot));
const offsets = arrayOffsets([r], 3, 2, 2, 3);
assert.equal(offsets.length, 5);
assert(Math.abs(offsets[0].dx - (b.width + 2)) < 1e-9);
assert(Math.abs(offsets[1].dy - (b.depth + 3)) < 1e-9);
const original = JSON.stringify(model),
  added = copies([r], offsets, model);
assert.equal(added.length, 5);
assert(added.every(o => o.fgCode === r.fgCode && o.slots.every(s => !('cartons' in s))));
assert.equal(new Set(added.flatMap(o => o.slots.map(s => s.code))).size, 30);
assert.equal(JSON.stringify(model), original);
assert(!added.flatMap(o => o.slots).some(s => r.slots.some(old => old.id === s.id)));
assert.throws(() => arrayOffsets([r], 20, 20, 2, 2));
assert.throws(() => arrayOffsets([r], 2, 2, -1, 2));
assert.throws(() => arrayOffsets([r], 1.5, 2, 2, 2));
const target = { ...a, x: 30, y: 30 },
  snap = snapMove([a], [target], 9.9, 25.05, 0.2);
assert.equal(snap.dx, 10);
assert.equal(snap.dy, 25);
assert.equal(snap.guides.length, 2);
assert.deepEqual(snapMove([a], [target], 0.123, 0.234, 0.2, true), { dx: 0.123, dy: 0.234, guides: [] });
assert.throws(() => validateObjects([{ ...a, x: 500 }], model));
console.log(
  'PASS: directional box selection, group rotation, net-gap arrays, unique empty copies, corner snapping, bounds validation'
);
