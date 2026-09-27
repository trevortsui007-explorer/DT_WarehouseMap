import { expect, test, vi } from 'vitest';
import { createRuntimeStore } from '../src/application/runtime/runtime-store.js';
import { createRuntimeSession } from '../src/application/runtime/runtime-session.js';
import { createSignalRClient } from '../src/infrastructure/realtime/signalr-client.js';

const location = count => ({
  locationCode: 'L1',
  huCount: count ? 1 : 0,
  outerBoxCount: count,
  occupancyStatus: count ? 'OCCUPIED' : 'EMPTY',
  lockStatus: 'NORMAL',
  updatedAt: new Date().toISOString(),
});
const snapshot = (sequence, count = 2) => ({
  warehouseCode: 'W',
  sequence,
  generatedAt: new Date().toISOString(),
  locations: [location(count)],
});
const delta = (sequence, count = 3) => ({
  warehouseCode: 'W',
  sequence,
  eventType: 'LocationRuntimeChanged',
  locationCode: 'L1',
  state: location(count),
});
function setup() {
  const changed = vi.fn();
  const store = createRuntimeStore('W', changed);
  const repository = { getSnapshot: vi.fn(async () => snapshot(10)) };
  let handlers;
  const realtime = {
    connect: vi.fn(async (_, callbacks) => {
      handlers = callbacks;
    }),
    stop: vi.fn(async () => {}),
  };
  const session = createRuntimeSession({
    store,
    repository,
    realtime,
    scope: { warehouseCode: 'W', layoutCode: 'MAIN' },
  });
  return { store, changed, repository, realtime, session, handlers: () => handlers };
}

test('GET establishes baseline; connect followed by second GET; stale delta ignored and update targets location', async () => {
  const env = setup();
  expect(env.store.state.status).toBe('loading');
  await env.session.start();
  expect(env.repository.getSnapshot).toHaveBeenCalledTimes(2);
  expect(env.store.state.status).toBe('ready');
  expect(env.store.state.connected).toBe(true);
  env.changed.mockClear();
  env.handlers().event(delta(9, 99));
  expect(env.changed).not.toHaveBeenCalled();
  env.handlers().event(delta(11, 5));
  expect(env.changed).toHaveBeenLastCalledWith('L1');
  expect(env.store.state.locations.L1.outerBoxCount).toBe(5);
  await env.session.dispose();
});

test('snapshot failure is ERROR without demo or connection; manual retry is possible', async () => {
  const env = setup();
  env.repository.getSnapshot.mockRejectedValueOnce(Error('unavailable'));
  await env.session.start();
  expect(env.store.state.status).toBe('error');
  expect(Object.keys(env.store.state.locations)).toHaveLength(0);
  expect(env.realtime.connect).not.toHaveBeenCalled();
  await env.session.start();
  expect(env.store.state.status).toBe('ready');
});

test('sequence gap and reconnect both require authoritative snapshot resync', async () => {
  const env = setup();
  await env.session.start();
  env.repository.getSnapshot.mockResolvedValueOnce(snapshot(13, 7));
  env.handlers().event(delta(13, 99));
  await env.session.resync();
  expect(env.store.state.sequence).toBe(13);
  expect(env.store.state.locations.L1.outerBoxCount).toBe(7);
  env.handlers().reconnecting();
  expect(env.store.state.status).toBe('reconnecting');
  env.repository.getSnapshot.mockResolvedValueOnce(snapshot(20, 8));
  await env.handlers().reconnected();
  expect(env.store.state.sequence).toBe(20);
  expect(env.store.state.locations.L1.outerBoxCount).toBe(8);
  expect(env.store.state.status).toBe('ready');
});

test('events during subscription and snapshot are buffered, sorted and replayed after baseline', async () => {
  const env = setup();
  env.realtime.connect.mockImplementationOnce(async (_, callbacks) => {
    callbacks.event(delta(12, 12));
    callbacks.event(delta(11, 11));
  });
  await env.session.start();
  expect(env.store.state.sequence).toBe(12);
  expect(env.store.state.locations.L1.outerBoxCount).toBe(12);
});

test('inconsistent sequence retries are bounded and failed resync retains stale baseline', async () => {
  const env = setup();
  await env.session.start();
  env.handlers().event(delta(30));
  await env.session.resync();
  expect(env.repository.getSnapshot).toHaveBeenCalledTimes(5);
  expect(env.store.state.status).toBe('stale');
  expect(env.store.state.sequence).toBe(10);
});

test('disconnect during initial subscription is never reported as connected', async () => {
  const env = setup();
  env.realtime.connect.mockImplementationOnce(async (_, callbacks) => {
    callbacks.closed(Error('lost'));
  });
  await env.session.start();
  expect(env.store.state.status).toBe('stale');
  expect(env.store.state.connected).toBe(false);
});

test('buffer overflow while GET is pending forces another authoritative snapshot', async () => {
  const env = setup();
  await env.session.start();
  let resolve;
  env.repository.getSnapshot.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const syncing = env.session.resync();
  for (let sequence = 11; sequence <= 5011; sequence++) env.handlers().event(delta(sequence));
  env.repository.getSnapshot.mockResolvedValueOnce(snapshot(5011, 20));
  resolve(snapshot(10));
  await syncing;
  expect(env.store.state.sequence).toBe(5011);
  expect(env.store.state.status).toBe('ready');
});

test('disposal discards late GET response and aborts transport', async () => {
  const env = setup();
  let resolve;
  env.repository.getSnapshot.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const started = env.session.start();
  await Promise.resolve();
  await env.session.dispose();
  resolve(snapshot(30));
  await started;
  expect(env.store.state.sequence).toBe(null);
  expect(env.repository.getSnapshot.mock.calls[0][1].aborted).toBe(true);
});

test('SignalR adapter subscribes on start/reconnect and transports only runtime', async () => {
  const callbacks = {};
  const connection = {
    on: vi.fn(),
    onreconnecting: fn => {
      callbacks.reconnecting = fn;
    },
    onreconnected: fn => {
      callbacks.reconnected = fn;
    },
    onclose: fn => {
      callbacks.closed = fn;
    },
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    invoke: vi.fn(async () => {}),
  };
  const adapter = createSignalRClient('/runtimeHub', { connectionFactory: () => connection });
  const handlers = { event: vi.fn(), reconnecting: vi.fn(), reconnected: vi.fn(), closed: vi.fn() };
  await adapter.connect({ warehouseCode: 'W', layoutCode: 'MAIN' }, handlers);
  expect(connection.on).toHaveBeenCalledWith('LocationRuntimeChanged', expect.any(Function));
  expect(connection.on).toHaveBeenCalledWith('VirtualAreaRuntimeChanged', expect.any(Function));
  const virtualEvent = {
    eventType: 'VirtualAreaRuntimeChanged',
    warehouseCode: 'W',
    virtualLocationCode: 'V1',
    sequence: 11,
    state: { huCount: 1, palletCount: 1, outerBoxCount: 3 },
  };
  connection.on.mock.calls.find(([name]) => name === 'VirtualAreaRuntimeChanged')[1](virtualEvent);
  expect(handlers.event).toHaveBeenCalledWith(virtualEvent);
  expect(connection.invoke).toHaveBeenCalledWith('SubscribeRuntime', { warehouseCode: 'W', layoutCode: 'MAIN' });
  await callbacks.reconnected();
  expect(connection.invoke).toHaveBeenCalledTimes(2);
  expect(handlers.reconnected).toHaveBeenCalledTimes(1);
  await adapter.stop();
});
