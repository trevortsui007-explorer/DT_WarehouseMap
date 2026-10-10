<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import ToolIcon from '../ToolIcon.vue';
const props = defineProps({ actions: Object, disabled: Boolean, count: Number });
const root = ref(null),
  opened = ref(false),
  error = ref(''),
  reference = ref(''),
  gap = ref(0.2),
  candidates = ref([]);
const modes = [
  ['left', '左对齐', 'M4 3v18 M7 6h12v4H7z M7 14h8v4H7z'],
  ['centerX', '水平居中', 'M12 2v20 M5 6h14v4H5z M8 14h8v4H8z'],
  ['right', '右对齐', 'M20 3v18 M5 6h12v4H5z M9 14h8v4H9z'],
  ['top', '上对齐', 'M3 4h18 M6 7h4v12H6z M14 7h4v8h-4z'],
  ['centerY', '垂直居中', 'M2 12h20 M6 5h4v14H6z M14 8h4v8h-4z'],
  ['bottom', '下对齐', 'M3 20h18 M6 5h4v12H6z M14 9h4v8h-4z'],
  ['distributeX', '水平等间距', 'M3 3v18 M21 3v18 M5 8h3v8H5z M11 6h3v12h-3z M17 8h3v8h-3z'],
  ['distributeY', '垂直等间距', 'M3 3h18 M3 21h18 M8 5h8v3H8z M6 11h12v3H6z M8 17h8v3H8z'],
];
const shortcuts = {
  l: 'left',
  r: 'right',
  t: 'top',
  b: 'bottom',
  h: 'centerX',
  v: 'centerY',
  x: 'distributeX',
  y: 'distributeY',
};
const keyFor = mode =>
  Object.entries(shortcuts)
    .find(([, value]) => value === mode)?.[0]
    .toUpperCase();
// 捕获阶段处理两段键，避免 Esc 同时清空 CAD 选择；输入及手势期间保持原有行为。
function keydown(event) {
  if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
    return;
  if (
    event.target?.closest?.('input,textarea,select,[contenteditable="true"]') ||
    document.querySelector('dialog[open]')
  )
    return;
  if (props.disabled || !props.actions.canAlignShortcut?.()) return;
  const key = event.key.toLowerCase();
  if (key !== 'a' && !(opened.value && (key === 'escape' || shortcuts[key]))) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.repeat) return;
  if (key === 'a') open();
  else if (key === 'escape') close();
  else {
    const mode = shortcuts[key],
      required = mode.startsWith('distribute') ? 3 : 2;
    if (props.count < required) error.value = `此操作至少需要选中 ${required} 个对象`;
    else apply(mode);
  }
}
function open() {
  if (props.disabled) return;
  opened.value = true;
  error.value = '';
}
function close() {
  opened.value = false;
}
function outside(event) {
  if (!root.value?.contains(event.target)) close();
}
function apply(mode, explicit = false) {
  if (props.actions.applyAlignment(explicit ? reference.value : null, mode, Number(gap.value))) close();
  else error.value = '未应用，请查看提示；原布局已保留。';
}
function advanced(event) {
  if (event.target.open) candidates.value = props.actions.alignmentOptions();
}
watch(
  () => props.disabled,
  value => {
    if (value) close();
  }
);
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', keydown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', keydown, true);
});
</script>
<template>
  <div ref="root" class="alignment-dropdown" @mouseenter="open" @mouseleave="close" @keydown.esc.stop="close">
    <button :disabled="disabled" :aria-expanded="opened" @click="open"><ToolIcon name="align" />对齐与分布 A ▾</button>
    <div v-if="opened" class="alignment-menu">
      <p>按所选对象整体边缘对齐 · Esc 关闭</p>
      <div class="alignment-grid">
        <button
          v-for="[mode, label, path] in modes"
          :key="mode"
          :disabled="count < (mode.startsWith('distribute') ? 3 : 2)"
          @click="apply(mode)"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path :d="path" /></svg>{{ label
          }}<kbd>{{ keyFor(mode) }}</kbd>
        </button>
      </div>
      <small>等间距保持首尾不动 · 操作后可撤销</small>
      <details @toggle="advanced">
        <summary>靠边留距（指定基准）</summary>
        <label
          >基准对象<select v-model="reference">
            <option value="" disabled>选择基准</option>
            <option v-for="item in candidates" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select></label
        >
        <label>净间距 / 米<input v-model="gap" type="number" min="0" step="0.1" /></label>
        <div class="alignment-grid">
          <button
            v-for="[mode, label] in [
              ['besideLeft', '放到左侧'],
              ['besideRight', '放到右侧'],
              ['besideTop', '放到上方'],
              ['besideBottom', '放到下方'],
            ]"
            :key="mode"
            :disabled="!reference"
            @click="apply(mode, true)"
          >
            {{ label }}
          </button>
        </div>
      </details>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>
<style scoped>
kbd {
  margin-left: auto;
  padding: 1px 4px;
  border: 1px solid #cddfe9;
  border-radius: 3px;
  font-size: 11px;
  color: #65808f;
}
.alignment-dropdown {
  position: relative;
}
.alignment-menu {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 50;
  width: 310px;
  max-width: calc(100vw - 32px);
  padding: 14px;
  border: 1px solid #cddfe9;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 28px #23455226;
  max-height: 65vh;
  overflow-y: auto;
}
.alignment-menu p {
  margin: 0 0 10px;
  font-size: 12px;
  color: #65808f;
}
.alignment-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.alignment-grid button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  text-align: left;
}
svg {
  flex-shrink: 0;
  fill: #d9eaf5;
  stroke: currentColor;
  stroke-width: 1.5;
}
small {
  display: block;
  margin: 10px 0;
  color: #758a98;
}
details {
  border-top: 1px solid #e0e9ee;
  padding-top: 10px;
}
summary {
  cursor: pointer;
  font-size: 12px;
}
[role='alert'] {
  color: #b34332 !important;
}
</style>
