import { resolvePhysicalArea, affectedPhysicalAreas } from './runtime/physical-area-runtime.js';
import { validateAreaBindings } from '../core/spatial/area-bindings.js';
import { uid } from '../core/model/model.js';
import { createRemoteLifecycle, LOCK_MESSAGE } from './layout/remote-lifecycle.js';
import { createRuntimeStore } from './runtime/runtime-store.js';
import { runtimeCount } from '../core/runtime/runtime.js';
import { createSessionHistory } from './history/session-history.js';
import { createLayoutCommands } from './commands/layout-commands.js';
import { createKonvaRenderer } from '../renderers/konva/KonvaRenderer.js';
import { createThreeRenderer } from '../renderers/three/ThreeRenderer.js';
import { exportLayout } from '../infrastructure/import-export/json-exporter.js';
import { createLayoutManager } from './layout/layout-manager.js';
import { createCadEditor } from './editor/cad-editor.js';
import { spatialWarnings } from '../core/spatial/spatial.js';
import { createSpatialEditor } from './editor/spatial-editor.js';
import { loadWorkspace } from './layout/load-workspace.js';
// 应用总协调器：持有共享布局，组装命令、历史、渲染、存储与独立 Runtime。
export async function createMapApplication(ui, repository, services = {}) {
  const lifecycle = new AbortController();
  let disposed = false;
  let selectedVirtual = null,
    detail = null,
    detailSequence = 0;

  const $ = s => document.querySelector(s);
  let workMode = 'view',
    persistenceBusy = false,
    initialized = false;
  let remoteLifecycle = null,
    runtimeSession;
  const canEdit = () =>
    (remoteLifecycle?.state.capabilities.canEditLayout ?? true) && workMode === 'edit' && !persistenceBusy;
  const layoutStore = repository;
  let model,
    zone = 'ALL',
    selected,
    slotId = null,
    view = '2d',
    level = 0,
    colorMode = 'inventory';
  try {
    model = await loadWorkspace(layoutStore, services);
  } catch (e) {
    throw Error('本机布局未载入：' + e.message, { cause: e });
  }
  if (ui.isDisposed?.()) throw Error('地图页面已关闭');
  // Runtime 通知只刷新界面与相关图形，不经过 history.changed，因此不触发布局 Undo 或自动保存。
  const runtime = createRuntimeStore(services.warehouseCode || model.warehouseCode, (code, kind) => {
    if (!initialized || disposed) return;
    publish();
    if (kind === 'virtualArea') {
      for (const areaId of affectedPhysicalAreas(model, code)) {
        konva.updateArea(areaId);
        three.updateArea(areaId);
      }
    } else if (code) {
      konva.updateLocation(code);
      three.updateLocation(code);
    } else {
      konva.updateRuntime();
      three.updateRuntime();
    }
  });
  // 切换运行范围时销毁旧会话并清空旧状态；先进入 loading，缺少数据源明确报错而非使用示例库存。
  function startRuntime() {
    void runtimeSession?.dispose();
    runtime.state.warehouseCode = services.warehouseCode || model.warehouseCode;
    runtime.state.sequence = null;
    runtime.state.locations = Object.create(null);
    runtime.state.virtualAreas = Object.create(null);
    runtime.state.connected = false;
    runtime.status('loading');
    if (services.warehouseCode && model.warehouseCode && services.warehouseCode !== model.warehouseCode) {
      runtime.status('error', '布局仓库与 Runtime 配置不一致，请确认 WMS 范围');
      return;
    }
    runtimeSession = services.startRuntime?.(runtime, () => model);
    if (!runtimeSession) runtime.status('error', '尚未配置 WMS Runtime 数据源');
  }
  selected = model.racks[0]?.id;
  const current = () => model.racks.find(r => r.id === selected),
    visible = () => model.racks.filter(r => r.spaceId === 'main'),
    matches = r => zone === 'ALL' || r.fgCode === zone,
    filtered = () => visible().filter(matches),
    chosen = () => current()?.slots.find(s => s.id === slotId);
  // 发布短暂提示，并取消上一条提示的隐藏计时器。
  function toast(message) {
    if (disposed) return;
    ui.patch({ toast: message });
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ui.patch({ toast: '' }), 2800);
  }
  const history = createSessionHistory({
    model: () => model,
    replace(next) {
      model = next;
    },
    canEdit,
    validate(next) {
      validateAreaBindings(next);
      remoteLifecycle?.assertIdentity(next);
    },
    toast,
    beforeCommand: () => cad.finishNudge(),
    changed() {
      manager?.changed();
      remoteLifecycle?.changed();
      publish();
    },
    render,
    afterRestore() {
      cad.set(cad.ids(), false);
      slotId = null;
    },
  });
  const commit = fn => history.execute('EditLayout', fn),
    record = before => history.record(before, 'NudgeObjects');
  const spatial = createSpatialEditor({
    prepareDoor() {
      cad.clear(false);
      selected = null;
      slotId = null;
    },
    isPanning: () => cad.isPanning(),
    bindDoor(node, d, b, onSelect) {
      cad.bindDoor(node, d, b, onSelect);
    },
    model: () => model,
    commit,
    render,
    selectRack(id) {
      zone = 'ALL';
      cad.set([id]);
    },
    selectArea(id, event) {
      if (id === 'boundary') {
        cad.clear(false);
        selected = null;
        spatial.setActive(id);
        render();
      } else cad.select(id, event);
    },
    onAdded(id) {
      cad.set([id], false);
    },
    bindArea(node, a) {
      cad.bind(node, a);
    },
    bindResize(node, a) {
      cad.bindResize(node, a);
    },
    isSelected(id) {
      return cad?.has(id);
    },
  });
  const host = $('#canvas2d'),
    wrap = $('.canvas-wrap');
  const areaRuntime = areaId => resolvePhysicalArea(model, runtime.state, areaId);
  const state = () => ({
    areaRuntime,
    model,
    runtime: runtime.state,
    level,
    colorMode,
    selected,
    slotId,
    cad,
    spatial,
    zone,
    view,
  });
  const three = createThreeRenderer({
    state,
    select(data) {
      if (data.virtualLocationCode) {
        selectVirtualArea(data.areaId, data.virtualLocationCode);
        return;
      }
      if (data.doorId) {
        spatial.selectDoor(data.doorId);
        return;
      }
      if (data.areaId) {
        spatial.select(data.areaId);
        return;
      }
      cad.set([data.rackId], false);
      slotId = data.slotId || null;
      render();
    },
  });
  const konva = createKonvaRenderer({
    state,
    spatial: () => ({
      isPanning: () => cad.isPanning(),
      isSelected: id => cad.has(id),
      bindDoor: (...args) => cad.bindDoor(...args),
      bindArea: (...args) => cad.bind(...args),
      bindResize: (...args) => cad.bindResize(...args),
    }),
    selectSlot(id) {
      slotId = id;
      render();
    },
    focus3d: b => three.focusObject(b),
    fit3d: b => three.fitToView(b),
    selectVirtualArea,
  });
  konva.mount(host, wrap);
  const stage = konva.stage,
    unit = konva.unit;
  const draw2d = () => konva.renderLayout(),
    draw3d = () => three.renderLayout(),
    fit = () => konva.fitToView();
  // 容器尺寸改变时同步两个视图的画布或相机尺寸。
  function resize() {
    konva.resize();
    three.resize();
  }
  const cad = createCadEditor({
    stage,
    unit,
    host,
    canEdit,
    signal: lifecycle.signal,
    externalBounds: () => spatial.doorBounds(),
    model: () => model,
    objects: () => [...filtered(), ...model.areas],
    view: () => view,
    commit,
    record,
    execute: history.execute,
    replace(text) {
      model = JSON.parse(text);
    },
    render,
    toast,
    fit,
    slotSelected: () => !!slotId,
    primary(id) {
      slotId = null;
      if (model.areas.some(a => a.id === id)) {
        selected = null;
        spatial.setActive(id);
      } else {
        selected = id;
        spatial.clear();
      }
    },
    focus: b => konva.focusObjects(b),
  });

  // 选择物理区域内的虚拟库位，并使尚未返回的旧详情请求失效。
  function selectVirtualArea(areaId, code) {
    const row = areaRuntime(areaId).rows.find(binding => binding.virtualLocationCode === code);
    if (!row) return;
    selectedVirtual = code;
    detail = null;
    detailSequence++;
    spatial.select(areaId);
    publish();
  }
  // 向 Vue 发布展示快照；此 publish 不是服务器布局发布，不改变 PublishedVersion。
  function publish() {
    if (disposed) return;
    const all = filtered().flatMap(rack => rack.slots);
    const used = all.filter(slot => runtime.state.locations[slot.code]?.occupancyStatus === 'OCCUPIED').length;
    const known = runtime.state.sequence !== null && all.every(slot => runtimeCount(runtime.state, slot.code) !== null);
    const selection = cad.render();
    const colors =
      colorMode === 'fg'
        ? [
            ['#c9e4f5', 'FG01'],
            ['#f7d9bc', 'FG02'],
          ]
        : [
            ['#22a694', '有货'],
            ['#dce6ec', '空闲'],
          ];
    ui.patch({
      ready: initialized,
      runtime: structuredClone(runtime.state),
      physicalArea:
        spatial.selected() && !spatial.doorId() && spatial.selected().id !== 'boundary'
          ? areaRuntime(spatial.selected().id)
          : null,
      areaBindings: model.areaBindings.filter(binding => binding.areaId === spatial.selected()?.id),
      selectedVirtual,
      virtualDetail: detail,
      locationCodeLocked: !remoteLifecycle?.canRename(chosen()),
      busy: persistenceBusy,
      workMode,
      view,
      zone,
      colorMode,
      level,
      racks: structuredClone(filtered()),
      areas: structuredClone(model.areas),
      rack: current() ? structuredClone(current()) : null,
      slot: chosen() ? structuredClone(chosen()) : null,
      spatial: spatial.selected() ? structuredClone(spatial.selected()) : null,
      doorId: spatial.doorId(),
      selectedIds: cad.ids(),
      selection,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
      warnings: spatialWarnings(model),
      legend: [...colors, ['#f9e6a8', view === '3d' ? '选中货架 / 货位' : '选中货位']],
      stats: [
        [filtered().length, zone === 'ALL' ? '全部货架' : zone + ' 货架'],
        [all.length, '货位'],
        [known ? all.reduce((count, slot) => count + runtimeCount(runtime.state, slot.code), 0) : '—', '外箱'],
        [known && all.length ? Math.round((used / all.length) * 100) + '%' : '—', '货位占用率'],
      ],
    });
  }
  // 协调选择、属性面板与布局重绘；单货位运行态变化走 targeted update，不走完整布局重绘。
  function render() {
    if (disposed) return;
    if (current() && !matches(current())) cad.clear(false);
    spatial.render();
    publish();
    draw2d();
    if (view === '3d') draw3d();
  }

  window.addEventListener('beforeunload', () => cad.finishNudge(), { signal: lifecycle.signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') cad.finishNudge();
    },
    { signal: lifecycle.signal }
  );
  const observer = new ResizeObserver(resize);
  observer.observe(wrap);
  const manager = createLayoutManager({
    store: layoutStore,
    validate(next) {
      if (next.layoutCode !== model.layoutCode || next.layoutId !== model.layoutId)
        throw Error('请在独立工作区打开不同布局身份的地图');
      if (model.warehouseCode && next.warehouseCode !== model.warehouseCode)
        throw Error('不能通过导入改变既有 WMS 仓库范围');
      remoteLifecycle?.assertIdentity(next);
    },
    model: () => model,
    canEdit,
    toast,
    patch: ui.patch,
    setBusy(value) {
      persistenceBusy = value;
      publish();
    },
    signal: lifecycle.signal,
    replace(next) {
      model = next;
      selectedVirtual = null;
      detail = null;
      detailSequence++;
      history.clear();
      zone = 'ALL';
      level = 0;
      cad.clear(false);
      render();
      fit();
      remoteLifecycle?.changed();
      if (runtime.state.warehouseCode !== (services.warehouseCode || model.warehouseCode)) startRuntime();
    },
  });
  remoteLifecycle = createRemoteLifecycle({
    model: () => model,
    local: repository,
    remote: services.remote,
    scope: services.remoteScope || '',
    flush: () => manager.save('本机草稿'),
    replace: next => manager.replaceFromRemote(next),
    changed(remote) {
      if (!disposed) {
        ui.patch({ remote });
        if (initialized) publish();
      }
    },
  });
  const layoutCommands = createLayoutCommands({
    assertCanRename(slot) {
      if (!remoteLifecycle.canRename(slot))
        throw Error(remoteLifecycle.state.identityVerified ? LOCK_MESSAGE : '尚未确认已发布货位身份，暂不能修改编码');
    },
    model: () => model,
    zone: () => zone,
    setZone(value) {
      zone = value;
    },
    clearPrimary() {
      selected = null;
      slotId = null;
    },
    current,
    chosen,
    spatial,
    cad,
    canEdit,
    ui,
    execute: history.execute,
  });
  const commands = {
    ...layoutCommands,
    selectVirtualArea,
    // 按需读取只读详情；请求序号阻止后返回的旧请求覆盖新选择。
    async loadVirtualDetail(code) {
      const areaId = spatial.selected()?.id;
      if (!areaId || !areaRuntime(areaId).rows.some(row => row.virtualLocationCode === code)) return;
      selectedVirtual = code;
      const sequence = ++detailSequence;
      detail = { status: 'loading' };
      publish();
      try {
        if (!services.runtimeRepository) throw Error('Runtime Detail API 尚未配置');
        const data = await services.runtimeRepository.getAreaDetail(
          code,
          { warehouseCode: runtime.state.warehouseCode || '', layoutCode: model.layoutCode },
          lifecycle.signal
        );
        if (disposed || sequence !== detailSequence || areaId !== spatial.selected()?.id) return;
        detail = { status: 'ready', data };
      } catch (error) {
        if (disposed || sequence !== detailSequence) return;
        detail = { status: 'error', error: error.message };
      }
      publish();
    },
    // 绑定属于布局，通过历史命令校验唯一性并触发保存；不修改 WMS 的实际业务位置。
    saveAreaBinding(data) {
      const areaId = spatial.selected()?.id;
      if (!model.areas.some(area => area.id === areaId)) return;
      history.execute('UpdateAreaBinding', () => {
        const existing = data.id
          ? model.areaBindings.find(binding => binding.id === data.id && binding.areaId === areaId)
          : null;
        if (data.id && !existing) throw Error('区域绑定不存在');
        const binding = {
          id: existing?.id || uid(),
          areaId,
          virtualLocationCode: data.virtualLocationCode.trim(),
          displayName: data.displayName.trim(),
          purpose: data.purpose.trim(),
          isActive: data.isActive === true,
        };
        if (existing) Object.assign(existing, binding);
        else model.areaBindings.push(binding);
      });
    },
    // 删除布局绑定，不删除虚拟库位主数据或其库存。
    removeAreaBinding(id) {
      history.execute('DeleteAreaBinding', () => {
        model.areaBindings = model.areaBindings.filter(binding => binding.id !== id);
      });
    },
    // 离开编辑模式前等待本机保存；保存失败则维持当前模式和内存工作。
    async setMode(value) {
      if (persistenceBusy) return;
      cad.finishNudge();
      if (value === 'view') {
        persistenceBusy = true;
        publish();
        const saved = await manager.flush();
        persistenceBusy = false;
        if (!saved) {
          publish();
          return;
        }
      }
      cad.cancel();
      workMode = value;
      render();
    },
    // 先让 Vue 显示目标容器，再测量和渲染，避免隐藏容器产生零尺寸。
    setView(value) {
      view = value;
      // Vue first reveals the selected container, then the renderer measures it.
      publish();
      ui.afterUpdate(() => {
        if (disposed) return;
        if (view === '3d') three.mount($('#canvas3d'), wrap);
        resize();
        render();
      });
    },
    setZone(value) {
      zone = value;
      cad.set(cad.ids(), false);
      render();
    },
    setColor(value) {
      colorMode = value;
      render();
    },
    setLevel(value) {
      level = Number(value);
      render();
    },
    selectRack(id, event) {
      cad.select(id, event);
    },
    selectSlot(id) {
      slotId = id;
      render();
    },
    selectArea(id, event) {
      spatial.select(id, event);
    },
    selectDoor(id) {
      spatial.selectDoor(id);
    },
    // 定位警告对象；货架可能被 FG 筛选隐藏，需要先显示全部货架。
    selectWarning(id) {
      if (model.areas.some(area => area.id === id)) spatial.select(id);
      else {
        zone = 'ALL';
        cad.set([id]);
      }
    },
    backToRack() {
      spatial.clear();
      render();
    },

    fit,
    undo: history.undo,
    redo: history.redo,
    // 显式保存服务器草稿，与本地自动保存和正式发布相互分离。
    async save() {
      cad.finishNudge();
      if (canEdit() && (await remoteLifecycle.save())) toast('服务器草稿已保存');
    },
    retryRemote: () => remoteLifecycle.initialize(),
    // 冲突时仅保留本机工作，不尝试合并或覆盖服务器草稿。
    async keepLocalDraft() {
      cad.finishNudge();
      if (await manager.save('保留冲突本机草稿')) toast('本机工作已保留；未覆盖服务器');
    },
    // 重新载入远程草稿前确认替换，实际备份与原子替换由布局管理器完成。
    async loadServerDraft() {
      if (!canEdit() || !confirm('载入服务器草稿将替换画面；当前本机布局会先保存为历史备份。是否继续？')) return;
      cad.finishNudge();
      return remoteLifecycle.loadDraft();
    },
    publishLayout: () => remoteLifecycle.publish(),
    export: () => exportLayout(model),
    openLayout: manager.open,
    closeLayout: manager.close,
    importFile: manager.importFile,
    // 导入或恢复布局前先结束方向键操作，避免历史跨越两个模型。
    applyLayout() {
      cad.finishNudge();
      return manager.apply();
    },
    stageHistory: manager.stageHistory,
  };
  cad.set(selected ? [selected] : [], false);
  fit();
  render();
  try {
    if (!(await layoutStore.history()).length) await layoutStore.save(model, '初始版本');
    ui.patch({ saveState: '已载入本机布局' });
  } catch (error) {
    ui.patch({ saveState: '备份不可用，请导出布局' });
    toast(error.message);
  }
  if (document.modelContext?.registerTool) {
    try {
      Promise.resolve(
        document.modelContext.registerTool(
          {
            name: 'select_warehouse_location',
            description: '按现有货位编码选择货位，并切换到所属分区；不修改布局或库存。',
            inputSchema: {
              type: 'object',
              properties: { code: { type: 'string' } },
              required: ['code'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute(input) {
              if (typeof input?.code !== 'string') throw Error('需要货位编码');
              const rack = model.racks.find(r => r.slots.some(s => s.code === input.code));
              if (!rack) throw Error('货位不存在');
              zone = rack.fgCode;
              cad.set([rack.id], false);
              slotId = rack.slots.find(s => s.code === input.code).id;
              render();
              fit();
              return { code: chosen().code, runtime: runtime.state.locations[chosen().code] || null, zone };
            },
          },
          { signal: lifecycle.signal }
        )
      ).catch(error => console.warn('地图工具注册失败', error));
    } catch (error) {
      console.warn('地图工具注册失败', error);
    }
  }

  initialized = true;
  publish();
  void remoteLifecycle.initialize();
  startRuntime();
  return {
    ...commands,
    retryRuntime: () => (runtimeSession ? runtimeSession.start() : startRuntime()),
    // 终止会话和监听、释放渲染资源；等待最后一次保存结束后再关闭仓库连接。
    dispose() {
      disposed = true;
      runtimeSession?.dispose();
      cad.finishNudge();
      const saving = manager.dispose();
      cad.cancel();
      lifecycle.abort();
      observer.disconnect();
      clearTimeout(toast.timer);
      three.destroy();
      konva.destroy();
      return saving.finally(() => repository.close?.());
    },
  };
}
