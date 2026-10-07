<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { SURVEY_LABELS } from '../../core/workspace/survey.js';
const props = defineProps({ state: Object, actions: Object });
const survey = computed(() => props.state.resources?.survey);
const disabled = computed(() => props.state.workMode !== 'edit' || props.state.resources?.busy || props.state.busy);
const values = reactive({}),
  date = ref(''),
  notes = ref(''),
  unit = ref('m');
// 对象切换或记录保存才重置输入；未测量值留空，不把估算尺寸冒充实测。
watch(
  [() => survey.value?.id, () => props.state.resources?.revision],
  () => {
    unit.value = 'm';
    for (const key of Object.keys(values)) delete values[key];
    Object.assign(values, survey.value?.record?.values || {});
    date.value = survey.value?.record?.date || new Date().toLocaleDateString('en-CA');
    notes.value = survey.value?.record?.notes || '';
  },
  { immediate: true }
);
function changeUnit(event) {
  const next = event.target.value;
  for (const key of Object.keys(values))
    if (values[key] !== '' && values[key] != null) values[key] = Number(values[key]) * (next === 'mm' ? 1000 : 0.001);
  unit.value = next;
}
</script>
<template>
  <section v-if="survey" class="workspace-panel">
    <h3>
      现场实测 <small>{{ survey.status }}</small>
    </h3>
    <p class="muted">{{ survey.name }} · 保存记录不改变地图；应用后可用布局撤销。位置在上方 X/Y 属性中调整。</p>
    <form @submit.prevent="actions.saveSurvey(survey.id, { values: { ...values }, date, notes, unit })">
      <label>测量日期<input v-model="date" type="date" :disabled="disabled" required /></label>
      <label
        >输入单位<select :value="unit" :disabled="disabled" @change="changeUnit">
          <option value="m">米</option>
          <option value="mm">毫米</option>
        </select></label
      >
      <table class="survey-table">
        <thead>
          <tr>
            <th>尺寸</th>
            <th>地图 / 米</th>
            <th>实测 / {{ unit === 'mm' ? '毫米' : '米' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key in survey.keys" :key="key">
            <td>{{ key === 'width' && survey.kind === 'rack' ? '单格宽' : SURVEY_LABELS[key] }}</td>
            <td>{{ survey.current[key] }}</td>
            <td>
              <input
                v-model="values[key]"
                type="number"
                step="any"
                :min="key === 'offset' ? 0 : 0.001"
                :aria-label="'实测' + SURVEY_LABELS[key]"
                :disabled="disabled"
                required
              />
            </td>
          </tr>
        </tbody>
      </table>
      <label>备注<textarea v-model="notes" maxlength="4000" :disabled="disabled"></textarea></label>
      <button :disabled="disabled">保存记录</button>
      <button type="button" :disabled="disabled || !survey.record" @click="actions.applySurvey(survey.id)">
        应用已保存实测值
      </button>
    </form>
    <p v-if="state.resources?.error" role="alert" class="workspace-error">{{ state.resources.error }}</p>
  </section>
</template>
