import { validateLayout } from '../../core/model/layout-validation.js';

export const LOCK_MESSAGE = '此货位已发布，如需更新请联系 IT 人员进行修改。';
const revision = value => Number.isSafeInteger(value) && value >= 0;

// 维护远程草稿并发与发布身份；本地自动保存、服务器草稿修订和发布版本各自独立。
export function createRemoteLifecycle(api) {
  const state = {
    status: 'idle',
    error: null,
    draftRevision: null,
    basedOnPublishedVersion: null,
    publishedVersion: null,
    identityVerified: false,
    serverExists: true,
    serverDirty: true,
    capabilities: { canEditLayout: true, canSaveDraft: false, canPublishLayout: false },
  };
  let identities = new Map(),
    publishedCodes = new Set(),
    busy = false,
    synced = null,
    pendingPublication = null;
  const code = () => api.model().layoutCode;
  const notify = () => api.changed({ ...state, capabilities: { ...state.capabilities } });
  // 按结构化错误码或 HTTP 409 识别冲突，只更新状态，不清理本地工作或自动覆盖远端。
  function failure(error) {
    state.status = error.code === 'LAYOUT_DRAFT_CONFLICT' || error.status === 409 ? 'conflict' : 'error';
    state.error = { code: error.code || 'SERVER_UNAVAILABLE', message: error.message, details: error.details || null };
    notify();
  }
  // 缺少远程服务时明确报错，本地草稿仍保留。
  function unavailable() {
    throw Object.assign(Error('尚未配置 WMS 服务，本机工作已保留'), { code: 'SERVER_UNAVAILABLE' });
  }
  // 阻止已发布 ID 改码，以及新 ID 冒用已发布编码；业务占用删除仍由服务端发布校验。
  function assertIdentity(layout) {
    for (const slot of layout.racks.flatMap(rack => rack.slots)) {
      const original = identities.get(slot.id);
      if ((original && original !== slot.code) || (publishedCodes.has(slot.code) && !identities.has(slot.id)))
        throw Object.assign(Error(LOCK_MESSAGE), { code: 'PUBLISHED_LOCATION_RENAME_FORBIDDEN' });
    }
  }
  // 明确独立的本地方案允许改码；云端未配置或断线不等于本地方案，仍须核验发布身份。
  function canRename(slot) {
    return (
      !!slot &&
      (state.identityVerified || (api.localOnly === true && !api.remote)) &&
      !identities.has(slot.id) &&
      !publishedCodes.has(slot.code)
    );
  }
  // 读取发布身份与服务端能力，再恢复本机并发检查点；不会借初始化覆盖当前布局。
  async function initialize() {
    if (busy) return;
    if (!api.remote) {
      state.status = 'unconfigured';
      notify();
      return;
    }
    busy = true;
    try {
      const published = await api.remote.getPublishedLayout(code());
      if (
        published.layoutCode !== code() ||
        !(published.publishedVersion === null || revision(published.publishedVersion))
      )
        throw Error('已发布布局契约无效');
      const publishedLayout = published.layout ? validateLayout(published.layout) : null;
      if (
        publishedLayout &&
        (publishedLayout.layoutCode !== code() || publishedLayout.layoutId !== api.model().layoutId)
      )
        throw Error('已发布布局身份不匹配');
      const slots = publishedLayout ? publishedLayout.racks.flatMap(rack => rack.slots) : [];
      if (published.publishedVersion !== null && !published.layout) throw Error('已发布布局缺少完整快照');
      identities = new Map(slots.map(slot => [slot.id, slot.code]));
      publishedCodes = new Set(slots.map(slot => slot.code));
      state.identityVerified = true;
      state.serverExists = published.exists !== false;
      state.publishedVersion = published.publishedVersion;
      state.capabilities = {
        canEditLayout: published.capabilities?.canEditLayout === true,
        canSaveDraft: published.capabilities?.canSaveDraft === true,
        canPublishLayout: published.capabilities?.canPublishLayout === true,
      };
      const checkpoint = await api.local.getRemoteState?.(api.scope + ':' + code());
      if (checkpoint) {
        state.draftRevision = checkpoint.draftRevision;
        state.basedOnPublishedVersion = checkpoint.basedOnPublishedVersion;
        synced = checkpoint.synced;
        pendingPublication = checkpoint.pendingPublication || null;
      }
      if (!state.serverExists) {
        state.draftRevision = null;
        state.basedOnPublishedVersion = null;
        synced = null;
        pendingPublication = null;
      }
      state.serverDirty = synced !== JSON.stringify(api.model());
      state.status = 'ready';
      state.error = null;
      notify();
      return true;
    } catch (error) {
      failure(error);
      return false;
    } finally {
      busy = false;
    }
  }
  // 通过本地 Repository 保存远程修订基线，避免刷新后丢失并发令牌。
  async function checkpoint() {
    await api.local.setRemoteState?.(api.scope + ':' + code(), {
      draftRevision: state.draftRevision,
      basedOnPublishedVersion: state.basedOnPublishedVersion,
      synced,
      pendingPublication,
    });
  }
  // busy 阻止并行远程操作；finally 无论成功失败都释放忙状态。
  async function run(operation) {
    if (busy) return false;
    busy = true;
    try {
      return await operation();
    } catch (error) {
      failure(error);
      return false;
    } finally {
      busy = false;
    }
  }
  // 先确保本地保存成功，再以 expectedDraftRevision 更新同一服务器草稿；不创建发布版本。
  function save() {
    return run(async () => {
      const layout = validateLayout(api.model());
      if (!(await api.flush())) throw Error('本机保存失败，未发送服务器草稿');
      if (!api.remote) unavailable();
      if (!state.capabilities.canSaveDraft)
        throw Object.assign(Error('没有保存服务器草稿的能力'), { code: 'FORBIDDEN' });
      if (state.draftRevision === null && state.serverExists)
        throw Error('请先载入服务器草稿以建立并发基线；本机布局可先导出');
      if (state.status === 'conflict')
        throw Object.assign(Error('草稿存在冲突，请载入服务器草稿或保留并导出本机工作'), {
          code: 'LAYOUT_DRAFT_CONFLICT',
        });
      assertIdentity(layout);
      state.status = 'saving';
      notify();
      if (!state.serverExists) {
        const created = await api.remote.initializeLayout(code(), layout);
        if (created.layoutCode !== code() || created.draftRevision !== 0 || created.basedOnPublishedVersion !== null)
          throw Error('初始化响应契约无效');
        state.serverExists = true;
        state.draftRevision = 0;
        state.basedOnPublishedVersion = null;
        synced = JSON.stringify(layout);
        await checkpoint();
        state.serverDirty = synced !== JSON.stringify(api.model());
        state.status = 'saved';
        state.error = null;
        notify();
        return true;
      }
      const response = await api.remote.saveServerDraft(code(), {
        expectedDraftRevision: state.draftRevision,
        basedOnPublishedVersion: state.basedOnPublishedVersion,
        schemaVersion: 6,
        layout,
      });
      if (
        response.layoutCode !== code() ||
        !revision(response.draftRevision) ||
        response.draftRevision <= state.draftRevision ||
        response.basedOnPublishedVersion !== state.basedOnPublishedVersion
      )
        throw Error('服务器草稿响应契约无效');
      state.draftRevision = response.draftRevision;
      synced = JSON.stringify(layout);
      await checkpoint();
      state.serverDirty = synced !== JSON.stringify(api.model());
      state.status = 'saved';
      state.error = null;
      notify();
      return true;
    });
  }
  // 验证远程草稿后调用带备份的替换流程，成功才接受新的并发基线。
  function loadDraft() {
    return run(async () => {
      if (!api.remote) unavailable();
      if (!state.identityVerified) throw Error('请先重试读取已发布货位身份');
      const response = await api.remote.getServerDraft(code());
      if (
        response.layoutCode !== code() ||
        !revision(response.draftRevision) ||
        !(response.basedOnPublishedVersion === null || revision(response.basedOnPublishedVersion))
      )
        throw Error('服务器草稿契约无效');
      const next = validateLayout(response.layout);
      if (next.layoutCode !== code()) throw Error('服务器布局编码不匹配');
      assertIdentity(next);
      if (!(await api.replace(next))) return false;
      state.draftRevision = response.draftRevision;
      state.basedOnPublishedVersion = response.basedOnPublishedVersion;
      synced = JSON.stringify(next);
      await checkpoint();
      state.serverDirty = synced !== JSON.stringify(api.model());
      state.status = 'ready';
      state.error = null;
      notify();
      return true;
    });
  }
  // 只提交服务端已有且与本地一致的草稿；服务端确认发布后才更新版本并锁定新身份。
  function publish() {
    return run(async () => {
      if (!api.remote) unavailable();
      if (!state.capabilities.canPublishLayout) throw Object.assign(Error('没有发布能力'), { code: 'FORBIDDEN' });
      if (state.draftRevision === null || synced !== JSON.stringify(api.model()))
        throw Error('请先保存当前服务器草稿再发布');
      state.status = 'publishing';
      notify();
      if (
        !pendingPublication ||
        pendingPublication.expectedDraftRevision !== state.draftRevision ||
        pendingPublication.basedOnPublishedVersion !== state.basedOnPublishedVersion
      ) {
        pendingPublication = {
          requestId: crypto.randomUUID(),
          expectedDraftRevision: state.draftRevision,
          basedOnPublishedVersion: state.basedOnPublishedVersion,
        };
        await checkpoint();
      }
      // 请求号已持久化；响应丢失后复用原号，让服务端返回同一正式版本。
      const response = await api.remote.publishLayout(code(), {
        requestId: pendingPublication.requestId,
        expectedDraftRevision: state.draftRevision,
        basedOnPublishedVersion: state.basedOnPublishedVersion,
      });
      if (
        response.layoutCode !== code() ||
        response.status !== 'PUBLISHED' ||
        !revision(response.publishedVersion) ||
        response.publishedVersion < (state.publishedVersion ?? -1) ||
        response.publishedVersion !== (pendingPublication.basedOnPublishedVersion ?? 0) + 1
      )
        throw Error('发布响应契约无效');
      state.publishedVersion = response.publishedVersion;
      // Lock all newly published identities immediately; only server response establishes publication.
      for (const slot of JSON.parse(synced).racks.flatMap(rack => rack.slots)) {
        identities.set(slot.id, slot.code);
        publishedCodes.add(slot.code);
      }
      state.draftRevision = revision(response.draftRevision) ? response.draftRevision : null;
      state.basedOnPublishedVersion = response.publishedVersion;
      pendingPublication = null;
      if (state.draftRevision === null) synced = null;
      state.serverDirty = synced !== JSON.stringify(api.model());
      await checkpoint();
      state.status = 'published';
      state.error = null;
      notify();
      return true;
    });
  }
  function loadPublished() {
    return run(async () => {
      if (!api.remote) unavailable();
      const result = await api.remote.getPublishedLayout(code());
      if (result.publishedVersion == null || !result.layout) throw Error('此布局尚未发布正式版本');
      const next = validateLayout(result.layout);
      if (next.layoutCode !== code() || next.layoutId !== api.model().layoutId) throw Error('正式布局身份不匹配');
      if (!(await api.replace(next))) return false;
      identities = new Map(next.racks.flatMap(r => r.slots).map(s => [s.id, s.code]));
      publishedCodes = new Set(identities.values());
      state.identityVerified = true;
      state.publishedVersion = result.publishedVersion;
      state.draftRevision = null;
      state.basedOnPublishedVersion = result.publishedVersion;
      synced = null;
      pendingPublication = null;
      state.serverDirty = true;
      state.status = 'published-view';
      state.error = null;
      await checkpoint();
      notify();
      return true;
    });
  }
  return {
    state,
    initialize,
    save,
    loadDraft,
    publish,
    loadPublished,
    canRename,
    assertIdentity,
    changed() {
      state.serverDirty = synced !== JSON.stringify(api.model());
      notify();
    },
  };
}
