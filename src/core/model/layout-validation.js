import { validateAreaBindings } from '../spatial/area-bindings.js';
import { migrate, validate } from './model.js';
import { ensureSpatial, validateArea } from '../spatial/spatial.js';
import { validateDoors } from '../doors/doors.js';
const fail = message => {
  throw Error(message);
};
// 导入和持久化的统一校验入口：先克隆迁移，再检查对象身份、业务编码和空间字段，不修改输入。
export function validateLayout(input) {
  if (!input || typeof input !== 'object' || ![1, 2, 3, 4].includes(input.schemaVersion))
    fail('不支持的布局版本；仅支持本编辑器导出的 v1 / v2 / v3 / v4 布局');
  if (!Array.isArray(input.racks) || input.racks.length > 2000) fail('货架列表无效或超过 2000 个');
  JSON.stringify(input, (key, value) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('布局包含不支持的字段');
    return value;
  });
  const m = migrate(structuredClone(input));
  if (m.boundary) m.areas ??= [];
  else {
    if (m.areas?.length) fail('布局有区域但缺少仓库边界');
    ensureSpatial(m);
  }
  // Set 用于判重：对象 ID 跨类型唯一，货位业务编码在整个布局内唯一。
  const ids = new Set(),
    codes = new Set();
  let count = 0;
  const id = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(value) || ids.has(value))
      fail('对象 ID 无效或重复');
    ids.add(value);
  };
  const text = (s, label) => {
    if (typeof s !== 'string' || !s.trim() || s.length > 150) fail(`${label}为空或超过 150 字符`);
  };
  text(m.layoutId, '布局 ID');
  text(m.layoutCode, '布局编码');
  if (m.warehouseCode !== null) text(m.warehouseCode, 'WMS 仓库代码');
  if (m.floorNo !== null && !(typeof m.floorNo === 'string' || Number.isFinite(m.floorNo))) fail('楼层标识无效');
  for (const r of m.racks) {
    id(r.id);
    text(r.name, '货架名称');
    if (r.spaceId !== 'main' || !['FG01', 'FG02'].includes(r.fgCode)) fail('当前仅支持 main 空间及 FG01 / FG02');
    validate(r, m.racks);
    if (!Array.isArray(r.slots) || r.slots.length !== r.cols * r.levels) fail(`${r.name} 的货位数量与层列数不一致`);
    const cells = new Set();
    for (const s of r.slots) {
      if (++count > 20000) fail('货位数超过 20000 个');
      id(s.id);
      text(s.code, '货位编码');
      if (codes.has(s.code)) fail(`货位编码重复：${s.code}`);
      codes.add(s.code);
      if (
        !Number.isInteger(s.level) ||
        s.level < 1 ||
        s.level > r.levels ||
        !Number.isInteger(s.col) ||
        s.col < 1 ||
        s.col > r.cols
      )
        fail('货位层列位置无效');
      const key = `${s.level}:${s.col}`;
      if (cells.has(key)) fail('同一货架存在重复层列位置');
      cells.add(key);
    }
  }
  if (!Array.isArray(m.areas) || m.areas.length > 2000) fail('区域列表无效或超过 2000 个');
  for (const a of m.areas) {
    id(a.id);
    text(a.name, '区域名称');
    validateArea(a);
  }
  if (m.boundary.id !== 'boundary') fail('仓库边界标识必须为 boundary');
  id(m.boundary.id);
  text(m.boundary.name, '边界名称');
  validateArea(m.boundary, true);
  validateDoors(m.boundary);
  for (const d of m.boundary.doors || []) {
    id(d.id);
    text(d.name, '门名称');
  }
  validateAreaBindings(m);
  for (const binding of m.areaBindings) id(binding.id);
  return m;
}
// 先限制 UTF-8 字节大小，再解析及校验；只有完整成功后调用方才能替换当前布局。
export function parseLayout(text) {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) fail('布局文件不能超过 5 MB');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail('文件不是有效的 JSON');
  }
  return validateLayout(data);
}
// 生成布局结构摘要，只统计主数据，不混入库存或 HU 数量。
export function summary(m) {
  return `${m.racks.length} 个货架 · ${m.racks.reduce((n, r) => n + r.slots.length, 0)} 个货位 · ${m.areas.length} 个区域 · ${(m.boundary.doors || []).length} 个门`;
}
