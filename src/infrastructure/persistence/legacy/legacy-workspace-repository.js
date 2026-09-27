import { createLayoutStore } from '../layout-store.js';

/** Temporary Phase 6 implementation, retained for contract compatibility tests. */
// 旧 localStorage 适配器仅保留用于契约兼容测试，生产启动使用 IndexedDB 实现。
export function createLegacyWorkspaceRepository(storage) {
  const store = createLayoutStore(storage);
  return {
    async load() {
      return store.load();
    },
    async save(...args) {
      return store.save(...args);
    },
    async history() {
      return store.history();
    },
  };
}
