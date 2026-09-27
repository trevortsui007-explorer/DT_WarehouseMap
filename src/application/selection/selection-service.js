// Application 持有选择 ID 集合，渲染器只负责命中与手势，不拥有正式选择状态。
export function createSelectionService(api) {
  let ids = new Set();
  const objects = () => api.objects().filter(object => ids.has(object.id));
  // 过滤已不存在或当前不可选的 ID，并同步主选对象；redraw=false 供组合操作统一刷新。
  function set(next, redraw = true) {
    ids = new Set(next.filter(id => api.objects().some(object => object.id === id)));
    api.primary(objects().at(-1)?.id || null);
    if (redraw) api.render();
  }
  // 普通点击替换选择，Shift 点击切换该对象；展开 Set 得到传给 set 的 ID 数组。
  function select(id, event) {
    const next = new Set(event?.shiftKey ? ids : []);
    if (event?.shiftKey && next.has(id)) next.delete(id);
    else next.add(id);
    set([...next]);
  }
  return {
    get ids() {
      return ids;
    },
    objects,
    set,
    select,
    // 模型或筛选变化后清除失效选择，不主动触发重绘。
    prune() {
      ids = new Set([...ids].filter(id => api.objects().some(object => object.id === id)));
    },
  };
}
