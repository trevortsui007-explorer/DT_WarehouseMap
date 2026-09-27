<script setup>
import { ref, watch } from 'vue';
const props = defineProps({
  data: Object,
  fields: Array,
  disabled: Boolean,
  submitLabel: { type: String, default: '应用修改' },
});
// 声明向父组件发出的 apply 事件，表单通过事件提交而非直接修改布局。
const emit = defineEmits(['apply']);
// ref 保存可编辑表单草稿；脚本中通过 .value 访问，模板会自动解包。
const draft = ref({});
// 父级展示数据变化时重新填充字段；immediate 使首次挂载也执行，输入过程只修改本地草稿。
watch(
  () => props.data,
  data => {
    draft.value = Object.fromEntries(props.fields.map(field => [field.key, data[field.key]]));
  },
  { immediate: true }
);
</script>
<template>
  <form @submit.prevent="emit('apply', { ...draft })">
    <div class="fields">
      <label v-for="field in fields" :key="field.key" :class="{ wide: field.wide }"
        >{{ field.label }}
        <select v-if="field.options" v-model="draft[field.key]" :name="field.key" :disabled="disabled">
          <option v-for="[value, label] in field.options" :key="value" :value="value">{{ label }}</option>
        </select>
        <input
          v-else
          v-model="draft[field.key]"
          :name="field.key"
          :type="field.type || 'number'"
          :step="field.type === 'text' ? undefined : 'any'"
          :min="field.min"
          :disabled="disabled"
          required
        />
      </label>
    </div>
    <slot name="description" />
    <div class="field-actions">
      <button class="primary" :disabled="disabled">{{ submitLabel }}</button><slot />
    </div>
  </form>
</template>
