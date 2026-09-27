const statusLabels = new Set(['HOLD', 'WAITING', 'URGENT']);
// 校验物理区域与虚拟库位的一对多绑定；停用绑定仍占用编码，避免重新启用时产生歧义。
export function validateAreaBindings(layout) {
  if (!Array.isArray(layout.areaBindings)) throw Error('areaBindings 必须为数组');
  const areas = new Set(layout.areas.map(area => area.id));
  const ids = new Set(),
    codes = new Set();
  for (const binding of layout.areaBindings) {
    if (!binding || typeof binding !== 'object') throw Error('区域绑定无效');
    for (const key of ['id', 'areaId', 'virtualLocationCode', 'displayName', 'purpose']) {
      if (
        typeof binding[key] !== 'string' ||
        !binding[key].trim() ||
        binding[key] !== binding[key].trim() ||
        binding[key].length > 150
      )
        throw Error('区域绑定字段无效：' + key);
    }
    if (!areas.has(binding.areaId)) throw Error('区域绑定必须指向存在的 Physical Area');
    if (ids.has(binding.id)) throw Error('Binding ID 重复');
    if (codes.has(binding.virtualLocationCode)) throw Error('Virtual Location 在当前布局中只能绑定一个 Physical Area');
    if (typeof binding.isActive !== 'boolean') throw Error('绑定 isActive 必须为布尔值');
    if (['displayPriority', 'displayOrder', 'hiddenByDefault'].some(key => key in binding))
      throw Error('区域绑定不支持显示优先级或隐藏规则');
    if (statusLabels.has(binding.virtualLocationCode.toUpperCase()) || statusLabels.has(binding.purpose.toUpperCase()))
      throw Error('HOLD / WAITING / URGENT 是状态，不是 Virtual Location');
    ids.add(binding.id);
    codes.add(binding.virtualLocationCode);
  }
}

// 返回全部启用绑定；按 ID 排序只保证渲染稳定，不代表业务优先级。
export function activeAreaBindings(layout, areaId) {
  return (layout.areaBindings || [])
    .filter(binding => binding.areaId === areaId && binding.isActive)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Local coordinates only. Deterministic equal visual sections, never physical geometry edits.
// 沿较长轴等分局部范围，长宽相等时沿宽度；结果仅供显示，不写回物理区域。
export function equalAreaSections(area, bindings) {
  return bindings.map((binding, index) =>
    area.width >= area.depth
      ? {
          binding,
          x: (area.width * index) / bindings.length,
          y: 0,
          width: area.width / bindings.length,
          depth: area.depth,
        }
      : {
          binding,
          x: 0,
          y: (area.depth * index) / bindings.length,
          width: area.width,
          depth: area.depth / bindings.length,
        }
  );
}
