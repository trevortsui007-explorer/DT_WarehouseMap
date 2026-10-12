import { validateLayout } from '../../core/model/layout-validation.js';

// 上传只初始化新布局；绝不借同名编码覆盖现有草稿。请求前持久化意图，供断线后恢复。
export async function uploadWorkspace({ catalog, remote, scope, id, code }) {
  if (!remote) throw Error('尚未配置地图服务，请先启动后端并配置前端代理');
  code = String(code || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(code))
    throw Error('布局编码须为 1–64 位英文字母、数字、下划线、短横线或点，并以字母或数字开头');
  const info = await catalog.info(id);
  if (info.remoteEligible) throw Error('此方案已连接服务器，请使用保存服务器草稿');
  const repo = catalog.repository(id);
  const pendingKey = 'upload:' + scope;
  let pending = await repo.getRemoteState(pendingKey);
  if (pending && pending.code !== code) throw Error('上一次上传结果尚未确认，请先使用编码 ' + pending.code + ' 重试');
  const published = await remote.getPublishedLayout(code);
  if (published.layoutCode !== code) throw Error('服务器返回了不同布局编码');
  let draft;
  if (published.exists !== false) {
    if (!pending?.attempted) throw Error('布局编码已存在，请使用新编码，或从布局管理打开服务器布局');
    // 仅恢复本次上传留下的原始快照；同名或同 ID 都不足以证明服务器记录属于本次请求。
    draft = await remote.getServerDraft(code);
    if (
      draft.layoutCode !== code ||
      draft.draftRevision !== 0 ||
      draft.basedOnPublishedVersion !== null ||
      JSON.stringify(validateLayout(draft.layout)) !== JSON.stringify(pending.layout)
    ) {
      await repo.setRemoteState(pendingKey, null);
      throw Error('服务器内容与待上传快照不一致，已保留本机方案；请从布局管理核对服务器草稿');
    }
  } else {
    if (!pending) {
      const saved = await repo.load();
      if (!saved) throw Error('本机方案未保存');
      const layout = validateLayout({ ...saved.model, layoutCode: code });
      pending = { code, layout, attempted: true };
      await repo.setRemoteState(pendingKey, pending);
    }
    try {
      draft = await remote.initializeLayout(code, pending.layout);
    } catch (error) {
      // 明确拒绝的请求没有提交，允许修正数据或选择新编码；超时/断线保留原意图。
      if ([400, 401, 403, 409, 413, 422].includes(error.status)) await repo.setRemoteState(pendingKey, null);
      throw error;
    }
    if (draft.layoutCode !== code || draft.draftRevision !== 0 || draft.basedOnPublishedVersion !== null)
      throw Error('初始化响应无效，请使用相同编码重试确认');
  }
  await catalog.connectRemote(id, scope, pending.layout, draft, pendingKey);
  return id;
}
