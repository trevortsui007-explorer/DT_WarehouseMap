<script setup>
// 侧栏展示 FG 筛选后的货架与共享区域；选择和创建动作统一交给应用层。
defineProps({ state: Object, actions: Object });
const areaTypes = [
  ['aisle', '通道'],
  ['inbound', '入库暂存'],
  ['outbound', '出库拣货暂存'],
];
const rackTypes = ['单层货架', '两层货架', '三层货架'];
</script>
<template>
  <aside class="left">
    <div class="eyebrow">WAREHOUSE / 布局</div>
    <h2>仓库空间</h2>
    <div class="space-card">成品仓现场<small>同一物理空间 · FG 混合存放</small></div>
    <label
      >FG 筛选<select id="zone" :value="state.zone" @change="actions.setZone($event.target.value)">
        <option value="ALL">全部 FG</option>
        <option value="FG01">FG01 · 淡蓝</option>
        <option value="FG02">FG02 · 淡橙</option>
      </select></label
    >
    <label class="color-picker"
      >配色方式<select id="color-mode" :value="state.colorMode" @change="actions.setColor($event.target.value)">
        <option value="inventory">库存状态</option>
        <option value="fg">FG 归属</option>
      </select></label
    >
    <h3>物理区域</h3>
    <button id="boundary-edit" class="boundary-button" @click="actions.selectArea('boundary')">
      ▧ {{ state.workMode === 'edit' ? '编辑' : '查看' }}仓库边界
    </button>
    <div class="area-tools">
      <button
        v-for="[type, label] in areaTypes"
        :key="type"
        :data-area-add="type"
        :disabled="state.workMode !== 'edit'"
        @click="actions.addArea(type)"
      >
        ＋ {{ label }}
      </button>
    </div>
    <div id="area-list">
      <button
        v-for="area in state.areas"
        :key="area.id"
        class="rack-row"
        :class="{ selected: state.selectedIds.includes(area.id) }"
        :data-area="area.id"
        @click="actions.selectArea(area.id, $event)"
      >
        <span>{{ area.name }}</span
        ><small>{{ area.width }}×{{ area.depth }}m</small>
      </button>
    </div>
    <h3>新增货架</h3>
    <p class="muted">新增货架归入当前 FG；全部时默认 FG01</p>
    <div class="templates">
      <button
        v-for="(label, index) in rackTypes"
        :key="index"
        :data-add="index + 1"
        :disabled="state.workMode !== 'edit'"
        @click="actions.addRack(index + 1)"
      >
        ▤
        <span
          >{{ label }}<small>实体货架 · {{ index + 1 }} 层</small></span
        >＋
      </button>
    </div>
    <h3>
      货架列表 <span id="rack-count">{{ state.racks.length }}</span>
    </h3>
    <div id="rack-list">
      <button
        v-for="rack in state.racks"
        :key="rack.id"
        class="rack-row"
        :class="{ selected: state.selectedIds.includes(rack.id) }"
        :data-rack="rack.id"
        @click="actions.selectRack(rack.id, $event)"
      >
        {{ rack.name }}<small>{{ rack.fgCode }} · {{ rack.levels }}层</small>
      </button>
    </div>
    <div class="help">
      二维：拖动货架调整位置<br />空白拖动框选 · Shift 追加选择<br />空格＋拖动平移 · Alt 关闭吸附<br />三维：拖动旋转 ·
      滚轮缩放<br />布局坐标单位：米
    </div>
  </aside>
</template>
