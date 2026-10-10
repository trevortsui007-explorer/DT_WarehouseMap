import { expect, test } from 'vitest';
import { alignObjects } from '../src/core/geometry/alignment.js';
import { bounds } from '../src/core/geometry/cad-geometry.js';
const box = (id, x, y, width = 2, depth = 1, rotation = 0) => ({
  id,
  name: id,
  x,
  y,
  width,
  depth,
  rotation,
  type: 'general',
});
test('align rotated edge and leave exact gap without mutating source or reference', () => {
  const reference = box('ref', 1, 2, 3, 4),
    moving = box('a', 10, 6, 2, 1, 90);
  const before = JSON.stringify([reference, moving]);
  const [result] = alignObjects([moving, reference], reference, 'besideRight', 0.23);
  expect(bounds([result]).x).toBeCloseTo(4.23);
  expect(result.rotation).toBe(90);
  expect(JSON.stringify([reference, moving])).toBe(before);
  expect(bounds(alignObjects([moving], reference, 'bottom')).y + bounds([moving]).depth).toBeCloseTo(6);
});
test('distribute actual edge gaps with unequal widths and keep endpoints fixed', () => {
  const objects = [box('a', 0, 0, 2), box('b', 3, 1, 4), box('c', 12, 2, 2)];
  const result = alignObjects(objects, objects[0], 'distributeX');
  expect(result.map(o => o.x)).toEqual([0, 5, 12]);
  expect(result.map(o => o.y)).toEqual([0, 1, 2]);
  expect(() => alignObjects(objects.slice(0, 2), objects[0], 'distributeX')).toThrow('三个');
  expect(() => alignObjects([box('a', 0, 0), box('b', 1, 0), box('c', 2, 0)], objects[0], 'distributeX')).toThrow(
    '空间不足'
  );
});
test('all alignment axes and validation preserve unaffected coordinates', () => {
  const ref = box('ref', 5, 6, 4, 3),
    source = box('a', 0, 0);
  for (const [mode, x, y] of [
    ['left', 5, 0],
    ['right', 7, 0],
    ['top', 0, 6],
    ['bottom', 0, 8],
    ['centerX', 6, 0],
    ['centerY', 0, 7],
    ['besideLeft', 2.5, 0],
    ['besideTop', 0, 4.5],
    ['besideBottom', 0, 9.5],
  ]) {
    expect(alignObjects([source], ref, mode, 0.5)[0]).toMatchObject({ x, y });
  }
  expect(() => alignObjects([source], ref, 'left', -1)).toThrow();
});

test('selection alignment uses collective outer edges without an anchor', () => {
  const objects = [box('a', 4, 5, 2, 2), box('b', -3, 9, 4, 1), box('c', 8, 0, 1, 3)];
  const original = JSON.stringify(objects);
  expect(alignObjects(objects, null, 'left').map(o => o.x)).toEqual([-3, -3, -3]);
  expect(alignObjects(objects, null, 'right').map(o => o.x + o.width)).toEqual([9, 9, 9]);
  expect(alignObjects(objects, null, 'top').map(o => o.y)).toEqual([0, 0, 0]);
  expect(alignObjects(objects, null, 'bottom').map(o => o.y + o.depth)).toEqual([10, 10, 10]);
  expect(alignObjects(objects, null, 'centerX').map(o => o.x + o.width / 2)).toEqual([3, 3, 3]);
  expect(alignObjects(objects, null, 'centerY').map(o => o.y + o.depth / 2)).toEqual([5, 5, 5]);
  expect(JSON.stringify(objects)).toBe(original);
  expect(() => alignObjects([objects[0]], null, 'left')).toThrow('两个');
});
