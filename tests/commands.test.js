import { expect, test, vi } from 'vitest';
import { createSessionHistory } from '../src/application/history/session-history.js';
import { createGeometryCommands } from '../src/application/commands/geometry-commands.js';
import { seed } from '../src/core/model/model.js';
import { ensureSpatial } from '../src/core/spatial/spatial.js';
test('one command records one history entry and invalid changes roll back without autosave', () => {
  let model = ensureSpatial(seed()),
    editable = true;
  const changed = vi.fn();
  const history = createSessionHistory({
    model: () => model,
    replace: next => (model = next),
    canEdit: () => editable,
    beforeCommand() {},
    afterRestore() {},
    changed,
    render() {},
    toast() {},
  });
  const commands = createGeometryCommands({
    model: () => model,
    objects: () => model.racks,
    execute: history.execute,
    select() {},
  });
  const original = structuredClone(model);
  commands.move(model.racks.slice(0, 2), 1, 0.5);
  expect(changed).toHaveBeenCalledTimes(1);
  history.undo();
  expect(model).toEqual(original);
  history.redo();
  expect(model.racks[0].x).toBe(original.racks[0].x + 1);
  const count = changed.mock.calls.length;
  commands.move(model.racks, 10000, 0);
  expect(changed).toHaveBeenCalledTimes(count);
  editable = false;
  commands.move(model.racks, 1, 0);
  expect(changed).toHaveBeenCalledTimes(count);
});
