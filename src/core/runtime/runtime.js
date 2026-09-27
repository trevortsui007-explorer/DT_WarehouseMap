// 按业务编码查找货位状态；缺失时返回 null，不从布局旧 cartons 推断。
export function locationRuntime(runtime, code) {
  return runtime?.locations?.[code] || null;
}

// ?? 仅为空值提供默认值，因此服务器返回的 0 会保留；null 表示尚不知道数量。
export function runtimeCount(runtime, code) {
  return locationRuntime(runtime, code)?.outerBoxCount ?? null;
}

// 颜色优先级为未知、锁定、有货、空闲；聚合货位中只要有未知状态就不显示确定库存色。
export function runtimeColor(runtime, codes, occupied = '#22a694', empty = '#dce6ec') {
  const locations = codes.map(code => locationRuntime(runtime, code));
  if (!locations.length || locations.some(item => !item || item.occupancyStatus === 'UNKNOWN')) return '#edf0f2';
  if (locations.some(item => item.lockStatus !== 'NORMAL')) return '#f7d9bc';
  return locations.some(item => item.occupancyStatus === 'OCCUPIED') ? occupied : empty;
}

// 验证单货位状态并挑选正式字段；数量必须为非负安全整数，拒绝隐式字符串转换。
export function validateLocation(value, code = value?.locationCode) {
  if (!value || typeof code !== 'string' || !code.trim()) throw Error('运行态货位编码无效');
  for (const key of ['huCount', 'outerBoxCount']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw Error('运行态数量无效');
  }
  if (!['EMPTY', 'OCCUPIED', 'UNKNOWN'].includes(value.occupancyStatus)) throw Error('运行态占用状态无效');
  if (typeof value.lockStatus !== 'string' || !value.lockStatus) throw Error('运行态锁定状态无效');
  return {
    locationCode: code,
    huCount: value.huCount,
    outerBoxCount: value.outerBoxCount,
    skuSummary: value.skuSummary ?? null,
    occupancyStatus: value.occupancyStatus,
    lockStatus: value.lockStatus,
    taskStatus: value.taskStatus ?? null,
    updatedAt: value.updatedAt ?? null,
    version: value.version ?? null,
  };
}

// 校验仓库、序号及完整快照，再统一为编码索引对象；允许旧响应省略 virtualAreas。
export function validateSnapshot(snapshot, warehouseCode) {
  if (
    !snapshot ||
    snapshot.warehouseCode !== warehouseCode ||
    !warehouseCode ||
    !Number.isSafeInteger(snapshot.sequence) ||
    snapshot.sequence < 0 ||
    !snapshot.locations ||
    typeof snapshot.locations !== 'object' ||
    !Number.isFinite(Date.parse(snapshot.generatedAt))
  )
    throw Error('运行态快照契约无效');
  // 无原型字典避免业务编码与继承属性重名；Object.hasOwn 只检查实际收到的键。
  const locations = Object.create(null);
  const values = Array.isArray(snapshot.locations)
    ? snapshot.locations
    : Object.entries(snapshot.locations).map(([code, value]) => {
        if (value.locationCode && value.locationCode !== code) throw Error('快照货位键与编码不一致');
        return { ...value, locationCode: code };
      });
  for (const value of values) {
    const item = validateLocation(value);
    if (Object.hasOwn(locations, item.locationCode)) throw Error('快照货位重复');
    locations[item.locationCode] = item;
  }
  const virtualAreas = Object.create(null);
  if (
    snapshot.virtualAreas !== undefined &&
    (!snapshot.virtualAreas || typeof snapshot.virtualAreas !== 'object' || Array.isArray(snapshot.virtualAreas))
  )
    throw Error('virtualAreas 必须为编码索引对象');
  for (const [code, value] of Object.entries(snapshot.virtualAreas || {}))
    virtualAreas[code] = validateVirtualArea(value, code);
  return { ...snapshot, locations, virtualAreas };
}

// 验证虚拟库位的摘要数量；这里只接收汇总，不修改或推断 HU 的实际归属。
export function validateVirtualArea(value, code) {
  if (!value || typeof code !== 'string' || !code.trim()) throw Error('Virtual Location 编码无效');
  for (const key of ['huCount', 'palletCount', 'outerBoxCount'])
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw Error('Virtual Area 数量无效');
  return {
    huCount: value.huCount,
    palletCount: value.palletCount,
    outerBoxCount: value.outerBoxCount,
    updatedAt: value.updatedAt ?? null,
  };
}
