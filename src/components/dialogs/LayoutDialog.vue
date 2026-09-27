<script setup>
import { ref, watch, nextTick } from 'vue';
const props = defineProps({ state: Object, actions: Object });
// 模板 ref 保存原生 dialog 元素，供 showModal/close 调用；这里不持有布局业务数据。
const dialog = ref();
// Each open command publishes a new snapshot; native dialog preserves focus/keyboard semantics.
// 监听 Application 的窗口快照；await nextTick() 等待 DOM 更新后再调用原生 showModal。
watch(
  () => props.state.layout,
  async layout => {
    await nextTick();
    if (layout.layoutOpen && !dialog.value.open) dialog.value.showModal();
  }
);
const close = () => dialog.value.close();
</script>
<template>
  <dialog id="layout-dialog" ref="dialog" @close="actions.closeLayout()">
    <h2>布局管理</h2>
    <p id="layout-mode-note" class="muted">
      {{
        state.workMode === 'edit'
          ? '导入或恢复前会备份当前布局；确认后立即保存。'
          : '当前为查看模式。切换到编辑模式后才能导入或恢复。'
      }}
    </p>
    <label
      >导入布局 JSON<input
        id="layout-file"
        type="file"
        accept=".json,application/json"
        :disabled="state.workMode !== 'edit'"
        @change="actions.importFile($event.target.files[0])"
    /></label>
    <p id="import-summary" class="muted">{{ state.layout.importSummary }}</p>
    <p id="layout-error" class="form-error" role="alert">{{ state.layout.layoutError }}</p>
    <button
      id="layout-apply"
      class="primary"
      :disabled="!state.layout.canApply || state.workMode !== 'edit'"
      @click="actions.applyLayout()"
    >
      确认替换当前布局
    </button>
    <h3>本机恢复历史（非正式发布版本）</h3>
    <p class="muted">最近最多 20 条；另保留旧版本迁移备份。数据保存在当前浏览器的 IndexedDB，请定期导出。</p>
    <div id="history-list">
      <div v-for="item in state.layout.history" :key="item.id" class="history-row">
        <b>{{ item.label }}</b
        ><small>{{ new Date(item.at).toLocaleString() }}</small>
        <p>{{ item.summary }}</p>
        <button :data-restore="item.id" :disabled="state.workMode !== 'edit'" @click="actions.stageHistory(item.id)">
          预览恢复
        </button>
      </div>
      <p v-if="!state.layout.history.length" class="muted">
        尚无本机历史。编辑后自动备份；正式版本仅由服务器发布创建。
      </p>
    </div>
    <div class="actions"><button @click="close">关闭</button></div>
  </dialog>
</template>
