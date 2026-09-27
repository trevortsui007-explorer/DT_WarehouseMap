<script setup>
import { computed } from 'vue';
// defineProps 是 script setup 编译宏；state 用于显示，actions 将操作交给 Application。
const props = defineProps({ state: Object, actions: Object });
// computed 随依赖自动重新计算按钮可用性；这只是界面提示，命令执行器仍会检查编辑权限。
const editableSelection = computed(
  () => props.state.workMode === 'edit' && props.state.view === '2d' && props.state.selection.count > 0
);
</script>
<template>
  <section class="workspace">
    <div class="toolbar">
      <div class="tabs">
        <button data-view="2d" :class="{ active: state.view === '2d' }" @click="actions.setView('2d')">
          {{ state.workMode === 'edit' ? '二维编辑' : '二维查看' }}
        </button>
        <button data-view="3d" :class="{ active: state.view === '3d' }" @click="actions.setView('3d')">三维查看</button>
      </div>
      <div class="actions">
        <label class="inline"
          >显示层<select id="level" :value="state.level" @change="actions.setLevel($event.target.value)">
            <option value="0">全部层汇总</option>
            <option v-for="n in 3" :key="n" :value="n">第 {{ n }} 层</option>
          </select></label
        ><button id="fit" @click="actions.fit()">复位视角</button>
      </div>
    </div>
    <div class="edit-toolbar">
      <span id="selection-count">{{
        state.doorId ? '已选 1 个门' : state.selection.count ? '已选 ' + state.selection.count + ' 项' : '未选择'
      }}</span>
      <button id="pan-tool" :disabled="state.view !== '2d'" title="按住空格也可平移">平移</button>
      <button id="focus-selection" :disabled="!state.selection.count && !state.doorId">聚焦 F</button>
      <button id="selection-copy" :disabled="!editableSelection">复制</button
      ><button id="selection-delete" :disabled="!editableSelection">删除</button>
      <button id="precise-open" :disabled="!editableSelection">精确变换</button
      ><button id="array-open" :disabled="!editableSelection">阵列复制</button
      ><button id="shortcut-help">快捷键 ?</button>
    </div>
    <div class="canvas-wrap">
      <div id="canvas2d" :hidden="state.view !== '2d'"></div>
      <div id="canvas3d" :hidden="state.view !== '3d'"></div>
      <div class="map-label">
        <b id="zone-title">成品仓 · 共享空间</b
        ><span>{{ state.zone === 'ALL' ? '全部 FG · 同一物理空间' : state.zone + ' 高亮 · 其他货架淡化' }}</span>
      </div>
      <div class="legend">
        <span v-for="[color, label] in state.legend" :key="label"
          ><i :style="{ background: color }"></i>{{ label }}</span
        >
      </div>
      <div id="stats" class="stats">
        <div v-for="[value, label] in state.stats" :key="label" class="stat">
          <b>{{ value }}</b
          ><span>{{ label }}</span>
        </div>
      </div>
    </div>
    <div id="runtime-status" role="status">
      {{
        {
          loading: '运行状态加载中',
          ready: '运行快照已载入',
          error: '实时状态暂不可用',
          stale: '运行状态可能已过期',
          reconnecting: '正在重新连接',
        }[state.runtime?.status] || '运行状态加载中'
      }}
      {{ state.runtime?.error }}
      <span v-if="state.runtime?.connected && state.runtime?.status === 'ready'"> · 实时状态已连接</span>
      <button @click="actions.retryRuntime()">重新同步运行态</button>
    </div>
    <footer>
      <span id="save-state">{{ state.saveState }}</span
      ><span id="status">{{
        state.workMode === 'edit' ? '编辑模式 · 支持拖动、快捷键和批量操作' : '查看模式 · 布局已锁定，可选择与浏览'
      }}</span
      ><span>三维箱堆为示意，不表示真实堆码位置</span>
    </footer>
  </section>
</template>
