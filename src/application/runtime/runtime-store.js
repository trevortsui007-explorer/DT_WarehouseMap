import { validateSnapshot, validateLocation, validateVirtualArea } from '../../core/runtime/runtime.js';

// 独立内存运行态，初始为 loading；通过 changed 通知渲染，不接入布局历史与持久化。
export function createRuntimeStore(warehouseCode = null, changed = () => {}) {
  const state = {
    warehouseCode,
    status: 'loading',
    sequence: null,
    lastSnapshotAt: null,
    lastEventAt: null,
    error: null,
    locations: Object.create(null),
    virtualAreas: Object.create(null),
  };
  // 更新加载/连接提示，保留已有数据供 stale 状态查看。
  function status(value, error = null) {
    state.status = value;
    state.error = error;
    changed(null);
  }
  // 先完整验证再替换两个运行态字典；落后于当前序号的快照不能覆盖新数据。
  function snapshot(value) {
    const next = validateSnapshot(value, state.warehouseCode);
    if (state.sequence !== null && next.sequence < state.sequence) throw Error('服务器快照序号落后，请重试');
    state.locations = next.locations;
    state.virtualAreas = next.virtualAreas;
    state.sequence = next.sequence;
    state.lastSnapshotAt = next.generatedAt;
    status('ready');
  }
  // 两类事件共享仓库级连续序号：旧事件忽略、缺口交给会话重同步，绝不猜测遗漏状态。
  function delta(event) {
    if (event?.warehouseCode !== state.warehouseCode) return 'foreign';
    if (
      !['LocationRuntimeChanged', 'VirtualAreaRuntimeChanged'].includes(event.eventType) ||
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 0
    )
      throw Error('运行态事件契约无效');
    if (state.sequence === null) return 'gap';
    if (event.sequence <= state.sequence) return 'stale';
    if (event.sequence !== state.sequence + 1) return 'gap';
    if (event.eventType === 'VirtualAreaRuntimeChanged') {
      const item = validateVirtualArea(event.state, event.virtualLocationCode);
      state.virtualAreas[event.virtualLocationCode] = item;
      state.sequence = event.sequence;
      state.lastEventAt = item.updatedAt;
      changed(event.virtualLocationCode, 'virtualArea');
      return 'applied';
    }
    const item = validateLocation(event.state, event.locationCode);
    state.locations[event.locationCode] = item;
    state.sequence = event.sequence;
    state.lastEventAt = item.updatedAt;
    changed(event.locationCode);
    return 'applied';
  }
  return { state, status, snapshot, delta };
}
