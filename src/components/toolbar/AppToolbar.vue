<script setup>
// 工具栏只发出保存、发布和模式切换意图；服务器权限与发布结果由 Application 处理。
defineProps({ state: Object, actions: Object });
</script>
<template>
  <header>
    <div class="brand">
      ▦ <span>成品仓 <small>空间编辑器</small></span>
    </div>
    <span class="badge">布局编辑 · WMS 运行态独立加载</span>
    <div class="actions">
      <label class="mode-picker"
        >模式
        <select
          id="work-mode"
          :value="state.workMode"
          :disabled="!state.ready"
          @change="actions.setMode($event.target.value)"
        >
          <option value="view">查看模式</option>
          <option value="edit">编辑模式</option>
        </select>
      </label>
      <button id="layout-open" @click="actions.openLayout()">布局管理</button>
      <button id="undo" :disabled="state.workMode !== 'edit' || !state.canUndo" @click="actions.undo()">撤销</button>
      <button id="redo" :disabled="state.workMode !== 'edit' || !state.canRedo" @click="actions.redo()">重做</button>
      <button id="export" @click="actions.export()">导出布局</button>
      <button id="save" class="primary" :disabled="state.workMode !== 'edit'" @click="actions.save()">
        保存服务器草稿
      </button>
      <button @click="actions.retryRemote()">读取服务状态</button>
      <button :disabled="state.workMode !== 'edit'" @click="actions.loadServerDraft()">载入服务器草稿</button>
      <button :disabled="!state.remote?.capabilities?.canPublishLayout" @click="actions.publishLayout()">发布</button>
    </div>
  </header>
  <div id="remote-status" role="status">
    <button v-if="state.remote?.status === 'conflict'" @click="actions.keepLocalDraft()">保留本机草稿</button>
    服务器：{{ state.remote?.status || '未连接' }} · DraftRevision {{ state.remote?.draftRevision ?? '—' }} ·
    PublishedVersion {{ state.remote?.publishedVersion ?? '—' }}
    {{ state.remote?.serverDirty ? ' · 本机工作未同步' : '' }}
    {{ state.remote?.error?.code }} {{ state.remote?.error?.message }}
    <span v-if="state.remote?.status === 'conflict'"
      >本机工作已保留，可继续编辑、导出，或载入服务器草稿；不会自动覆盖或合并。</span
    >
  </div>
</template>
