// 会话 Undo/Redo 只保存布局，与 IndexedDB 恢复快照及服务器发布版本相互独立。
export function createSessionHistory(api) {
  const undo = [],
    redo = [];
  // 仅实际变化才入栈，保留最近 50 次；新编辑清空 redo，并触发布局变更通知。
  function record(before, intent = 'EditLayout') {
    if (before === JSON.stringify(api.model())) return;
    undo.push({ before, intent });
    if (undo.length > 50) undo.shift();
    redo.length = 0;
    api.changed();
  }
  // 命令事务边界：备份 → 修改 → 验证 → 记录；失败时恢复命令前布局，不留下半次编辑。
  function execute(intent, mutate) {
    if (!api.canEdit()) {
      api.toast('查看模式不能修改布局，请切换到编辑模式');
      return false;
    }
    api.beforeCommand();
    const before = JSON.stringify(api.model());
    try {
      mutate();
      api.validate?.(api.model());
      record(before, intent);
      api.render();
      return true;
    } catch (error) {
      api.replace(JSON.parse(before));
      api.render();
      api.toast(error.message);
      return false;
    }
  }
  // 先验证目标历史，再交换两个栈；恢复后的布局仍需触发本地保存。
  function restore(from, to) {
    if (!api.canEdit()) return;
    api.beforeCommand();
    if (!from.length) return;
    const entry = from[from.length - 1];
    try {
      api.validate?.(JSON.parse(entry.before));
    } catch (error) {
      api.toast(error.message);
      return;
    }
    from.pop();
    to.push({ before: JSON.stringify(api.model()), intent: entry.intent });
    api.replace(JSON.parse(entry.before));
    api.afterRestore();
    api.changed();
    api.render();
  }
  return {
    execute,
    record,
    undo: () => restore(undo, redo),
    redo: () => restore(redo, undo),
    canUndo: () => undo.length > 0,
    canRedo: () => redo.length > 0,
    clear() {
      undo.length = 0;
      redo.length = 0;
    },
  };
}
