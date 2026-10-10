<script setup>
import { computed, reactive, ref, watch } from 'vue';
const props = defineProps({ state: Object, actions: Object });
const resource = computed(() => props.state.resources);
const image = computed(() => resource.value?.underlay);
const disabled = computed(() => props.state.workMode !== 'edit' || resource.value?.busy || props.state.busy);
const form = reactive({ x: 0, y: 0, rotation: 0, width: 0, opacity: 0.55, visible: true, locked: true });
const destination = ref('new');
const distance = ref(''),
  unit = ref('m');
// 只在资源保存或换图后同步表单，运行态推送不覆盖正在输入的勘察内容。
watch(
  () => resource.value?.revision,
  () => {
    if (image.value) Object.assign(form, image.value, { width: image.value.pixelWidth * image.value.scale });
  }
);
async function file(event, action) {
  const input = event.target;
  await action(input.files?.[0]);
  input.value = '';
}
</script>
<template>
  <details class="workspace-panel">
    <summary>图纸底图与项目备份</summary>
    <p class="muted">底图仅在二维编辑模式显示。仅调整底图，已建对象不随之缩放。</p>
    <label
      >上传／替换底图<input
        type="file"
        accept="image/png,image/jpeg"
        :disabled="disabled"
        @change="file($event, actions.uploadUnderlay)"
    /></label>
    <template v-if="image">
      <p>{{ image.name }} · {{ image.needsReview ? '待核对' : image.calibration ? '已标定' : '未标定' }}</p>
      <form class="workspace-form" @submit.prevent="actions.updateUnderlay(form)">
        <label>原点 X / 米<input v-model="form.x" type="number" step="any" :disabled="disabled" required /></label>
        <label>原点 Y / 米<input v-model="form.y" type="number" step="any" :disabled="disabled" required /></label>
        <label>旋转 / 度<input v-model="form.rotation" type="number" step="any" :disabled="disabled" required /></label>
        <label
          >显示宽 / 米<input v-model="form.width" type="number" min="0.001" step="any" :disabled="disabled" required
        /></label>
        <label
          >透明度<input v-model="form.opacity" type="range" min="0" max="1" step="0.05" :disabled="disabled"
        /></label>
        <label class="check-label"><input v-model="form.visible" type="checkbox" :disabled="disabled" />显示</label>
        <label class="check-label"><input v-model="form.locked" type="checkbox" :disabled="disabled" />锁定拖动</label>
        <button :disabled="disabled">保存底图设置</button>
      </form>
      <div class="area-tools">
        <button
          :disabled="disabled || image.locked || state.view !== '2d'"
          @click="actions.setUnderlayInteraction('move')"
        >
          摆放底图
        </button>
        <button :disabled="disabled || state.view !== '2d'" @click="actions.setUnderlayInteraction('calibrate')">
          两点标定
        </button>
      </div>
      <div v-if="resource.interaction === 'calibrate'">
        <p class="muted">在图片上依次点击两点（{{ resource.points.length }}/2）；底图临时置顶便于点选。</p>
        <form class="workspace-form" @submit.prevent="actions.calibrateUnderlay(distance, unit)">
          <label
            >两点实际距离<input v-model="distance" type="number" min="0.001" step="any" required :disabled="disabled"
          /></label>
          <label
            >单位<select v-model="unit">
              <option value="m">米</option>
              <option value="mm">毫米</option>
            </select></label
          >
          <button :disabled="disabled || resource.points.length !== 2">应用标定</button>
        </form>
      </div>
      <button v-if="resource.interaction" :disabled="disabled" @click="actions.setUnderlayInteraction(null)">
        结束底图工具
      </button>
      <button class="danger" :disabled="disabled" @click="actions.removeUnderlay()">移除底图</button>
    </template>
    <p v-if="resource?.busy" class="muted">正在处理本机资源…</p>
    <p v-if="resource?.error" role="alert" class="workspace-error">{{ resource.error }}</p>
    <hr />
    <button :disabled="resource?.busy" @click="actions.exportProject()">导出项目备份</button>
    <label v-if="state.workspaceCatalog"
      >文件导入方式<select v-model="destination" :disabled="disabled">
        <option value="new">作为新项目打开</option>
        <option value="replace">替换当前方案</option>
      </select></label
    >
    <label
      >导入布局 / 项目备份<input
        type="file"
        accept=".json,application/json"
        :disabled="disabled"
        @change="file($event, value => actions.importProject(value, destination))"
    /></label>
    <p class="muted">
      支持布局 JSON
      和项目备份，跨电脑请选「作为新项目打开」。普通布局仅含地图；完整备份还含底图和实测。替换前会保留恢复包。
    </p>
    <details v-if="resource?.recoveries?.length">
      <summary>替换前项目恢复包</summary>
      <button
        v-for="item in [...resource.recoveries].reverse()"
        :key="item.id"
        :disabled="disabled"
        @click="actions.recoverProject(item.id)"
      >
        恢复 {{ new Date(item.at).toLocaleString() }}
      </button>
    </details>
  </details>
</template>
