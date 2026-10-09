<script setup>
import { ref } from 'vue';
const props = defineProps({ actions: Object, disabled: Boolean });
const dialog = ref(null),
  reference = ref(''),
  mode = ref('left'),
  gap = ref(0.2),
  candidates = ref([]),
  rows = ref([]),
  error = ref('');
const modes = {
  left: '左对齐',
  right: '右对齐',
  top: '上对齐',
  bottom: '下对齐',
  centerX: '水平居中',
  centerY: '垂直居中',
  distributeX: '水平等间距',
  distributeY: '垂直等间距',
  besideRight: '放到基准右侧',
  besideLeft: '放到基准左侧',
  besideTop: '放到基准上方',
  besideBottom: '放到基准下方',
};
function reset() {
  rows.value = [];
  error.value = '';
  props.actions.clearAlignment();
}
function open() {
  candidates.value = props.actions.alignmentOptions();
  reference.value = candidates.value[0]?.id || '';
  reset();
  dialog.value.showModal();
}
function preview() {
  reset();
  try {
    rows.value = props.actions.previewAlignment(reference.value, mode.value, Number(gap.value));
  } catch (e) {
    error.value = e.message;
  }
}
function apply() {
  if (props.actions.applyAlignment(reference.value, mode.value, Number(gap.value))) dialog.value.close();
  else error.value = '应用失败，原布局已保留，请检查布局限制。';
}
</script>
<template>
  <button :disabled="disabled" @click="open">对齐与分布</button>
  <dialog ref="dialog" @close="reset">
    <h2>对齐与分布</h2>
    <p class="muted">边缘对齐和靠边留距保持基准不动。等间距保持所选对象首尾位置不动，按实际外接边缘均分净空。</p>
    <label
      >方式<select v-model="mode" @change="reset">
        <option v-for="(label, value) in modes" :key="value" :value="value">{{ label }}</option>
      </select></label
    >
    <label v-if="!mode.startsWith('distribute')"
      >基准对象<select v-model="reference" @change="reset">
        <option v-for="item in candidates" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select></label
    >
    <label v-if="mode.startsWith('beside')"
      >净间距 / 米<input v-model="gap" type="number" min="0" step="0.1" @input="reset"
    /></label>
    <p v-if="error" role="alert">{{ error }}</p>
    <button class="primary" @click="preview">预览</button>
    <div v-if="rows.length" class="alignment-preview">
      <p>虚线为目标轮廓；仅移动所选对象，应用后可一次撤销。</p>
      <p v-for="row in rows" :key="row.id">{{ row.name }} → X {{ row.x.toFixed(2) }} / Y {{ row.y.toFixed(2) }} 米</p>
    </div>
    <div class="actions">
      <button @click="dialog.close()">取消</button
      ><button class="primary" :disabled="!rows.length || disabled" @click="apply">应用</button>
    </div>
  </dialog>
</template>
<style scoped>
.alignment-preview {
  max-height: 180px;
  overflow: auto;
  background: #eef7fb;
  padding: 8px 12px;
  margin-top: 12px;
}
[role='alert'] {
  color: #b34332;
}
</style>
