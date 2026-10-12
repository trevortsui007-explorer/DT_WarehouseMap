import { expect, test, vi } from 'vitest';
import { seed } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';
import { createRemoteLifecycle } from '../src/application/layout/remote-lifecycle.js';
import { createHttpClient } from '../src/infrastructure/api/http-client.js';
import { createRemoteLayoutRepository } from '../src/infrastructure/persistence/remote/remote-layout-repository.js';

test('only explicitly local workspaces unlock codes without server identity verification', async () => {
  const model = validateLayout(seed());
  const slot = model.racks[0].slots[0];
  for (const localOnly of [true, false, undefined]) {
    const service = createRemoteLifecycle({ model: () => model, localOnly, changed: vi.fn() });
    await service.initialize();
    expect(service.canRename(slot)).toBe(localOnly === true);
    expect(service.canRename(null)).toBe(false);
    expect(service.state.identityVerified).toBe(false);
    expect(service.state.capabilities.canPublishLayout).toBe(false);
  }
});

test('a configured remote cannot bypass verification through the local flag', async () => {
  const model = validateLayout(seed());
  const service = createRemoteLifecycle({
    model: () => model,
    localOnly: true,
    remote: { getPublishedLayout: vi.fn().mockRejectedValue(Error('offline')) },
    changed: vi.fn(),
  });
  await service.initialize();
  expect(service.canRename(model.racks[0].slots[0])).toBe(false);
});

async function setup() {
  let model = validateLayout(seed());
  const published = structuredClone(model);
  const local = { getRemoteState: vi.fn(), setRemoteState: vi.fn() };
  let revision = 8;
  const remote = {
    getPublishedLayout: vi.fn(async () => ({
      layoutCode: 'MAIN',
      layout: published,
      publishedVersion: 21,
      capabilities: { canEditLayout: true, canSaveDraft: true, canPublishLayout: true },
    })),
    getServerDraft: vi.fn(async () => ({
      layoutCode: 'MAIN',
      layout: published,
      draftRevision: revision,
      basedOnPublishedVersion: 21,
    })),
    saveServerDraft: vi.fn(async (_, dto) => ({
      layoutCode: 'MAIN',
      draftRevision: ++revision,
      basedOnPublishedVersion: dto.basedOnPublishedVersion,
    })),
    publishLayout: vi.fn(async () => ({ layoutCode: 'MAIN', status: 'PUBLISHED', publishedVersion: 22 })),
  };
  const replace = vi.fn(async next => {
    model = next;
    return true;
  });
  const service = createRemoteLifecycle({
    model: () => model,
    local,
    remote,
    scope: 'test',
    changed: vi.fn(),
    flush: vi.fn(async () => true),
    replace,
  });
  await service.initialize();
  return { service, remote, local, replace, model: () => model };
}

test('publish retry preserves the request ID after a lost response', async () => {
  const env = await setup();
  await env.service.loadDraft();
  env.remote.publishLayout.mockRejectedValueOnce(Error('response lost'));
  expect(await env.service.publish()).toBe(false);
  const first = env.remote.publishLayout.mock.calls[0][1].requestId;
  expect(await env.service.publish()).toBe(true);
  expect(env.remote.publishLayout.mock.calls[1][1].requestId).toBe(first);
});

test('publish retry after re-reading published state accepts the already committed version', async () => {
  const env = await setup();
  await env.service.loadDraft();
  env.local.setRemoteState.mockImplementation(async (_, value) =>
    env.local.getRemoteState.mockResolvedValue(structuredClone(value))
  );
  env.remote.publishLayout.mockRejectedValueOnce(Error('lost response'));
  expect(await env.service.publish()).toBe(false);
  const pendingId = env.remote.publishLayout.mock.calls[0][1].requestId;
  env.remote.getPublishedLayout.mockResolvedValue({
    layoutCode: 'MAIN',
    publishedVersion: 22,
    layout: structuredClone(env.model()),
    capabilities: { canEditLayout: true, canSaveDraft: true, canPublishLayout: true },
  });
  await env.service.initialize();
  expect(await env.service.publish()).toBe(true);
  expect(env.remote.publishLayout.mock.calls[1][1].requestId).toBe(pendingId);
});

test('loading published geometry requires a fresh draft baseline before saving', async () => {
  const env = await setup();
  await env.service.loadDraft();
  expect(await env.service.loadPublished()).toBe(true);
  expect(env.replace).toHaveBeenCalled();
  expect(env.service.state.draftRevision).toBe(null);
  expect(await env.service.save()).toBe(false);
  expect(env.remote.saveServerDraft).not.toHaveBeenCalled();
});

test('draft revision increments without formal publication; only server Publish changes publishedVersion', async () => {
  const env = await setup();
  expect(await env.service.save()).toBe(false); // No blind overwrite before a concurrency baseline.
  await env.service.loadDraft();
  env.model().racks[0].x++;
  expect(await env.service.save()).toBe(true);
  expect(env.service.state.draftRevision).toBe(9);
  expect(env.service.state.publishedVersion).toBe(21);
  expect(env.remote.saveServerDraft.mock.calls[0][1].expectedDraftRevision).toBe(8);
  await env.service.save();
  expect(env.service.state.draftRevision).toBe(10);
  expect(await env.service.publish()).toBe(true);
  expect(env.service.state.publishedVersion).toBe(22);
});

test('published LocationCode is locked, rack display rename is allowed, unsafe deletion surfaces structured server error', async () => {
  const env = await setup();
  await env.service.loadDraft();
  const slot = env.model().racks[0].slots[0];
  expect(env.service.canRename(slot)).toBe(false);
  const next = structuredClone(env.model());
  next.racks[0].slots[0].code = 'RENAMED';
  expect(() => env.service.assertIdentity(next)).toThrow('联系 IT');
  next.racks[0].slots[0].code = slot.code;
  next.racks[0].name = '显示名称';
  expect(() => env.service.assertIdentity(next)).not.toThrow();
  env.model().racks.splice(0, 1);
  await env.service.save();
  env.remote.publishLayout.mockRejectedValueOnce(
    Object.assign(Error('货位存在活动上架任务，请联系 IT'), {
      code: 'LOCATION_IN_USE',
      details: [{ locationCode: slot.code, reason: 'ACTIVE_PUTAWAY_TASK' }],
    })
  );
  expect(await env.service.publish()).toBe(false);
  expect(env.service.state.error.code).toBe('LOCATION_IN_USE');
  expect(env.service.state.error.details[0].reason).toBe('ACTIVE_PUTAWAY_TASK');
  expect(env.service.state.publishedVersion).toBe(21);
});

test('409 preserves local working model, does not retry overwrite and keeps expected revision', async () => {
  const env = await setup();
  await env.service.loadDraft();
  env.model().racks[0].x = 50;
  const before = structuredClone(env.model());
  env.remote.saveServerDraft.mockRejectedValueOnce(
    Object.assign(Error('冲突'), { code: 'LAYOUT_DRAFT_CONFLICT', status: 409 })
  );
  expect(await env.service.save()).toBe(false);
  expect(env.service.state.status).toBe('conflict');
  expect(env.service.state.draftRevision).toBe(8);
  expect(env.model()).toEqual(before);
  expect(env.replace).toHaveBeenCalledTimes(1);
  expect(await env.service.save()).toBe(false);
  expect(env.remote.saveServerDraft).toHaveBeenCalledTimes(1);
});

test('late draft acknowledgement does not mark newer local edits as synchronized', async () => {
  const env = await setup();
  await env.service.loadDraft();
  let acknowledge;
  env.remote.saveServerDraft.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        acknowledge = resolve;
      })
  );
  const originalX = env.model().racks[0].x;
  const saving = env.service.save();
  await Promise.resolve();
  env.model().racks[0].x++;
  env.service.changed();
  acknowledge({ layoutCode: 'MAIN', draftRevision: 9, basedOnPublishedVersion: 21 });
  expect(await saving).toBe(true);
  expect(env.remote.saveServerDraft.mock.calls[0][1].layout.racks[0].x).toBe(originalX);
  expect(env.service.state.serverDirty).toBe(true);
  expect(await env.service.publish()).toBe(false);
  expect(env.remote.publishLayout).not.toHaveBeenCalled();
});

test('metadata refresh retains persisted concurrency checkpoint rather than adopting latest server draft', async () => {
  const env = await setup();
  env.local.getRemoteState.mockResolvedValueOnce({ draftRevision: 5, basedOnPublishedVersion: 21, synced: null });
  await env.service.initialize();
  expect(env.service.state.draftRevision).toBe(5);
  expect(env.remote.getServerDraft).not.toHaveBeenCalled();
  expect(env.service.state.serverDirty).toBe(true);
});

test('HTTP repository sends distinct DTO versions, strips runtime and preserves structured errors', async () => {
  const transport = vi.fn(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ code: 'LAYOUT_DRAFT_CONFLICT', message: 'conflict', details: { draftRevision: 9 } }),
  }));
  const remote = createRemoteLayoutRepository(createHttpClient('https://wms.example', { transport }));
  const layout = seed();
  layout.racks[0].slots[0].cartons = 99;
  await expect(
    remote.saveServerDraft('MAIN', { expectedDraftRevision: 8, basedOnPublishedVersion: 21, layout })
  ).rejects.toMatchObject({ code: 'LAYOUT_DRAFT_CONFLICT', status: 409, details: { draftRevision: 9 } });
  const [url, options] = transport.mock.calls[0];
  expect(url).toBe('https://wms.example/api/wms-fg/map/layouts/MAIN/draft');
  expect(options.method).toBe('PUT');
  expect(options.body).not.toContain('cartons');
  expect(JSON.parse(options.body)).toMatchObject({
    expectedDraftRevision: 8,
    basedOnPublishedVersion: 21,
    schemaVersion: 6,
  });
});
