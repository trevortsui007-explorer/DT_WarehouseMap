import { parseLayout, summary } from '../../core/model/layout-validation.js';
import { spatialWarnings } from '../../core/spatial/spatial.js';

// 协调本地自动保存、导入与恢复；通过 Repository 工作，不感知底层存储技术。
export function createLayoutManager(api) {
  let timer,
    pending = null,
    pendingLabel = '',
    pendingProject = null,
    revision = 0,
    savedRevision = 0,
    fileSequence = 0,
    disposed = false,
    applying = false;
  let queue = Promise.resolve();
  const state = {
    layoutOpen: false,
    layoutError: '',
    history: [],
    canApply: false,
    importSummary: '支持本编辑器导出的布局。保留货位身份与编码；旧演示库存不会载入运行态。',
  };
  const publish = () => {
    if (!disposed) api.patch({ layout: { ...state } });
  };
  const status = (saveStatus, saveState) => {
    if (!disposed) api.patch({ saveStatus, saveState });
  };
  // 串联 Promise 保证写入顺序；内部吞掉拒绝仅为维持队列，返回的 result 仍保留本次错误。
  const enqueue = task => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  // 立即捕获布局副本和修订号，再排队保存；旧写入完成不能把较新的编辑误报为已保存。
  function save(label = '手动保存') {
    clearTimeout(timer);
    const version = revision,
      snapshot = structuredClone(api.model());
    return enqueue(async () => {
      status('saving', '正在保存到本机…');
      try {
        await api.store.save(snapshot, label);
        savedRevision = version;
        if (savedRevision === revision) status('saved', '已保存到本机 · ' + new Date().toLocaleTimeString());
        else status('dirty', '待自动备份');
        return true;
      } catch (error) {
        status('failed', '本机保存失败，请重试或导出备份');
        api.toast(error.message);
        return false;
      }
    });
  }
  // 只在有意义的布局变更后递增修订号；1200ms 防抖合并连续编辑，不用于 Runtime 更新。
  function changed() {
    revision++;
    status('dirty', '待自动备份');
    clearTimeout(timer);
    timer = setTimeout(() => void save('自动备份'), 1200);
  }
  // 先等待已有写入，再保存尚未落盘的修订；调用方可据返回值决定是否离开编辑模式。
  async function flush() {
    await queue;
    return savedRevision === revision || (await save('自动备份'));
  }
  // 读取本机历史并转换为界面摘要，失败保留错误提示。
  async function populate() {
    try {
      state.history = (await api.store.history()).map(item => ({
        id: item.id,
        label: item.label,
        at: item.at,
        summary: summary(item.model),
      }));
    } catch (error) {
      state.layoutError = error.message;
    }
    publish();
  }
  // 解析和验证待导入布局，只暂存候选模型，尚不替换当前工作。
  function stage(text, label) {
    pending = null;
    pendingProject = null;
    state.canApply = false;
    try {
      const model = parseLayout(text),
        warnings = spatialWarnings(model);
      api.validate?.(model);
      pending = model;
      pendingLabel = label;
      state.importSummary = `${label}：${summary(model)}。将替换当前完整布局；先备份当前内容。${warnings.length ? '存在 ' + warnings.length + ' 项空间提示，导入后请检查。' : ''}`;
      state.canApply = api.canEdit();
    } catch (error) {
      state.importSummary = '校验失败：' + error.message;
    }
    publish();
  }
  // 打开管理窗口并刷新本机历史列表。
  async function open() {
    state.layoutError = '';
    state.layoutOpen = true;
    state.canApply = !!pending && api.canEdit();
    await populate();
  }
  function close() {
    state.layoutOpen = false;
    publish();
  }
  // 异步读取 JSON；fileSequence 使较早选择文件的迟到结果失效。
  async function importFile(file) {
    if (!file || !api.canEdit()) return;
    const sequence = ++fileSequence;
    pending = null;
    state.canApply = false;
    if (file.size > 5 * 1024 * 1024) {
      state.importSummary = '校验失败：文件不能超过 5 MB';
      publish();
      return;
    }
    publish();
    try {
      const text = await file.text();
      if (!disposed && sequence === fileSequence) stage(text, file.name);
    } catch (error) {
      if (!disposed && sequence === fileSequence) {
        state.importSummary = '读取失败：' + error.message;
        publish();
      }
    }
  }
  // 按历史 ID 读取完整快照并进入待应用状态，复用导入验证流程。
  async function stageHistory(id) {
    if (!api.canEdit()) return;
    const sequence = ++fileSequence;
    pending = null;
    state.canApply = false;
    publish();
    try {
      const item = (await api.store.history()).find(entry => entry.id === id);
      if (!item) throw Error('该版本已不在历史记录中');
      if (!disposed && sequence === fileSequence)
        stage(JSON.stringify(item.model), '恢复版本 · ' + new Date(item.at).toLocaleString());
    } catch (error) {
      api.toast(error.message);
    }
  }
  // 先在一次存储操作中保存新布局和替换前备份，成功后才切换内存；失败保留当前布局。
  async function apply() {
    if (disposed || !api.canEdit() || !pending || applying) return false;
    try {
      api.validate?.(pending);
    } catch (error) {
      state.layoutError = error.message;
      publish();
      return false;
    }
    applying = true;
    api.setBusy?.(true);
    clearTimeout(timer);
    ++fileSequence;
    const next = parseLayout(JSON.stringify(pending)),
      label = pendingLabel,
      before = structuredClone(api.model());
    return enqueue(async () => {
      status('saving', '正在保存到本机…');
      try {
        await api.beforeReplace?.();
        if (pendingProject) await api.store.replaceProject({ ...pendingProject, layout: next }, before);
        else await api.store.save(next, label, before);
        if (!disposed) {
          api.replace(next);
          await api.afterReplace?.();
        }
        savedRevision = revision;
        pending = null;
        state.canApply = false;
        state.layoutError = '';
        state.importSummary = '已应用，并保留替换前备份。';
        status('saved', '已保存到本机 · ' + new Date().toLocaleTimeString());
        await populate();
        api.toast('布局已应用，可从历史版本恢复替换前内容');
        return true;
      } catch (error) {
        state.layoutError = '未替换布局：' + error.message;
        status('failed', '本机保存失败，请重试或导出备份');
        publish();
        return false;
      } finally {
        applying = false;
        api.setBusy?.(false);
      }
    });
  }
  // 卸载事件不能保证异步写入完成；有未保存编辑时同时请求浏览器提示并尝试 flush。
  window.addEventListener(
    'beforeunload',
    event => {
      if (savedRevision !== revision || applying) {
        event.preventDefault();
        event.returnValue = '';
        void flush();
      }
    },
    { signal: api.signal }
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden' && savedRevision !== revision) void flush();
    },
    { signal: api.signal }
  );
  return {
    changed,
    save,
    flush,
    open,
    close,
    importFile,
    apply,
    stageHistory,
    async replaceProject(backup) {
      if (disposed || !api.canEdit() || applying) return false;
      stage(JSON.stringify(backup.layout), '导入项目备份');
      if (!pending) throw Error(state.importSummary);
      pendingProject = backup;
      return apply();
    },
    // 远程载入也经过候选验证和替换前备份，避免直接覆盖本地用户工作。
    async replaceFromRemote(model) {
      if (disposed) return false;
      stage(JSON.stringify(model), '载入服务器草稿');
      if (!pending) return false;
      return apply();
    },
    // 停止计时并使旧文件读取失效，最后等待尚未保存的修改完成。
    async dispose() {
      disposed = true;
      clearTimeout(timer);
      ++fileSequence;
      await flush();
    },
  };
}
