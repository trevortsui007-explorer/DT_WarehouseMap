import { activeAreaBindings } from '../../core/spatial/area-bindings.js';

// 组合全部启用绑定与运行态，返回临时展示数据，不把汇总写回 Layout。
export function resolvePhysicalArea(layout, runtime, areaId) {
  const rows = activeAreaBindings(layout, areaId).map(binding => ({
    ...binding,
    summary: runtime.virtualAreas?.[binding.virtualLocationCode] || null,
  }));
  // HU 同时只能属于一个虚拟库位，因此数量直接相加；任一绑定缺状态则总数未知，空绑定集合为零。
  const totals = {};
  for (const key of ['huCount', 'palletCount', 'outerBoxCount'])
    totals[key] = rows.every(row => row.summary) ? rows.reduce((sum, row) => sum + row.summary[key], 0) : null;
  return { areaId, rows, totals };
}

// 从变化的虚拟库位反查启用绑定，仅刷新受影响的物理区域。
export function affectedPhysicalAreas(layout, virtualLocationCode) {
  return (layout.areaBindings || [])
    .filter(binding => binding.isActive && binding.virtualLocationCode === virtualLocationCode)
    .map(binding => binding.areaId);
}
