// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import Konva from 'konva';
import App from '../src/App.vue';
import { STORE_KEY } from '../src/infrastructure/persistence/layout-store.js';

const workspaceFixture = vi.hoisted(() => ({ enabled: false, databases: [] }));

// Editor integration runs against the async repository contract; Dexie is tested separately with fake IndexedDB.
vi.mock('../src/infrastructure/persistence/browser-layout-repository.js', async () => {
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  const { createWorkspaceDatabase } = await import('../src/infrastructure/persistence/indexeddb/db.js');
  const { createIndexedDbWorkspaceRepository } =
    await import('../src/infrastructure/persistence/indexeddb/workspace-repository.js');
  const { createWorkspaceCatalog } = await import('../src/infrastructure/persistence/indexeddb/workspace-catalog.js');
  const { createLegacyWorkspaceRepository } =
    await import('../src/infrastructure/persistence/legacy/legacy-workspace-repository.js');
  return {
    createBrowserLayoutRepository: () => {
      if (workspaceFixture.enabled) {
        const db = createWorkspaceDatabase('ui-project-' + crypto.randomUUID(), { indexedDB, IDBKeyRange });
        workspaceFixture.databases.push(db);
        const root = createIndexedDbWorkspaceRepository(db);
        root.catalog = createWorkspaceCatalog(db, root);
        return root;
      }
      let resources = { underlay: null, surveys: [] };
      return {
        ...createLegacyWorkspaceRepository(localStorage),
        loadResources: async () => structuredClone(resources),
        saveResources: async (_id, next) => {
          resources = structuredClone(next);
        },
      };
    },
  };
});

const graphics = vi.hoisted(() => ({ renderers: [] }));
const runtimeFixture = vi.hoisted(() => ({ snapshot: null, handlers: null }));
vi.mock('../src/infrastructure/api/runtime-repository.js', async importOriginal => {
  const original = await importOriginal();
  return {
    createRuntimeRepository(request) {
      if (!runtimeFixture.snapshot) return original.createRuntimeRepository(request);
      return { getSnapshot: (...args) => runtimeFixture.snapshot(...args) };
    },
  };
});
vi.mock('../src/infrastructure/realtime/signalr-client.js', () => ({
  createSignalRClient: () => ({
    async stop() {},
    async connect(_, handlers) {
      runtimeFixture.handlers = handlers;
    },
  }),
}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal();
  class WebGLRenderer {
    constructor() {
      this.domElement = document.createElement('canvas');
      graphics.renderers.push(this);
    }
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    setAnimationLoop(callback) {
      this.loop = callback;
    }
    render(scene, camera) {
      this.scene = scene;
      this.camera = camera;
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { ...actual, WebGLRenderer };
});

let wrapper;
beforeEach(() => {
  workspaceFixture.enabled = false;
  runtimeFixture.snapshot = null;
  runtimeFixture.handlers = null;
  vi.useFakeTimers();
  localStorage.clear();
  graphics.renderers.length = 0;
  // Rasterization/WebGL are not available in a DOM test. Keep real scene graphs and editor event handlers.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    const context = {
      canvas: this,
      measureText: text => ({ width: String(text).length * 8 }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      getLineDash: () => [],
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    return new Proxy(context, { get: (target, key) => (key in target ? target[key] : () => {}) });
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(async () => {
  wrapper?.unmount();
  wrapper = null;
  await flushPromises();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(workspaceFixture.databases.splice(0).map(db => db.delete()));
});
async function start() {
  wrapper = mount(App, { attachTo: document.body });
  await nextTick();
  await flushPromises();
  return wrapper;
}
async function edit() {
  await wrapper.get('#work-mode').setValue('edit');
  await flushPromises();
  await nextTick();
  await flushPromises();
}
const key = async (value, options = {}) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: value, ...options }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: value, ...options }));
  await nextTick();
  await flushPromises();
};
const saved = () => JSON.parse(localStorage.getItem(STORE_KEY)).current;

test('room UI creates owned doors, moves shell without racks and renders in both views', async () => {
  await start();
  await edit();
  const add = wrapper.findAll('button').find(button => button.text() === '＋ 房间');
  await add.trigger('click');
  await wrapper.get('#door-add').trigger('click');
  await vi.advanceTimersByTimeAsync(1300);
  const before = saved();
  expect(before.rooms).toHaveLength(1);
  expect(before.rooms[0].doors).toHaveLength(1);
  const id = before.rooms[0].id;
  const node = Konva.stages[0].findOne(item => item.getAttr('objectId') === id);
  node.fire('dragstart', { evt: {} });
  node.position({ x: node.x() + 44, y: node.y() + 22 });
  node.fire('dragmove', { evt: { altKey: true } });
  node.fire('dragend', { evt: {} });
  await nextTick();
  await vi.advanceTimersByTimeAsync(1300);
  expect(saved().rooms[0].x).toBe(before.rooms[0].x + 2);
  expect(saved().racks).toEqual(before.racks);
  expect(saved().rooms[0].doors).toEqual(before.rooms[0].doors);
  await wrapper.get('#undo').trigger('click');
  await vi.advanceTimersByTimeAsync(1300);
  expect(saved().rooms).toEqual(before.rooms);
  await wrapper.get('[data-view="3d"]').trigger('click');
  await nextTick();
  graphics.renderers[0].loop();
  let owned = false;
  graphics.renderers[0].scene.traverse(object => {
    if (object.userData.roomId === id) owned = true;
  });
  expect(owned).toBe(true);
});

test('physical areas show all active bindings in 2D and equal 3D sections; virtual delta targets only its area', async () => {
  const { seed } = await import('../src/core/model/model.js');
  const { validateLayout } = await import('../src/core/model/layout-validation.js');
  const model = validateLayout(seed());
  model.areas = ['A', 'B', 'C'].map((id, index) => ({
    id,
    name: id,
    type: 'inbound',
    x: index * 10,
    y: 0,
    width: 9,
    depth: 6,
    rotation: 0,
  }));
  model.areaBindings = ['V1', 'V2', 'V3', 'V4', 'V5'].map((code, index) => ({
    id: 'binding-' + index,
    areaId: index < 4 ? 'A' : 'B',
    virtualLocationCode: code,
    displayName: code,
    purpose: 'RECEIVING',
    isActive: index !== 3,
  }));
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ format: 1, current: model, savedAt: new Date().toISOString(), history: [] })
  );
  vi.stubEnv('VITE_WMS_WAREHOUSE_CODE', 'W');
  vi.stubEnv('VITE_WMS_HUB_URL', '/test-runtime');
  runtimeFixture.snapshot = async () => ({
    warehouseCode: 'W',
    sequence: 10,
    generatedAt: new Date().toISOString(),
    locations: [],
    virtualAreas: Object.fromEntries(
      ['V1', 'V2', 'V3', 'V4', 'V5'].map(code => [code, { huCount: 9, palletCount: 4, outerBoxCount: 56 }])
    ),
  });
  await start();
  await edit();
  await wrapper.get('[data-area="A"]').trigger('click');
  await flushPromises();
  expect(wrapper.findAll('[data-virtual-code]')).toHaveLength(3);
  expect(wrapper.get('.area-runtime-panel').text()).toContain('合计 27 HU');
  const stage = Konva.stages[0];
  expect(stage.find('.virtual-area-row')).toHaveLength(4);
  expect(stage.find('.virtual-area-row').map(node => node.getAttr('virtualLocationCode'))).not.toContain('V4');
  await wrapper.get('[data-view="3d"]').trigger('click');
  await flushPromises();
  const renderer = graphics.renderers[0];
  renderer.loop();
  const all = [];
  renderer.scene.traverse(node => {
    all.push(node);
  });
  const sections = all.filter(node => node.isMesh && node.userData.virtualLocationCode);
  expect(sections).toHaveLength(4);
  expect(sections.filter(node => node.userData.areaId === 'A').map(node => node.geometry.parameters.width)).toEqual([
    3, 3, 3,
  ]);
  expect(sections.find(node => node.userData.areaId === 'B').geometry.parameters).toMatchObject({ width: 9, depth: 6 });
  expect(all.some(node => node.isMesh && node.userData.areaId === 'C' && node.geometry.parameters.width === 9)).toBe(
    true
  );
  const unrelatedSprite = all.find(node => node.isSprite && node.userData.virtualLocationCode === 'V5');
  const unrelatedTextureVersion = unrelatedSprite.material.map.version;
  const affectedSprite = all.find(node => node.isSprite && node.userData.virtualLocationCode === 'V1');
  const affectedTextureVersion = affectedSprite.material.map.version;
  const localBefore = localStorage.getItem(STORE_KEY);
  runtimeFixture.handlers.event({
    eventType: 'VirtualAreaRuntimeChanged',
    warehouseCode: 'W',
    sequence: 11,
    virtualLocationCode: 'V1',
    state: { huCount: 10, palletCount: 5, outerBoxCount: 60 },
  });
  await flushPromises();
  expect(wrapper.get('.area-runtime-panel').text()).toContain('合计 28 HU');
  expect(affectedSprite.material.map.version).toBeGreaterThan(affectedTextureVersion);
  expect(unrelatedSprite.material.map.version).toBe(unrelatedTextureVersion);
  const after = [];
  renderer.scene.traverse(node => after.push(node));
  expect(after).toEqual(all);
  expect(wrapper.get('#undo').element.disabled).toBe(true);
  await vi.advanceTimersByTimeAsync(1300);
  expect(localStorage.getItem(STORE_KEY)).toBe(localBefore);
  expect(
    stage
      .find('.virtual-area-row')
      .find(node => node.getAttr('virtualLocationCode') === 'V1')
      .text()
  ).toContain('10 HU');
  await wrapper.get('#area-delete').trigger('click');
  await flushPromises();
  await vi.advanceTimersByTimeAsync(1300);
  expect(saved().areaBindings).toHaveLength(1);
  await wrapper.get('#undo').trigger('click');
  await flushPromises();
  await vi.advanceTimersByTimeAsync(1300);
  expect(saved().areaBindings).toHaveLength(5);
});

test('loading has no demo; snapshot and SignalR update both renderers without layout history or autosave', async () => {
  vi.stubEnv('VITE_WMS_WAREHOUSE_CODE', 'W');
  vi.stubEnv('VITE_WMS_HUB_URL', '/test-runtime');
  let resolveSnapshot;
  const pending = new Promise(resolve => {
    resolveSnapshot = resolve;
  });
  runtimeFixture.snapshot = () => pending;
  await start();
  await edit();
  expect(wrapper.get('#runtime-status').text()).toContain('加载中');
  expect(wrapper.findAll('.cell')[0].text()).toBe('—');
  const layout = saved();
  const code = layout.racks[0].slots[0].code;
  const location = count => ({
    locationCode: code,
    huCount: 1,
    outerBoxCount: count,
    occupancyStatus: 'OCCUPIED',
    lockStatus: 'NORMAL',
  });
  const stage = Konva.stages[0];
  const rects = [...stage.find('Rect')];
  const localBefore = localStorage.getItem(STORE_KEY);
  const saveText = wrapper.get('#save-state').text();
  resolveSnapshot({
    warehouseCode: 'W',
    sequence: 10,
    generatedAt: new Date().toISOString(),
    locations: [location(18)],
  });
  await flushPromises();
  expect(wrapper.get('#runtime-status').text()).toContain('实时状态已连接');
  expect(wrapper.findAll('.cell')[0].text()).toBe('18');
  expect([...stage.find('Rect')]).toEqual(rects);
  await wrapper.get('[data-view="3d"]').trigger('click');
  await flushPromises();
  const renderer = graphics.renderers[0];
  renderer.loop();
  const meshes = [];
  renderer.scene.traverse(node => {
    if (node.isMesh) meshes.push(node);
  });
  const slotId = layout.racks[0].slots[0].id;
  const boxes = meshes.filter(mesh => mesh.userData.slotId === slotId && mesh.geometry.parameters.height > 0.03);
  expect(boxes.filter(mesh => mesh.visible)).toHaveLength(6);
  runtimeFixture.handlers.event({
    eventType: 'LocationRuntimeChanged',
    warehouseCode: 'W',
    locationCode: code,
    sequence: 11,
    state: location(4),
  });
  await flushPromises();
  expect(boxes.filter(mesh => mesh.visible)).toHaveLength(4);
  const after = [];
  renderer.scene.traverse(node => {
    if (node.isMesh) after.push(node);
  });
  expect(after).toEqual(meshes);
  expect(wrapper.findAll('.cell')[0].text()).toBe('4');
  expect(wrapper.get('#undo').element.disabled).toBe(true);
  expect(wrapper.get('#save-state').text()).toBe(saveText);
  await vi.advanceTimersByTimeAsync(2000);
  expect(localStorage.getItem(STORE_KEY)).toBe(localBefore);
});

test('Vue shell mounts real Konva scene; mode, selection, editing, undo and autosave remain connected', async () => {
  await start();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(18);
  expect(Konva.stages[0].find('Rect').length).toBeGreaterThan(100);
  expect(wrapper.get('[data-add="1"]').element.disabled).toBe(true);
  await edit();
  await wrapper.get('[data-add="1"]').trigger('click');
  await flushPromises();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(19);
  expect(wrapper.get('#undo').element.disabled).toBe(false);
  await wrapper.get('#undo').trigger('click');
  await flushPromises();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(18);
  await wrapper.get('#redo').trigger('click');
  await flushPromises();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(19);
  // History restores layout, not a deleted object's old selection (baseline behavior).
  await wrapper.findAll('[data-rack]').at(-1).trigger('click');
  await flushPromises();
  const x = Number(wrapper.get('#rack-form [name="x"]').element.value);
  await key('ArrowRight');
  expect(Number(wrapper.get('#rack-form [name="x"]').element.value)).toBeCloseTo(x + 0.1);
  await key('z', { ctrlKey: true });
  expect(Number(wrapper.get('#rack-form [name="x"]').element.value)).toBe(x);
  await wrapper.get('#rack-form [name="name"]').setValue('Vue rack');
  await flushPromises();
  await wrapper.get('#rack-form').trigger('submit');
  await flushPromises();
  await vi.advanceTimersByTimeAsync(1200);
  expect(saved().racks.at(-1).name).toBe('Vue rack');
  await wrapper.get('#work-mode').setValue('view');
  await flushPromises();
  await key('ArrowRight');
  expect(Number(wrapper.get('#rack-form [name="x"]').element.value)).toBe(x);
  expect(wrapper.get('#rack-form [name="x"]').element.disabled).toBe(true);
});

test('multi-selection, FG filters, array/precise dialogs and keyboard commands keep their existing behavior', async () => {
  await start();
  await edit();
  const buttons = wrapper.findAll('[data-rack]');
  await buttons[0].trigger('click');
  await buttons[1].trigger('click', { shiftKey: true });
  expect(wrapper.get('#selection-count').text()).toBe('已选 2 项');
  expect(wrapper.find('#batch-inspector').exists()).toBe(true);
  await wrapper.get('#precise-open').trigger('click');
  await flushPromises();
  await wrapper.get('#precise-form [name="dx"]').setValue('1');
  await flushPromises();
  await wrapper.get('#precise-form').trigger('submit');
  await flushPromises();
  expect(wrapper.get('#precise-dialog').element.open).toBe(false);
  await wrapper.get('#array-open').trigger('click');
  await flushPromises();
  await wrapper.get('#array-form').trigger('submit');
  await flushPromises();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(20);
  await key('z', { ctrlKey: true });
  expect(wrapper.findAll('[data-rack]')).toHaveLength(18);
  await wrapper.get('#zone').setValue('FG01');
  await flushPromises();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(9);
  expect(wrapper.findAll('[data-area]')).toHaveLength(3);
});

test('door panel, along-edge drag, view lock and undo retain boundary-relative positions', async () => {
  await start();
  await edit();
  await wrapper.get('#boundary-edit').trigger('click');
  await flushPromises();
  await wrapper.get('#door-add').trigger('click');
  await flushPromises();
  await wrapper.get('[data-door-select]').trigger('click');
  await flushPromises();
  expect(wrapper.get('#spatial-inspector h2').text()).toBe('门属性');
  let door = Konva.stages[0].findOne('.boundary-door');
  expect(door.draggable()).toBe(true);
  door.fire('dragstart', { evt: {} });
  door.position({ x: 22, y: 19 });
  door.fire('dragmove', { evt: {} });
  door.fire('dragend', { evt: {} });
  await nextTick();
  await flushPromises();
  expect(Number(wrapper.get('.door-form [name="offset"]').element.value)).toBe(1);
  await wrapper.get('#undo').trigger('click');
  await flushPromises();
  await wrapper.get('#boundary-edit').trigger('click');
  await flushPromises();
  expect(Number(wrapper.get('.door-form [name="offset"]').element.value)).toBe(0);
  await wrapper.get('#work-mode').setValue('view');
  await flushPromises();
  door = Konva.stages[0].findOne('.boundary-door');
  expect(door.draggable()).toBe(false);
  expect(wrapper.get('.door-form [name="width"]').element.disabled).toBe(true);
});

test('Three scene builds, rack selection highlight follows FG mode, and unmount releases renderer/listeners', async () => {
  await start();
  await wrapper.get('[data-view="3d"]').trigger('click');
  await flushPromises();
  await nextTick();
  await flushPromises();
  await nextTick();
  await flushPromises();
  const renderer = graphics.renderers[0];
  expect(renderer).toBeDefined();
  renderer.loop();
  expect(renderer.scene.children.length).toBeGreaterThan(2);
  const outlines = () => {
    let count = 0;
    renderer.scene.traverse(node => {
      if (node.isLineSegments && node.type !== 'GridHelper') count++;
    });
    return count;
  };
  expect(outlines()).toBe(1);
  await wrapper.get('#color-mode').setValue('fg');
  await flushPromises();
  renderer.loop();
  expect(outlines()).toBe(1);
  await wrapper.findAll('[data-rack]')[1].trigger('click', { shiftKey: true });
  await flushPromises();
  renderer.loop();
  expect(outlines()).toBe(2);
  wrapper.unmount();
  wrapper = null;
  expect(renderer.disposed).toBe(true);
  expect(renderer.loop).toBe(null);
  expect(Konva.stages).toHaveLength(0);
  await start();
  await edit();
  const x = Number(wrapper.get('#rack-form [name="x"]').element.value);
  await key('ArrowRight');
  expect(Number(wrapper.get('#rack-form [name="x"]').element.value)).toBeCloseTo(x + 0.1);
});

test('existing saved layouts load unchanged and JSON import preserves before-replacement history', async () => {
  await start();
  await edit();
  await wrapper.get('#save').trigger('click');
  await flushPromises();
  const original = saved();
  wrapper.unmount();
  wrapper = null;
  await start();
  expect(wrapper.get('#rack-form [name="name"]').element.value).toBe(original.racks[0].name);
  await edit();
  await wrapper.get('#layout-open').trigger('click');
  await flushPromises();
  const input = wrapper.get('#layout-file');
  const imported = structuredClone(original);
  imported.racks[0].name = 'Imported rack';
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ size: 100, name: 'layout.json', text: async () => JSON.stringify(imported) }],
  });
  await input.trigger('change');
  await nextTick();
  await flushPromises();
  expect(wrapper.get('#layout-apply').element.disabled).toBe(false);
  await wrapper.get('#layout-apply').trigger('click');
  await flushPromises();
  expect(saved().racks[0].name).toBe('Imported rack');
  expect(JSON.parse(localStorage.getItem(STORE_KEY)).history.some(entry => entry.label === '替换前备份')).toBe(true);
  expect(saved().racks[0].slots).toEqual(original.racks[0].slots);
  const backup = JSON.parse(localStorage.getItem(STORE_KEY)).history.find(entry => entry.label === '替换前备份');
  await wrapper.get(`[data-restore="${backup.id}"]`).trigger('click');
  await flushPromises();
  await wrapper.get('#layout-apply').trigger('click');
  await flushPromises();
  expect(saved()).toEqual(original);
});

test('group drag preserves relative positions, Alt precision, cancellation, rotation and focus shortcuts', async () => {
  await start();
  await edit();
  await wrapper.findAll('[data-rack]')[0].trigger('click');
  await flushPromises();
  await wrapper.findAll('[data-rack]')[1].trigger('click', { shiftKey: true });
  await flushPromises();
  const original = saved();
  const ids = original.racks.slice(0, 2).map(rack => rack.id);
  const stage = Konva.stages[0];
  const node = stage.find(item => item.getAttr('objectId') === ids[0])[0];
  node.fire('dragstart', { evt: {} });
  node.x(node.x() + 0.234 * 22);
  node.fire('dragmove', { evt: { altKey: true } });
  node.fire('dragend', { evt: {} });
  await nextTick();
  await flushPromises();
  await wrapper.get('#save').trigger('click');
  await flushPromises();
  for (let i = 0; i < 2; i++) expect(saved().racks[i].x).toBeCloseTo(original.racks[i].x + 0.234);
  await key('z', { ctrlKey: true });
  await wrapper.get('#save').trigger('click');
  await flushPromises();
  expect(saved()).toEqual(original);
  await key('e');
  await wrapper.get('#save').trigger('click');
  await flushPromises();
  expect(saved().racks[0].rotation).toBe(90);
  await key('z', { ctrlKey: true });
  const cancelNode = stage.find(item => item.getAttr('objectId') === ids[0])[0];
  cancelNode.fire('dragstart', { evt: {} });
  cancelNode.x(cancelNode.x() + 40);
  cancelNode.fire('dragmove', { evt: {} });
  await key('Escape');
  await wrapper.get('#save').trigger('click');
  await flushPromises();
  expect(saved()).toEqual(original);
  await key('f');
  const focusScale = stage.scaleX();
  await key('Home');
  expect(stage.scaleX()).not.toBe(focusScale);
});

test('JSON export retains layout and stable codes without runtime inventory', async () => {
  await start();
  let exported;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    exported = blob;
    return 'blob:test-layout';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await wrapper.get('#export').trigger('click');
  await flushPromises();
  expect(JSON.parse(await exported.text())).toEqual(saved());
  expect(await exported.text()).not.toContain('cartons');
  expect(click).toHaveBeenCalledOnce();
});

test('startup load failure blocks editing without overwriting old data and offers a retry', async () => {
  localStorage.setItem(STORE_KEY, '{corrupt');
  await start();
  expect(wrapper.find('.workspace-loading').text()).toContain('本机布局未载入');
  expect(localStorage.getItem(STORE_KEY)).toBe('{corrupt');
  expect(Konva.stages).toHaveLength(0);
  // Recovery is a test action, never an application data-clearing workflow.
  localStorage.removeItem(STORE_KEY);
  await wrapper.get('.workspace-loading button').trigger('click');
  await flushPromises();
  expect(wrapper.findAll('[data-rack]')).toHaveLength(18);
  expect(wrapper.find('.workspace-loading').exists()).toBe(false);
});

test('fixture and general-area UI retains CAD history, colors and measured dimensions in both renderers', async () => {
  await start();
  await edit();
  await wrapper
    .findAll('button')
    .find(button => button.text() === '＋ 固定设施')
    .trigger('click');
  await wrapper.get('#area-form input[name="height"]').setValue('3');
  await wrapper.get('#area-form').trigger('submit');
  await vi.advanceTimersByTimeAsync(1300);
  const id = saved().fixtures[0].id;
  expect(saved().fixtures[0].height).toBe(3);
  const section = wrapper.findAll('.workspace-panel').find(item => item.text().includes('现场实测'));
  await section.get('input[type="date"]').setValue('2026-10-07');
  await section.get('select').setValue('mm');
  const fields = section.findAll('input[type="number"]');
  await fields[0].setValue('1200');
  await fields[1].setValue('800');
  await fields[2].setValue('2400');
  await section.get('form').trigger('submit');
  await flushPromises();
  expect(section.text()).toContain('已记录待应用');
  expect(saved().fixtures[0].height).toBe(3);
  await section
    .findAll('button')
    .find(button => button.text() === '应用已保存实测值')
    .trigger('click');
  await flushPromises();
  await vi.advanceTimersByTimeAsync(1300);
  expect(saved().fixtures[0].height).toBe(2.4);
  expect(section.text()).toContain('已应用');
  await wrapper.get('#undo').trigger('click');
  await vi.advanceTimersByTimeAsync(1300);
  expect(saved().fixtures[0].height).toBe(3);
  expect(section.text()).toContain('待复核');
  await wrapper
    .findAll('button')
    .find(button => button.text() === '＋ 通用区域')
    .trigger('click');
  await wrapper.get('#area-form select[name="color"]').setValue('#d9edf9');
  await wrapper.get('#area-form').trigger('submit');
  await vi.advanceTimersByTimeAsync(1300);
  const area = saved().areas.at(-1);
  const node = Konva.stages[0].findOne(item => item.getAttr('objectId') === area.id);
  expect(node.findOne('Rect').fill()).toBe('#d9edf9');
  expect(saved().areaBindings).toEqual([]);
  await wrapper.get('[data-view="3d"]').trigger('click');
  await nextTick();
  graphics.renderers[0].loop();
  let mesh;
  graphics.renderers[0].scene.traverse(object => {
    if (object.isMesh && object.userData.areaId === id) mesh = object;
  });
  expect(mesh.geometry.parameters.height).toBe(3);
  expect(saved().resources).toBeUndefined();
  expect(saved().surveys).toBeUndefined();
});

test('underlay renderer is non-interactive when locked, captures world coordinates and hides outside 2D edit', async () => {
  const { createUnderlayRenderer } = await import('../src/renderers/konva/underlay.js');
  const container = document.createElement('div');
  document.body.append(container);
  const stage = new Konva.Stage({ container, width: 800, height: 600 });
  stage.add(new Konva.Layer(), new Konva.Layer());
  stage.position({ x: 50, y: 20 });
  stage.scale({ x: 2, y: 2 });
  const state = {
    visible: true,
    interaction: null,
    points: [],
    underlay: {
      dataUrl: 'image',
      pixelWidth: 100,
      pixelHeight: 50,
      scale: 0.1,
      x: 1,
      y: 2,
      rotation: 30,
      opacity: 0.5,
      visible: true,
      locked: true,
    },
  };
  const click = vi.fn(),
    move = vi.fn();
  const renderer = createUnderlayRenderer(stage, 22, {
    state: () => state,
    decodeImage: async () => document.createElement('canvas'),
    click,
    move,
    error: error => {
      throw error;
    },
  });
  try {
    await renderer.render();
    let node = stage.findOne('Image');
    expect(node.getLayer().listening()).toBe(false);
    expect(node.draggable()).toBe(false);
    expect(node.getLayer().zIndex()).toBe(1);
    state.interaction = 'calibrate';
    await renderer.render();
    stage.setPointersPositions({ clientX: 490, clientY: 240 });
    node = stage.findOne('Image');
    node.fire('click', { evt: {} });
    expect(click).toHaveBeenCalledWith({ x: 10, y: 5 });
    state.underlay.locked = false;
    state.interaction = 'move';
    await renderer.render();
    node = stage.findOne('Image');
    node.position({ x: 66, y: 88 });
    node.fire('dragend', {});
    expect(move).toHaveBeenCalledWith({ x: 3, y: 4 });
    state.visible = false;
    await renderer.render();
    expect(stage.findOne('Image')).toBeUndefined();
  } finally {
    renderer.destroy();
    stage.destroy();
    container.remove();
  }
});

test('project manager creates, copies and switches independent maps with real repository scopes', async () => {
  vi.useRealTimers();
  workspaceFixture.enabled = true;
  await start();
  // IndexedDB 完成多个事务后才建立目录；等待真实应用就绪，不跳过启动流程。
  await vi.waitFor(
    () => {
      expect(wrapper.find('#workspace-title').exists()).toBe(true);
      expect(wrapper.get('#work-mode').attributes('disabled')).toBeUndefined();
    },
    { timeout: 5000 }
  );
  await wrapper.get('#layout-open').trigger('click');
  await vi.waitFor(() => expect(wrapper.find('.project-manager').exists()).toBe(true));
  const form = wrapper.get('.new-map-card form'),
    inputs = form.findAll('input');
  await inputs[0].setValue('二楼仓库');
  await form.trigger('submit');
  await vi.waitFor(() => expect(wrapper.get('#workspace-title').text()).toContain('二楼仓库'), { timeout: 5000 });
  await vi.waitFor(() => expect(wrapper.find('.workspace-loading').exists()).toBe(false));
  expect(wrapper.get('#workspace-title').text()).toContain('二楼仓库 / 现状方案');
  expect(wrapper.findAll('[data-rack]')).toHaveLength(0);
  expect(wrapper.get('#runtime-status').text()).toContain('未关联运行态');
  expect(wrapper.get('#save').text()).toBe('保存本地方案');
  await edit();
  await wrapper
    .findAll('button')
    .find(button => button.text() === '＋ 房间')
    .trigger('click');
  await wrapper.get('#layout-open').trigger('click');
  await flushPromises();
  const scheme = wrapper.get('input[aria-label="新方案名称"]');
  await scheme.setValue('方案 A');
  await scheme.element.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(wrapper.get('#workspace-title').text()).toContain('方案 A'), { timeout: 5000 });
  await vi.waitFor(() => expect(wrapper.find('.workspace-loading').exists()).toBe(false));
  expect(wrapper.get('#workspace-title').text()).toContain('方案 A');
  expect(wrapper.get('#work-mode').element.value).toBe('view');
  expect(wrapper.get('#undo').attributes('disabled')).toBeDefined();
  expect(wrapper.findAll('#room-list button')).toHaveLength(1);
  await edit();
  await wrapper
    .findAll('button')
    .find(button => button.text() === '＋ 房间')
    .trigger('click');
  await wrapper.get('#layout-open').trigger('click');
  await flushPromises();
  const original = wrapper.findAll('[data-workspace]').find(row => row.text().includes('现状方案'));
  await original.get('button').trigger('click');
  await vi.waitFor(() => expect(wrapper.get('#workspace-title').text()).toContain('现状方案'), { timeout: 5000 });
  await vi.waitFor(() => expect(wrapper.find('.workspace-loading').exists()).toBe(false));
  expect(wrapper.get('#workspace-title').text()).toContain('现状方案');
  expect(wrapper.findAll('#room-list button')).toHaveLength(1);
});
