<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ state: Object, actions: Object });
const projectId = ref(''),
  name = ref(''),
  width = ref(30),
  depth = ref(20),
  schemeName = ref('');
const renameProject = ref(''),
  renameScheme = ref('');
const projects = computed(() => props.state.workspaceCatalog?.projects || []);
const project = computed(() => projects.value.find(item => item.projectId === projectId.value));
const busy = computed(() => props.state.workspaceCatalog?.busy || props.state.busy);
watch(
  () => props.state.workspace?.workspaceId,
  () => {
    projectId.value = props.state.workspace?.projectId || '';
  },
  { immediate: true }
);
watch(project, value => {
  renameProject.value = value?.name || '';
});
watch(
  () => props.state.workspace?.name,
  value => {
    renameScheme.value = value || '';
  },
  { immediate: true }
);
</script>
<template>
  <section v-if="state.workspaceCatalog" class="project-manager">
    <div class="project-heading">
      <div>
        <h3>地图项目</h3>
        <p class="muted">选择项目，打开或创建独立的本地方案。</p>
      </div>
      <span class="manager-tag">本机工作区</span>
    </div>
    <p v-if="state.workspaceCatalog.error" class="manager-alert" role="alert">{{ state.workspaceCatalog.error }}</p>
    <div class="project-picker-card">
      <label
        >当前浏览项目<select v-model="projectId" :disabled="busy" data-project-select>
          <option v-for="item in projects" :key="item.projectId" :value="item.projectId">{{ item.name }}</option>
        </select></label
      >
      <details v-if="project" class="project-rename">
        <summary>重命名项目</summary>
        <form class="project-inline" @submit.prevent="actions.renameProject(projectId, renameProject)">
          <input v-model="renameProject" aria-label="地图项目名称" maxlength="100" required :disabled="busy" />
          <button :disabled="busy">保存名称</button>
        </form>
      </details>
    </div>
    <div class="scheme-heading">
      <h3>草稿方案</h3>
      <span class="muted">{{ project?.workspaces.length || 0 }} 份 · 各自独立保存</span>
    </div>
    <div class="scheme-list">
      <div
        v-for="scheme in project?.workspaces || []"
        :key="scheme.workspaceId"
        class="scheme-card"
        :class="{ 'is-current': scheme.workspaceId === state.workspace?.workspaceId }"
        :data-workspace="scheme.workspaceId"
      >
        <div class="scheme-description">
          <div class="scheme-title">
            <b>{{ scheme.name }}</b>
            <span v-if="scheme.workspaceId === state.workspace?.workspaceId" class="manager-tag current-tag"
              >当前打开</span
            >
          </div>
          <small
            >{{ new Date(scheme.updatedAt).toLocaleString('zh-CN', { hour12: false }) }} ·
            {{ scheme.remoteEligible ? '服务器布局' : '本地方案' }} {{ scheme.remoteLayoutCode || '' }}</small
          >
        </div>
        <button
          class="scheme-open"
          :disabled="busy || scheme.workspaceId === state.workspace?.workspaceId"
          @click="actions.openWorkspace(scheme.workspaceId)"
        >
          {{ scheme.workspaceId === state.workspace?.workspaceId ? '已打开' : '打开' }}
        </button>
      </div>
    </div>
    <div class="scheme-actions-card">
      <h3>
        当前方案操作 <small>{{ state.workspace?.name }}</small>
      </h3>
      <form class="project-inline" @submit.prevent="actions.renameWorkspace(state.workspace.workspaceId, renameScheme)">
        <label
          >修改方案名称<input
            v-model="renameScheme"
            aria-label="当前方案名称"
            maxlength="100"
            required
            :disabled="busy"
        /></label>
        <button :disabled="busy">重命名方案</button>
      </form>
      <form class="project-inline" @submit.prevent="actions.copyWorkspace(schemeName)">
        <label
          >新方案名称<input
            v-model="schemeName"
            aria-label="新方案名称"
            placeholder="如：调整方案 A"
            maxlength="100"
            required
            :disabled="busy"
        /></label>
        <button class="manager-blue" :disabled="busy">复制为新方案</button>
      </form>
      <p class="muted">复制当前打开的方案，保留底图；实测记录标记为待复核。</p>
    </div>
    <details class="new-map-card">
      <summary>＋ 新建空白地图 <span>建立另一个地图项目</span></summary>
      <form class="new-map-form" @submit.prevent="actions.createMap({ name, width, depth })">
        <label class="map-name-field"
          >地图名称<input v-model="name" placeholder="如：二楼成品仓" maxlength="100" required :disabled="busy"
        /></label>
        <label
          >边界宽 / 米<input v-model="width" type="number" min="0.5" max="400" step="any" required :disabled="busy"
        /></label>
        <label
          >边界深 / 米<input v-model="depth" type="number" min="0.5" max="400" step="any" required :disabled="busy"
        /></label>
        <div class="new-map-submit"><button class="manager-orange" :disabled="busy">新建地图</button></div>
      </form>
    </details>
    <section class="scheme-actions-card">
      <h3>服务器布局</h3>
      <p class="muted">上传的草稿可跨设备读取；打开已有本机工作区不会自动覆盖本机编辑，可再点击载入服务器草稿。</p>
      <button :disabled="busy || !state.workspaceCatalog.remoteConfigured" @click="actions.refreshServerLayouts()">
        刷新服务器布局
      </button>
      <div v-for="layout in state.workspaceCatalog.serverLayouts" :key="layout.layoutCode" class="scheme-card">
        <span
          >{{ layout.layoutName }} · {{ layout.layoutCode }} ·
          {{ layout.publishedVersion == null ? '尚未发布' : '正式版本 ' + layout.publishedVersion }}</span
        >
        <button :disabled="busy" @click="actions.openServerLayout(layout.layoutCode)">打开服务器草稿</button>
      </div>
    </section>
    <p class="manager-local-note">
      新项目与方案先保存在本机；编辑模式下使用“上传为服务器草稿”建立共享布局，然后保存、发布。
    </p>
  </section>
</template>
