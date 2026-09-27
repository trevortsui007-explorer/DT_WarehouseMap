import { validateLayout, parseLayout } from '../../core/model/layout-validation.js';
export { validateLayout, parseLayout, summary } from '../../core/model/layout-validation.js';
import { spatialWarnings } from '../../core/spatial/spatial.js';
export const STORE_KEY = 'warehouse-layout-library-v1';
const fail = message => {
  throw Error(message);
};
// 旧版本同步存储实现，供兼容检查使用；不要从新的业务流程重新接入此存储。
export function createLayoutStore(storage) {
  // 读取旧布局库并检查封装格式；解析失败交给调用方处理。
  function read() {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.format !== 1 || !Array.isArray(data.history)) fail('本机布局库格式异常，请导入备份恢复');
    validateLayout(data.current);
    return data;
  }
  // 优先加载布局库，否则按新到旧顺序尝试历史单布局键。
  function load() {
    const data = read();
    if (data) return { model: validateLayout(data.current), savedAt: data.savedAt };
    for (const key of ['warehouse-layout-v3', 'warehouse-layout-v2', 'warehouse-layout-v1']) {
      const raw = storage.getItem(key);
      if (raw) return { model: parseLayout(raw), savedAt: null };
    }
    return null;
  }
  // 先在内存构造完整旧版数据与受限历史，再一次 setItem；写入失败不修改原存储值。
  function save(model, label = '自动备份', before) {
    const current = validateLayout(model),
      old = read();
    let history = old?.history || [];
    const snapshot = (m, title) => ({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label: title,
      model: structuredClone(m),
    });
    if (before) history = [snapshot(validateLayout(before), '替换前备份'), ...history];
    else if (old && JSON.stringify(old.current) !== JSON.stringify(current))
      history = [snapshot(old.current, '上次保存'), ...history];
    history = [snapshot(current, label), ...history].slice(0, 20);
    const data = { format: 1, savedAt: new Date().toISOString(), current, history };
    while (JSON.stringify(data).length > 1400000 && history.length > 2) history.pop();
    if (JSON.stringify(data).length > 1800000) fail('布局与备份超过本机存储预算，请先导出 JSON 备份');
    storage.setItem(STORE_KEY, JSON.stringify(data));
    return data;
  }
  return { load, save, history: () => read()?.history || [], warnings: spatialWarnings };
}
