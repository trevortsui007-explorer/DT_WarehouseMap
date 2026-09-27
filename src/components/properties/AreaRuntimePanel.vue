<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ state: Object, actions: Object });
const collapsed = ref(false);
// 仅保存绑定编辑表单；库存摘要来自 state，不能通过此表单修改 HU 或 CurrentLocation。
const draft = ref({ virtualLocationCode: '', displayName: '', purpose: 'RECEIVING', isActive: true });
// 只监听所选物理区域 ID；切换区域时重置表单，同一区域的 Runtime 更新不会清空输入。
watch(
  () => props.state.physicalArea?.areaId,
  () => {
    collapsed.value = false;
    draft.value = { virtualLocationCode: '', displayName: '', purpose: 'RECEIVING', isActive: true };
  }
);
</script>
<template>
  <section
    v-if="state.physicalArea"
    class="area-runtime-panel"
    :class="{ collapsed }"
    aria-label="Physical Area 虚拟库位"
  >
    <button class="area-sheet-toggle" @click="collapsed = !collapsed">
      {{ collapsed ? '展开虚拟库位' : '收起区域详情' }}
    </button>
    <div v-show="!collapsed">
      <h3>Physical Area · 虚拟库位</h3>
      <p class="muted">全部启用绑定均展示。3D 等分仅为可视化，不代表真实隔断。</p>
      <div
        v-for="row in state.physicalArea.rows"
        :key="row.id"
        class="virtual-area-detail"
        :data-virtual-code="row.virtualLocationCode"
      >
        <button @click="actions.selectVirtualArea(row.areaId, row.virtualLocationCode)">
          {{ row.displayName }} · {{ row.virtualLocationCode }}
        </button>
        <p>
          {{ row.summary?.huCount ?? '—' }} HU · {{ row.summary?.palletCount ?? '—' }} 托 ·
          {{ row.summary?.outerBoxCount ?? '—' }} 外箱
        </p>
        <div v-if="state.selectedVirtual === row.virtualLocationCode">
          <button @click="actions.loadVirtualDetail(row.virtualLocationCode)">按需读取明细</button>
          <p v-if="state.virtualDetail?.status === 'loading'">明细加载中…</p>
          <p v-if="state.virtualDetail?.error" role="alert">{{ state.virtualDetail.error }}</p>
          <pre v-if="state.virtualDetail?.status === 'ready'">{{
            JSON.stringify(state.virtualDetail.data, null, 2)
          }}</pre>
        </div>
      </div>
      <p v-if="!state.physicalArea.rows.length">尚无启用的 Virtual Location 绑定。</p>
      <p v-else>
        合计 {{ state.physicalArea.totals.huCount ?? '未知' }} HU ·
        {{ state.physicalArea.totals.palletCount ?? '未知' }} 托 ·
        {{ state.physicalArea.totals.outerBoxCount ?? '未知' }} 外箱
      </p>
      <details v-if="state.workMode === 'edit'">
        <summary>编辑布局绑定</summary>
        <div v-for="binding in state.areaBindings" :key="binding.id">
          {{ binding.displayName }} · {{ binding.virtualLocationCode }}
          <button @click="draft = { ...binding }">编辑</button>
          <button @click="actions.saveAreaBinding({ ...binding, isActive: !binding.isActive })">
            {{ binding.isActive ? '停用' : '启用' }}
          </button>
          <button @click="actions.removeAreaBinding(binding.id)">移除绑定</button>
        </div>
        <form @submit.prevent="actions.saveAreaBinding(draft)">
          <label>WMS Virtual Location<input v-model="draft.virtualLocationCode" required /></label>
          <label>显示名称<input v-model="draft.displayName" required /></label>
          <label>用途<input v-model="draft.purpose" required /></label>
          <label><input v-model="draft.isActive" type="checkbox" />启用</label>
          <button type="submit">保存绑定</button>
          <button
            type="button"
            @click="draft = { virtualLocationCode: '', displayName: '', purpose: 'RECEIVING', isActive: true }"
          >
            新增绑定
          </button>
        </form>
      </details>
    </div>
  </section>
</template>
