<script setup>
import { computed, ref, watch } from 'vue';
import DomainForm from './DomainForm.vue';
import AreaRuntimePanel from './AreaRuntimePanel.vue';
import { AREA_TYPES } from '../../core/spatial/spatial.js';
import { SIDES, DOOR_TYPES } from '../../core/doors/doors.js';
// 属性面板读取应用展示快照；所有属性修改通过 actions 提交并由命令校验。
const props = defineProps({ state: Object, actions: Object });
const edit = computed(() => props.state.workMode === 'edit');
const batch = computed(() => props.state.selection.count > 1);
const code = ref('');
// 将当前选中货位编码同步到独立输入框，不直接双向绑定共享模型。
watch(
  () => props.state.slot,
  slot => {
    code.value = slot?.code || '';
  }
);
// 声明式字段描述供 DomainForm 生成控件，数值转换与业务验证仍由命令负责。
const field = (key, label, type, wide = false) => ({ key, label, type, wide });
const rackFields = [
  {
    key: 'fgCode',
    label: '所属 FG',
    wide: true,
    options: [
      ['FG01', 'FG01'],
      ['FG02', 'FG02'],
    ],
  },
  field('name', '货架名称', 'text', true),
  field('x', 'X 坐标 / 米'),
  field('y', 'Y 坐标 / 米'),
  field('cols', '列数'),
  field('levels', '层数'),
  field('width', '单格宽 / 米'),
  field('depth', '深度 / 米'),
  field('levelHeight', '层高 / 米'),
  field('rotation', '旋转 / 度'),
];
// 边界不显示旋转编辑字段；随选择变化重新生成表单描述。
const areaFields = computed(() => [
  field('name', '名称', 'text', true),
  field('x', 'X 坐标 / 米'),
  field('y', 'Y 坐标 / 米'),
  field('width', '宽度 / 米'),
  field('depth', '深度 / 米'),
  ...(props.state.spatial?.id === 'boundary' ? [] : [field('rotation', '旋转 / 度')]),
]);
const doorFields = [
  field('name', '门名称', 'text', true),
  { key: 'side', label: '所在边', options: Object.entries(SIDES) },
  { key: 'type', label: '用途', options: Object.entries(DOOR_TYPES).map(([key, value]) => [key, value.label]) },
  { ...field('offset', '起点偏移 / 米'), min: 0 },
  { ...field('width', '门宽 / 米'), min: 0.5 },
];
// 从所选货架生成由高到低的层号，供详情列表分层展示。
const levels = computed(() =>
  props.state.rack ? Array.from({ length: props.state.rack.levels }, (_, i) => props.state.rack.levels - i) : []
);
</script>
<template>
  <aside class="right">
    <div id="batch-inspector" v-if="batch">
      <div class="eyebrow">SELECTION / 多选</div>
      <h2 id="batch-count">已选择 {{ state.selection.count }} 个对象</h2>
      <p id="batch-size" class="muted">
        组合范围 {{ state.selection.bounds.width.toFixed(2) }} ×
        {{ state.selection.bounds.depth.toFixed(2) }} 米；移动和旋转会保持相对位置。
      </p>
      <p class="muted">拖动其中一个对象，可一起移动。<br />工具栏提供精确变换、阵列复制与删除。</p>
    </div>
    <div id="spatial-inspector" v-else-if="state.spatial">
      <div class="eyebrow">SPACE / 物理区域</div>
      <h2>
        {{
          state.doorId ? '门属性' : state.spatial.id === 'boundary' ? '仓库边界' : AREA_TYPES[state.spatial.type].label
        }}
      </h2>
      <DomainForm
        v-if="!state.doorId"
        id="area-form"
        :data="state.spatial"
        :fields="areaFields"
        :disabled="!edit"
        @apply="actions.updateArea"
      >
        <template #description
          ><p class="muted">
            面积 {{ (state.spatial.width * state.spatial.depth).toFixed(1) }} m² · 不属于任何 FG<br />{{
              state.spatial.id === 'boundary' ? '修改边界不会移动内部货架。' : '拖动区域可移动；右下角手柄可调整大小。'
            }}
          </p></template
        >
        <button
          v-if="state.spatial.id !== 'boundary'"
          id="area-delete"
          type="button"
          class="danger"
          :disabled="!edit"
          @click="actions.removeArea()"
        >
          删除区域</button
        ><button id="back-rack" type="button" @click="actions.backToRack()">返回货架</button>
      </DomainForm>
      <AreaRuntimePanel :state="state" :actions="actions" />
      <div v-if="state.spatial.id === 'boundary'" id="door-editor">
        <h3>
          边界门 <span>{{ (state.spatial.doors || []).length }} 个</span>
        </h3>
        <p class="muted">上／下边的起点在左端；左／右边的起点在上端。偏移表示门开口起点距该端的距离。</p>
        <button id="door-add" type="button" :disabled="!edit" @click="actions.addDoor()">＋ 新增门</button>
        <button
          v-for="door in state.spatial.doors || []"
          :key="door.id"
          class="door-select"
          :class="{ active: state.doorId === door.id }"
          :data-door-select="door.id"
          @click="actions.selectDoor(door.id)"
        >
          {{ door.name }} · {{ SIDES[door.side] }}
        </button>
        <DomainForm
          v-for="door in (state.spatial.doors || []).filter(item => !state.doorId || item.id === state.doorId)"
          :key="door.id"
          class="door-form"
          :data-door-id="door.id"
          :data="door"
          :fields="doorFields"
          :disabled="!edit"
          submit-label="应用门设置"
          @apply="actions.updateDoor(door.id, $event)"
          ><button
            type="button"
            class="danger"
            :data-door-delete="door.id"
            :disabled="!edit"
            @click="actions.removeDoor(door.id)"
          >
            删除门
          </button></DomainForm
        >
      </div>
    </div>
    <div v-else id="rack-inspector">
      <div class="eyebrow">PROPERTIES / 属性</div>
      <h2 id="selection-title">货架属性</h2>
      <div id="properties">
        <DomainForm
          v-if="state.rack"
          id="rack-form"
          :data="state.rack"
          :fields="rackFields"
          :disabled="!edit"
          @apply="actions.updateRack"
          ><button id="duplicate" type="button" :disabled="!edit" @click="actions.duplicateRack()">复制</button
          ><button id="remove" type="button" class="danger" :disabled="!edit" @click="actions.removeRack()">
            删除
          </button></DomainForm
        >
        <p v-else class="muted">从左侧添加货架开始。</p>
      </div>
      <h3>货架立面 <small>点击格子查看货位</small></h3>
      <div id="elevation">
        <div v-for="level in levels" :key="level" class="elevation-row">
          <span>{{ level }}F</span
          ><button
            v-for="slot in state.rack.slots.filter(item => item.level === level)"
            :key="slot.id"
            class="cell"
            :class="{
              empty: state.runtime?.locations[slot.code]?.occupancyStatus !== 'OCCUPIED',
              chosen: state.slot?.id === slot.id,
            }"
            :data-slot="slot.id"
            :title="slot.code + ' · ' + (state.runtime?.locations[slot.code]?.outerBoxCount ?? '—') + '箱'"
            @click="actions.selectSlot(slot.id)"
          >
            {{ state.runtime?.locations[slot.code]?.outerBoxCount ?? '—' }}
          </button>
        </div>
      </div>
      <div id="location-detail">
        <div v-if="state.slot" class="detail">
          <b>{{ state.slot.code }}</b>
          <p>
            所属 {{ state.rack.fgCode }} · 第 {{ state.slot.level }} 层 · 第 {{ state.slot.col }} 列<br />当前外箱：{{
              state.runtime?.locations[state.slot.code]?.outerBoxCount ?? '—'
            }}
            箱<br />数量来自独立 WMS 运行态；未返回的货位不视为空位。
          </p>
          <p v-if="state.locationCodeLocked" class="muted">
            已发布或尚未核验的货位编码不可改；如需更新请联系 IT 人员。
          </p>
          <p>
            HU：{{ state.runtime?.locations[state.slot.code]?.huCount ?? '—' }}<br />
            占用：{{ state.runtime?.locations[state.slot.code]?.occupancyStatus ?? '未知' }}<br />
            锁定：{{ state.runtime?.locations[state.slot.code]?.lockStatus ?? '未知' }}<br />
            任务：{{ state.runtime?.locations[state.slot.code]?.taskStatus ?? '—' }}
          </p>
          <label
            >货位编码<input id="location-code" v-model="code" :disabled="!edit || state.locationCodeLocked" /></label
          ><button id="bind" :disabled="!edit || state.locationCodeLocked" @click="actions.bindCode(code)">
            保存编码
          </button>
        </div>
        <p v-else class="muted">点击立面货位，查看数量与编码。</p>
      </div>
    </div>
    <div id="spatial-checks">
      <h3>
        布局检查 <span>{{ state.warnings.length ? state.warnings.length + ' 项提示' : '通过' }}</span>
      </h3>
      <button
        v-for="(warning, index) in state.warnings.slice(0, 12)"
        :key="index"
        class="warning-row"
        :data-warning="warning.id"
        @click="actions.selectWarning(warning.id)"
      >
        {{ warning.text }}
      </button>
      <p v-if="state.warnings.length > 12" class="muted">
        另有 {{ state.warnings.length - 12 }} 项，请先处理以上提示。
      </p>
      <p v-if="!state.warnings.length" class="muted">无越界、货架占用通道或暂存区。</p>
    </div>
  </aside>
</template>
