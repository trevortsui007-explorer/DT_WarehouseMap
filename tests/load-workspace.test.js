import { expect, test, vi } from 'vitest';
import { loadWorkspace } from '../src/application/layout/load-workspace.js';
import { seed } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';

test('explicitly absent editable layout opens blank geometry without writing remote data', async () => {
  const remote = {
    getPublishedLayout: vi.fn(async () => ({
      layoutCode: 'NEW',
      exists: false,
      publishedVersion: null,
      layout: null,
      capabilities: { canEditLayout: true },
    })),
    getServerDraft: vi.fn(),
  };
  const model = await loadWorkspace({ load: async () => null }, { remote, layoutCode: 'NEW' });
  expect(model.layoutCode).toBe('NEW');
  expect(model.racks).toEqual([]);
  expect(remote.getServerDraft).not.toHaveBeenCalled();
});

test('fresh configured workspace loads authoritative geometry, not seed identity', async () => {
  const layout = validateLayout(seed());
  layout.racks[0].name = '服务器货架';
  const remote = { getPublishedLayout: vi.fn(async () => ({ layoutCode: 'MAIN', publishedVersion: 21, layout })) };
  const model = await loadWorkspace({ load: async () => null }, { remote });
  expect(model).toEqual(layout);
});

test('fresh configured workspace fails closed instead of substituting demo geometry after API failure', async () => {
  const remote = {
    getPublishedLayout: vi.fn(async () => {
      throw Error('offline');
    }),
  };
  await expect(loadWorkspace({ load: async () => null }, { remote })).rejects.toThrow('offline');
});

test('existing local work has priority and cannot be silently switched to another configured layout', async () => {
  const layout = validateLayout(seed());
  const remote = { getPublishedLayout: vi.fn() };
  const local = { load: async () => ({ model: layout }) };
  expect(await loadWorkspace(local, { remote })).toEqual(layout);
  expect(remote.getPublishedLayout).not.toHaveBeenCalled();
  await expect(loadWorkspace(local, { remote, layoutCode: 'OTHER' })).rejects.toThrow('本机草稿');
});
