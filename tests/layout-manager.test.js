// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createLayoutManager } from '../src/application/layout/layout-manager.js';
import { createLayoutStore } from '../src/infrastructure/persistence/layout-store.js';
import { seed } from '../src/core/model/model.js';
import { ensureSpatial } from '../src/core/spatial/spatial.js';

let manager, controller;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await manager?.dispose();
  controller?.abort();
  vi.useRealTimers();
});
function setup() {
  const values = new Map();
  let reject = false;
  const store = createLayoutStore({
    getItem: key => values.get(key),
    setItem: (key, value) => {
      if (reject) throw Error('quota');
      values.set(key, value);
    },
  });
  const model = ensureSpatial(seed());
  const replace = vi.fn();
  let state = {};
  controller = new AbortController();
  manager = createLayoutManager({
    store,
    model: () => model,
    canEdit: () => true,
    replace,
    toast: vi.fn(),
    signal: controller.signal,
    patch: patch => (state = { ...state, ...patch }),
  });
  return { model, store, replace, state: () => state, reject: value => (reject = value) };
}
test('autosave failure keeps dirty memory and can be retried without replacing layout', async () => {
  const env = setup();
  env.reject(true);
  manager.changed();
  await vi.advanceTimersByTimeAsync(1200);
  expect(env.state().saveState).toContain('保存失败');
  expect(env.replace).not.toHaveBeenCalled();
  expect(env.model.racks).toHaveLength(18);
  expect(await manager.flush()).toBe(false);
  env.reject(false);
  expect(await manager.flush()).toBe(true);
  expect(env.store.load().model).toEqual(env.model);
});
test('import validation and failed atomic save never replace the current model', async () => {
  const env = setup();
  await manager.importFile({ size: 5, name: 'bad.json', text: async () => '{bad' });
  expect(env.state().layout.canApply).toBe(false);
  await manager.apply();
  expect(env.replace).not.toHaveBeenCalled();
  await manager.importFile({ size: 100, name: 'valid.json', text: async () => JSON.stringify(env.model) });
  env.reject(true);
  await manager.apply();
  expect(env.replace).not.toHaveBeenCalled();
  expect(env.state().layout.layoutError).toContain('未替换布局');
});

test('autosave waits 1200 ms after the last command and does not mark later edits as saved', async () => {
  const env = setup();
  const realSave = env.store.save;
  let release;
  const gate = new Promise(resolve => (release = resolve));
  const save = vi.spyOn(env.store, 'save').mockImplementationOnce(async (...args) => {
    await gate;
    return realSave(...args);
  });
  manager.changed();
  await vi.advanceTimersByTimeAsync(1000);
  manager.changed();
  await vi.advanceTimersByTimeAsync(1199);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(env.state().saveStatus).toBe('saving');
  env.model.racks[0].x += 1;
  manager.changed();
  release();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(env.state().saveStatus).not.toBe('saved');
  await manager.flush();
  expect(env.state().saveStatus).toBe('saved');
  expect(env.store.load().model).toEqual(env.model);
});

test('beforeunload warns while edits are pending instead of claiming asynchronous persistence finished', () => {
  setup();
  manager.changed();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
