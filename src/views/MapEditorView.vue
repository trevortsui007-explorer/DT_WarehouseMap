<script setup>
import { shallowRef, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { bootstrapMap } from '../bootstrap.js';
import AppToolbar from '../components/toolbar/AppToolbar.vue';
import WarehouseSidebar from '../components/sidebar/WarehouseSidebar.vue';
import MapViewport from '../components/MapViewport.vue';
import PropertyPanel from '../components/properties/PropertyPanel.vue';
import CadDialogs from '../components/dialogs/CadDialogs.vue';
import LayoutDialog from '../components/dialogs/LayoutDialog.vue';
import ConfirmDialog from '../components/dialogs/ConfirmDialog.vue';

// Only presentation snapshots enter Vue. The editable model remains plain application data.
// shallowRef 只跟踪快照引用替换，不把内部布局几何递归转换为 Vue 响应式对象。
const state = shallowRef({
  ready: false,
  workMode: 'view',
  view: '2d',
  zone: 'ALL',
  colorMode: 'inventory',
  level: 0,
  racks: [],
  areas: [],
  rack: null,
  slot: null,
  spatial: null,
  doorId: null,
  selectedIds: [],
  selection: { count: 0, bounds: null },
  canUndo: false,
  canRedo: false,
  warnings: [],
  legend: [],
  stats: [],
  saveState: '本机布局',
  toast: '',
  layout: { history: [], canApply: false, importSummary: '', layoutError: '' },
});
const actions = shallowRef({});
const confirmation = shallowRef();
let application;
let unmounted = false;
// DOM 挂载后异步组装应用；启动失败显示可重试错误，不替换成示例 Runtime。
async function start() {
  let initializing = true;
  state.value = { ...state.value, loadError: '', ready: false };
  try {
    application = await bootstrapMap({
      confirm: options => confirmation.value.ask(options),
      isDisposed: () => unmounted,
      patch: patch => {
        if (unmounted) return;
        // 对象展开执行浅合并，后面的 patch 覆盖同名字段；替换引用触发 shallowRef 更新。
        state.value = { ...state.value, ...patch, ...(initializing ? { ready: false } : {}) };
      },
      // nextTick 等待 Vue 更新 DOM，确保渲染器测量的是切换后已显示的容器。
      afterUpdate: callback => nextTick(callback),
    });
    if (unmounted) {
      application.dispose();
      return;
    }
    actions.value = application;
    initializing = false;
    state.value = { ...state.value, ready: true };
  } catch (error) {
    state.value = { ...state.value, loadError: error.message, ready: false };
  }
}
// 挂载完成才连接画布；若初始化尚未结束页面就卸载，unmounted 会阻止接收迟到结果。
onMounted(start);
// 组件卸载时停止应用会话、事件监听和渲染器，防止重复进入页面后残留资源。
onBeforeUnmount(() => {
  unmounted = true;
  application?.dispose();
});
</script>

<template>
  <div v-if="!state.ready || state.busy || state.workspaceCatalog?.busy" class="workspace-loading" role="status">
    {{ state.loadError || (state.busy || state.workspaceCatalog?.busy ? '正在保存并应用布局…' : '正在载入本机布局…') }}
    <button v-if="state.loadError" @click="start">重试载入</button>
  </div>
  <div
    class="app-shell"
    :inert="!state.ready || state.busy || state.workspaceCatalog?.busy"
    :class="{ 'view-mode': state.workMode === 'view' }"
  >
    <AppToolbar :state="state" :actions="actions" />
    <main>
      <WarehouseSidebar :state="state" :actions="actions" />
      <MapViewport :state="state" :actions="actions" />
      <PropertyPanel :state="state" :actions="actions" />
    </main>
    <div id="toast" role="status" :style="{ display: state.toast ? 'block' : 'none' }">{{ state.toast }}</div>
    <LayoutDialog :state="state" :actions="actions" />
    <CadDialogs />
  </div>
  <ConfirmDialog ref="confirmation" />
</template>
