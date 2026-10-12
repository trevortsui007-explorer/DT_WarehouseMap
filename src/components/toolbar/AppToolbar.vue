<script setup>
import ToolIcon from '../ToolIcon.vue';
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
// 工具栏只发出保存、发布和模式切换意图；服务器权限与发布结果由 Application 处理。
const props = defineProps({ state: Object, actions: Object });
const uploadDialog = ref(),
  uploading = ref(false),
  uploadError = ref(''),
  uploadCode = ref('');
const loadMenu = ref(),
  loadToggle = ref(),
  loadOpen = ref(false),
  refreshing = ref(false);
let loadCloseTimer;
function enterLoad(event) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(loadCloseTimer);
  loadOpen.value = true;
}
function leaveLoad(event) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(loadCloseTimer);
  loadCloseTimer = setTimeout(() => {
    loadOpen.value = false;
  }, 180);
}
function closeLoad(event) {
  if (!loadMenu.value?.contains(event.target)) loadOpen.value = false;
}
function escapeLoad() {
  loadOpen.value = false;
  loadToggle.value?.focus();
}
async function refreshService() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await props.actions.retryRemote();
  } finally {
    refreshing.value = false;
  }
}
function loadLayout(action) {
  loadOpen.value = false;
  props.actions[action]();
}
onMounted(() => document.addEventListener('pointerdown', closeLoad));
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeLoad);
  clearTimeout(loadCloseTimer);
});
const importDialog = ref(),
  importFile = ref(null),
  importInput = ref(),
  importing = ref(false),
  importError = ref(''),
  importDestination = ref('new');
function openImport() {
  loadOpen.value = false;
  importFile.value = null;
  importError.value = '';
  importDestination.value = props.state.workspaceCatalog ? 'new' : 'replace';
  if (importInput.value) importInput.value.value = '';
  importDialog.value.showModal();
}
async function submitImport() {
  if (!importFile.value || importing.value) return;
  importing.value = true;
  importError.value = '';
  try {
    await props.actions.importProject(importFile.value, importDestination.value);
    if (props.state.resources?.error) importError.value = props.state.resources.error;
    else importDialog.value?.close();
  } catch (error) {
    importError.value = error.message;
  } finally {
    importing.value = false;
  }
}
function openUpload() {
  if (!uploadCode.value) uploadCode.value = 'MAP-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  uploadError.value = '';
  uploadDialog.value.showModal();
}
function closeUpload() {
  if (!uploading.value) uploadDialog.value.close();
}
// 上传期间保持单一请求；错误留在弹窗内，保留编码供不确定结果重试。
async function submitUpload() {
  if (uploading.value) return;
  uploading.value = true;
  uploadError.value = '';
  try {
    if (await props.actions.uploadWorkspace(uploadCode.value)) uploadDialog.value.close();
    else uploadError.value = props.state.workspaceCatalog?.error || '上传未完成，请重试。';
  } catch (error) {
    uploadError.value = error.message;
  } finally {
    uploading.value = false;
  }
}
watch(
  () => props.state.workspace?.workspaceId,
  () => {
    uploadDialog.value?.close();
    uploadCode.value = 'MAP-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  }
);
</script>
<template>
  <header>
    <div class="brand">
      <ToolIcon name="warehouse" width="30" height="30" /> <span>成品仓 <small>空间编辑器</small></span>
    </div>
    <span class="badge" v-if="state.workspace" id="workspace-title"
      >{{ state.workspace.projectName }} / {{ state.workspace.name }}</span
    >
    <span class="badge" v-else>布局编辑 · WMS 运行态独立加载</span>
    <div class="actions">
      <button id="layout-open" @click="actions.openLayout()"><ToolIcon name="layout" />布局管理</button>

      <button id="save" class="primary" :disabled="state.workMode !== 'edit'" @click="actions.save()">
        <ToolIcon name="save" />{{ state.workspace?.remoteEligible === false ? '保存本地方案' : '保存服务器草稿' }}
      </button>
      <button
        v-if="state.workspace?.remoteEligible === false"
        :disabled="state.workMode !== 'edit'"
        @click="openUpload"
      >
        <ToolIcon name="upload" />上传为服务器草稿
      </button>
      <button
        v-if="state.workspace?.remoteEligible !== false"
        :disabled="state.workMode !== 'edit' || !state.remote?.capabilities?.canPublishLayout"
        @click="actions.publishLayout()"
      >
        <ToolIcon name="publish" />发布
      </button>
      <div
        ref="loadMenu"
        class="load-menu"
        @pointerenter="enterLoad"
        @pointerleave="leaveLoad"
        @keydown.esc.stop.prevent="escapeLoad"
      >
        <button
          ref="loadToggle"
          type="button"
          :aria-expanded="loadOpen"
          aria-controls="load-options"
          @keydown.down.prevent="loadOpen = true"
          @keydown.enter.prevent="loadOpen = true"
          @keydown.space.prevent="loadOpen = true"
        >
          <ToolIcon name="draft" />载入与导出 <span aria-hidden="true">⌄</span>
        </button>
        <div v-if="loadOpen" id="load-options" class="load-options">
          <button
            type="button"
            :disabled="refreshing || state.workspace?.remoteEligible === false"
            @click="refreshService"
          >
            <ToolIcon name="reset" /><span
              >{{ refreshing ? '正在刷新…' : '刷新服务状态'
              }}<small>检查连接、发布版本和操作权限，不替换画布</small></span
            >
          </button>
          <button
            type="button"
            :disabled="state.workMode !== 'edit' || refreshing || state.workspace?.remoteEligible === false"
            @click="loadLayout('loadServerDraft')"
          >
            <ToolIcon name="draft" /><span>载入服务器草稿<small>载入共享草稿，确认后替换当前画布</small></span>
          </button>
          <button
            type="button"
            :disabled="state.workMode !== 'edit' || refreshing || state.workspace?.remoteEligible === false"
            @click="loadLayout('loadPublishedLayout')"
          >
            <ToolIcon name="published" /><span>载入正式版<small>载入已发布布局，确认后替换当前画布</small></span>
          </button>
          <button
            id="import-layout"
            type="button"
            :disabled="state.workMode !== 'edit' || state.resources?.busy || state.busy"
            @click="openImport"
          >
            <ToolIcon name="upload" /><span>导入布局<small>支持布局 JSON 和完整项目 ZIP</small></span>
          </button>
          <button
            id="export"
            type="button"
            :disabled="!state.ready || state.resources?.busy || state.busy"
            @click="loadLayout('exportProject')"
          >
            <ToolIcon name="export" /><span>导出布局<small>下载完整项目 ZIP，包含地图、底图和实测</small></span>
          </button>
          <p v-if="state.workMode !== 'edit'">切换到编辑模式后可载入布局</p>
        </div>
      </div>
      <div id="work-mode" class="mode-switch" role="group" aria-label="工作模式">
        <button
          id="work-mode-view"
          type="button"
          :aria-pressed="state.workMode === 'view'"
          :disabled="!state.ready"
          @click="state.workMode !== 'view' && actions.setMode('view')"
        >
          查看
        </button>
        <button
          id="work-mode-edit"
          type="button"
          :aria-pressed="state.workMode === 'edit'"
          :disabled="!state.ready"
          @click="state.workMode !== 'edit' && actions.setMode('edit')"
        >
          编辑
        </button>
      </div>
    </div>
  </header>
  <div v-if="state.workspace?.remoteEligible === false" id="remote-status" role="status">
    本地设计方案 · 未上传云端 · 不是正式发布版本
    <span v-if="state.workMode !== 'edit'"> · 切换编辑模式后可上传为服务器草稿</span>
    <span v-if="state.workspaceCatalog?.error" role="alert">{{ state.workspaceCatalog.error }}</span>
  </div>
  <div v-else id="remote-status" role="status">
    <button v-if="state.remote?.status === 'conflict'" @click="actions.keepLocalDraft()">
      <ToolIcon name="save" />保留本机草稿
    </button>
    服务器：{{ state.remote?.status || '未连接' }} · DraftRevision {{ state.remote?.draftRevision ?? '—' }} ·
    PublishedVersion {{ state.remote?.publishedVersion ?? '—' }}
    <span v-if="state.workspace?.remoteLayoutCode"> · 布局 {{ state.workspace.remoteLayoutCode }}</span>
    {{ state.remote?.serverDirty ? ' · 本机工作未同步' : '' }}
    {{ state.remote?.error?.code }} {{ state.remote?.error?.message }}
    <span v-if="state.remote?.serverExists === false"> · 首次保存将创建共享草稿</span>
    <span> · 正式版本保存地图布局，实时库存另行接入</span>
    <span v-if="state.remote?.status === 'conflict'"
      >本机工作已保留，可继续编辑、导出，或载入服务器草稿；不会自动覆盖或合并。</span
    >
  </div>
  <Teleport to="body">
    <dialog
      ref="importDialog"
      class="system-modal"
      aria-labelledby="import-title"
      @cancel="importing && $event.preventDefault()"
    >
      <div class="system-modal-header">
        <div class="system-modal-title">
          <span class="system-modal-icon"><ToolIcon name="upload" /></span>
          <h2 id="import-title">导入布局</h2>
        </div>
        <button
          class="system-modal-close"
          aria-label="关闭导入弹窗"
          :disabled="importing"
          @click="importDialog.close()"
        >
          <ToolIcon name="close" />
        </button>
      </div>
      <div class="system-modal-body">
        <form id="import-layout-form" class="upload-layout-form" @submit.prevent="submitImport">
          <label v-if="state.workspaceCatalog"
            >文件导入方式
            <select v-model="importDestination" :disabled="importing">
              <option value="new">作为新项目打开</option>
              <option value="replace">替换当前方案</option>
            </select>
          </label>
          <label
            >选择布局文件（JSON / ZIP）
            <input
              ref="importInput"
              type="file"
              accept=".json,.zip,application/json,application/zip"
              required
              :disabled="importing"
              @change="importFile = $event.target.files?.[0] || null"
            />
          </label>
          <div class="system-modal-note">
            <ToolIcon name="info" /><span
              >普通 JSON 仅含地图；完整 ZIP
              还包含底图和实测。跨电脑请选择“作为新项目打开”，替换当前方案前会保留恢复包。</span
            >
          </div>
          <p v-if="importError" role="alert" class="form-error">{{ importError }}</p>
        </form>
      </div>
      <div class="system-modal-footer">
        <button :disabled="importing" @click="importDialog.close()"><ToolIcon name="close" />取消</button>
        <button
          type="submit"
          form="import-layout-form"
          class="primary"
          :disabled="!importFile || importing || state.workMode !== 'edit' || state.resources?.busy || state.busy"
        >
          <ToolIcon name="upload" />{{ importing ? '正在导入…' : '确认导入' }}
        </button>
      </div>
    </dialog>
    <dialog
      ref="uploadDialog"
      class="system-modal"
      aria-labelledby="upload-title"
      aria-describedby="upload-description"
      @cancel="uploading && $event.preventDefault()"
    >
      <div class="system-modal-header">
        <div class="system-modal-title">
          <span class="system-modal-icon"><ToolIcon name="upload" /></span>
          <h2 id="upload-title">上传为服务器草稿</h2>
        </div>
        <button
          type="button"
          class="system-modal-close"
          aria-label="关闭上传弹窗"
          :disabled="uploading"
          @click="closeUpload"
        >
          <ToolIcon name="close" />
        </button>
      </div>
      <div class="system-modal-body">
        <p id="upload-description">为当前方案创建共享草稿，上传成功后可继续保存并发布正式版本。</p>
        <form id="upload-layout-form" @submit.prevent="submitUpload" class="upload-layout-form">
          <label for="upload-layout-code">服务器布局编码</label>
          <input
            id="upload-layout-code"
            v-model="uploadCode"
            aria-label="服务器布局编码"
            maxlength="64"
            pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,63}"
            required
            autofocus
            :disabled="uploading"
          />
          <small>最多 64 位，支持英文字母、数字、下划线、短横线和点。</small>
          <div class="system-modal-note">
            <ToolIcon name="info" /><span
              >创建新布局，不覆盖同名布局；保留地图和货位 ID。底图与测量资源仍保存在本机。</span
            >
          </div>
          <p v-if="uploadError" class="form-error" role="alert">{{ uploadError }}</p>
          <p v-if="!state.workspaceCatalog?.remoteConfigured" class="form-error">尚未配置地图服务。</p>
        </form>
      </div>
      <div class="system-modal-footer">
        <button type="button" :disabled="uploading" @click="closeUpload"><ToolIcon name="close" />取消</button>
        <button
          type="submit"
          form="upload-layout-form"
          class="primary"
          :disabled="uploading || state.workMode !== 'edit' || !state.workspaceCatalog?.remoteConfigured"
        >
          <ToolIcon name="upload" />{{ uploading ? '正在上传…' : '确认上传草稿' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>
<style scoped>
.load-menu {
  position: relative;
  margin-left: auto;
}
.load-menu + .mode-switch {
  margin-left: 0;
}
.load-options {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: calc(100% + 8px);
  z-index: 100;
  width: 320px;
  padding: 6px;
  border: 1px solid #d5e4eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 28px #244a6326;
}
.actions .load-options button {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  border: 0;
  padding: 12px;
  background: transparent;
  border-radius: 8px;
}
.actions .load-options button:hover:not(:disabled) {
  background: #edf7f6;
}
.load-options small {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: #718792;
}
.load-options p {
  margin: 6px 12px;
  color: #718792;
  font-size: 12px;
}
.mode-switch {
  display: inline-flex;
  flex-shrink: 0;
  margin-left: auto;
  padding: 4px;
  border: 1px solid #cddfe5;
  border-radius: 999px;
  background: #f4f9fb;
}
.mode-switch button {
  min-width: 64px;
  padding: 8px 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #567181;
  white-space: nowrap;
}
.mode-switch button[aria-pressed='true'] {
  background: #128379;
  color: #fff;
  box-shadow: 0 2px 5px #125e6126;
}
.mode-switch button:focus-visible {
  outline: 2px solid #128379;
  outline-offset: 2px;
}
.actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.upload-layout-form {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}
.upload-layout-form input {
  width: 100%;
  box-sizing: border-box;
}
.upload-layout-form small {
  color: #617783;
  line-height: 1.6;
}
</style>
