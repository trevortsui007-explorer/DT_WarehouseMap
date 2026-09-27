const KEYS = new Set(['theme', 'sidebarWidth', 'lastTab', 'lastTool', 'lastLayoutCode', 'zoom', 'pan']);
// 只允许白名单内的轻量界面偏好进入 localStorage，业务草稿不属于此仓库。
export function createPreferenceRepository(storage = window.localStorage) {
  const key = name => {
    if (!KEYS.has(name)) throw Error('不支持的偏好键');
    return 'wms-map.preference.' + name;
  };
  return {
    get(name) {
      const value = storage.getItem(key(name));
      return value === null ? null : JSON.parse(value);
    },
    set(name, value) {
      storage.setItem(key(name), JSON.stringify(value));
    },
  };
}
