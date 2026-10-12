<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue';
import ToolIcon from '../ToolIcon.vue';
const dialog = ref(),
  options = ref({});
let resolve;
// 同一时刻只允许一个待确认操作，避免后来的弹窗覆盖前一个 Promise。
async function ask(value) {
  if (resolve) return false;
  options.value = value;
  const result = new Promise(done => {
    resolve = done;
  });
  await nextTick();
  if (resolve) dialog.value.showModal();
  return result;
}
function finish(accepted) {
  // 先清空回调再关闭弹窗，防止 close 事件重入造成重复完成。
  const done = resolve;
  resolve = null;
  if (dialog.value?.open) dialog.value.close();
  done?.(accepted);
}
onBeforeUnmount(() => finish(false));
defineExpose({ ask });
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="system-modal"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      @cancel.prevent="finish(false)"
      @close="finish(false)"
    >
      <div class="system-modal-header">
        <div class="system-modal-title">
          <span class="system-modal-icon"><ToolIcon :name="options.icon || 'info'" /></span>
          <h2 id="confirm-title">{{ options.title || '操作确认' }}</h2>
        </div>
        <button type="button" class="system-modal-close" aria-label="关闭提示" @click="finish(false)">
          <ToolIcon name="close" />
        </button>
      </div>
      <div class="system-modal-body">
        <p id="confirm-message">{{ options.message }}</p>
        <div v-if="options.note" class="system-modal-note">
          <ToolIcon name="info" /><span>{{ options.note }}</span>
        </div>
      </div>
      <div class="system-modal-footer">
        <button type="button" autofocus @click="finish(false)"><ToolIcon name="close" />取消</button>
        <button type="button" class="primary" @click="finish(true)">
          <ToolIcon :name="options.icon || 'check'" />{{ options.confirmText || '确认继续' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>
