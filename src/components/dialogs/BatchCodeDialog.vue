<script setup>
import { ref, computed } from 'vue';
import { generateCodes, pasteCodes } from '../../core/model/batch-codes.js';
const props = defineProps({ rack: Object, actions: Object, disabled: Boolean });
const dialog = ref(null);
const draft = ref(null);
const codes = ref({});
const error = ref('');
const options = ref({
  prefix: 'H',
  start: 901,
  step: 1,
  digits: 3,
  suffix: '-{层号}',
  reverse: false,
  level: 0,
  layerFormat: 'number',
});
const levels = computed(() =>
  draft.value ? Array.from({ length: draft.value.levels }, (_, i) => draft.value.levels - i) : []
);
const changes = () => draft.value.slots.map(slot => ({ id: slot.id, code: codes.value[slot.id] }));
const preview = computed(() => {
  if (!draft.value) return [];
  return props.actions.previewBatchCodes(draft.value.id, changes());
});
const changed = computed(() => preview.value.filter(row => row.code !== row.original).length);
const rowFor = id => preview.value.find(row => row.id === id);
function open() {
  draft.value = JSON.parse(JSON.stringify(props.rack));
  codes.value = Object.fromEntries(draft.value.slots.map(slot => [slot.id, slot.code]));
  error.value = '';
  options.value.level = 0;
  dialog.value.showModal();
}
function merge(rows) {
  for (const row of rows) codes.value[row.id] = row.code;
}
// 中文输入法确认候选词不触发生成；只接管参数区的 Enter。
function generateOnEnter(event) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat) generate();
}
function generate() {
  try {
    merge(generateCodes(draft.value, options.value));
    error.value = '';
  } catch (e) {
    error.value = e.message;
  }
}
function paste(event, id) {
  event.preventDefault();
  try {
    merge(pasteCodes(draft.value, event.clipboardData.getData('text/plain'), id));
    error.value = '';
  } catch (e) {
    error.value = e.message;
  }
}
function apply() {
  if (props.actions.applyBatchCodes(draft.value.id, changes())) dialog.value.close();
  else error.value = '未应用，请检查编码、编辑权限及当前货位身份。';
}
</script>
<template>
  <button type="button" :disabled="disabled" @click="open">批量货位编码</button>
  <dialog ref="dialog" class="batch-code-dialog">
    <header>
      <div>
        <h2>批量货位编码</h2>
        <p>{{ draft?.name }} · 上层在上，左列在左</p>
      </div>
      <button type="button" aria-label="关闭批量编码" @click="dialog.close()">×</button>
    </header>
    <section v-if="draft" class="batch-code-body">
      <div class="batch-code-options" @keydown.enter="generateOnEnter">
        <label>前缀<input v-model="options.prefix" /></label>
        <label>起始编号<input v-model.number="options.start" type="number" min="0" /></label>
        <label>每列递增<input v-model.number="options.step" type="number" min="1" /></label>
        <label>数字位数<input v-model.number="options.digits" type="number" min="1" max="12" /></label>
        <label>后缀（{层号} 自动替换）<input v-model="options.suffix" /></label>
        <label
          >层号格式<select v-model="options.layerFormat">
            <option value="number">数字：1 / 2 / 3</option>
            <option v-if="draft.levels === 3" value="szx">上 S / 中 Z / 下 X</option>
          </select></label
        >
        <label
          >作用范围<select v-model="options.level">
            <option :value="0">整座货架</option>
            <option v-for="level in levels" :key="level" :value="level">{{ level }}F</option>
          </select></label
        >
        <label
          >编号方向<select v-model="options.reverse">
            <option :value="false">从左往右</option>
            <option :value="true">从右往左</option>
          </select></label
        >
        <button type="button" class="primary batch-code-generate" @click="generate">生成预览</button>
      </div>
      <p class="muted">点击任意格作为起点，粘贴 Excel 单元格；支持逐格修改和 Tab 切换。仅点击「应用编码」才保存。</p>
      <p v-if="error" role="alert" class="batch-code-error">{{ error }}</p>
      <div class="batch-code-table">
        <table>
          <thead>
            <tr>
              <th>层 / 列</th>
              <th v-for="col in draft.cols" :key="col">第 {{ col }} 列</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="level in levels" :key="level">
              <th>{{ level }}F</th>
              <td
                v-for="slot in draft.slots.filter(item => item.level === level).sort((a, b) => a.col - b.col)"
                :key="slot.id"
              >
                <small>{{ rowFor(slot.id)?.original }} →</small>
                <input
                  v-model="codes[slot.id]"
                  :aria-label="`${level}层${slot.col}列编码`"
                  :aria-invalid="!!rowFor(slot.id)?.error"
                  @focus="$event.target.select()"
                  @paste="paste($event, slot.id)"
                />
                <small class="batch-code-error">{{ rowFor(slot.id)?.error }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <footer>
      <span>将修改 {{ changed }} 个货位 · 一次撤销可恢复</span
      ><button type="button" @click="dialog.close()">取消</button
      ><button
        type="button"
        class="primary"
        :disabled="!changed || preview.some(row => row.error) || disabled"
        @click="apply"
      >
        应用编码
      </button>
    </footer>
  </dialog>
</template>
<style scoped>
.batch-code-dialog {
  width: min(1100px, calc(100vw - 32px));
  padding: 0;
  overflow: hidden;
}
.batch-code-dialog[open] {
  display: flex;
  flex-direction: column;
}
header,
footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 24px;
  background: #eef7fb;
  flex-shrink: 0;
}
header {
  justify-content: space-between;
}
header h2,
header p {
  margin: 0;
}
footer span {
  margin-right: auto;
}
.batch-code-body {
  padding: 24px;
  overflow: auto;
  min-height: 0;
}
.batch-code-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}
.batch-code-generate {
  grid-column: 1 / -1;
  width: 100%;
}
.batch-code-generate:hover:not(:disabled) {
  background: #0e665c;
  border-color: #0e665c;
  color: #fff;
}
.batch-code-table {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
}
th,
td {
  padding: 8px;
  border: 1px solid #dce7ef;
}
td {
  min-width: 155px;
}
small {
  display: block;
  min-height: 18px;
  color: #788c99;
}
.batch-code-error {
  color: #b34332;
}
input[aria-invalid='true'] {
  border-color: #b34332;
}
@media (max-width: 650px) {
  .batch-code-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  footer {
    flex-wrap: wrap;
  }
}
</style>
