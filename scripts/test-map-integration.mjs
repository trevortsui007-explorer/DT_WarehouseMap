import assert from 'node:assert/strict';
import { seed } from '../src/core/model/model.js';
import { validateLayout } from '../src/core/model/layout-validation.js';
import { createHttpClient } from '../src/infrastructure/api/http-client.js';
import { createRemoteLayoutRepository } from '../src/infrastructure/persistence/remote/remote-layout-repository.js';
import { createRemoteLifecycle } from '../src/application/layout/remote-lifecycle.js';

// Explicit opt-in, uses a unique TEST layout and leaves an inspectable audit trail.
if (!process.env.MAP_TEST_BASE) throw Error('Set MAP_TEST_BASE to the local test host URL.');
const request = createHttpClient(process.env.MAP_TEST_BASE);
const remote = createRemoteLayoutRepository(request);
let model = validateLayout(seed());
model.layoutCode = 'TEST_PHASE1_' + crypto.randomUUID().slice(0, 8);
model.layoutId = model.layoutCode;
model.racks = model.racks.slice(0, 2);
const code = model.layoutCode;
let localState, publishRequest;
const publish = remote.publishLayout;
remote.publishLayout = (c, dto) => {
  publishRequest = structuredClone(dto);
  return publish(c, dto);
};
const service = createRemoteLifecycle({
  model: () => model,
  remote,
  scope: 'integration',
  local: {
    getRemoteState: async () => localState,
    setRemoteState: async (_, value) => {
      localState = structuredClone(value);
    },
  },
  changed() {},
  flush: async () => true,
  replace: async next => {
    model = next;
    return true;
  },
});
await service.initialize();
assert.equal(service.state.serverExists, false);
assert.equal(await service.save(), true, JSON.stringify(service.state.error));
assert.equal(service.state.draftRevision, 0);
await assert.rejects(remote.initializeLayout(code, model), e => e.status === 409);
model.racks[0].x += 0.5;
assert.equal(await service.save(), true, JSON.stringify(service.state.error));
assert.equal(service.state.draftRevision, 1);
await assert.rejects(
  remote.saveServerDraft(code, { expectedDraftRevision: 0, basedOnPublishedVersion: null, layout: model }),
  e => e.status === 409
);
assert.equal(await service.publish(), true, JSON.stringify(service.state.error));
assert.equal(service.state.publishedVersion, 1);
const firstRequest = structuredClone(publishRequest);
const first = await remote.getVersion(code, 1);
assert.equal((await publish(code, firstRequest)).publishedVersion, 1);
assert.equal((await remote.listVersions(code)).length, 1);
model.racks[0].x += 1;
assert.equal(await service.save(), true, JSON.stringify(service.state.error));
assert.deepEqual((await remote.getPublishedLayout(code)).layout, first.layout);
const draft = await remote.getServerDraft(code);
const invalid = structuredClone(model);
invalid.racks[0].slots[0].id = invalid.racks[0].id;
await assert.rejects(
  request(`/api/wms-fg/map/layouts/${code}/draft`, {
    method: 'PUT',
    body: { expectedDraftRevision: draft.draftRevision, basedOnPublishedVersion: 1, layout: invalid },
  }),
  e => e.status === 422
);
assert.equal((await remote.getServerDraft(code)).draftRevision, draft.draftRevision);
const renamed = structuredClone(model);
renamed.racks[0].slots[0].code += '-EDIT';
const renamedSaved = await remote.saveServerDraft(code, {
  expectedDraftRevision: draft.draftRevision,
  basedOnPublishedVersion: 1,
  layout: renamed,
});
await assert.rejects(
  publish(code, {
    requestId: crypto.randomUUID(),
    expectedDraftRevision: renamedSaved.draftRevision,
    basedOnPublishedVersion: 1,
  }),
  e => e.status === 409
);
assert.equal((await remote.listVersions(code)).length, 1);
const restored = await remote.saveServerDraft(code, {
  expectedDraftRevision: renamedSaved.draftRevision,
  basedOnPublishedVersion: 1,
  layout: model,
});
const second = await publish(code, {
  requestId: crypto.randomUUID(),
  expectedDraftRevision: restored.draftRevision,
  basedOnPublishedVersion: 1,
});
assert.equal(second.publishedVersion, 2);
assert.deepEqual((await remote.getVersion(code, 1)).layout, first.layout);
assert.equal((await remote.listVersions(code)).length, 2);
assert.notEqual((await remote.getServerDraft(code)).savedBy, 'client');
console.log(
  JSON.stringify({
    result: 'PASS',
    layoutCode: code,
    publishedVersion: 2,
    checks: [
      'frontend lifecycle',
      'initialization conflict',
      'draft concurrency',
      'publish retry',
      'immutable snapshots',
      'validation rollback',
      'published identity',
      'versions',
    ],
  })
);
