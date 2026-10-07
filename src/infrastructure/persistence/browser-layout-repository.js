import { createWorkspaceCatalog } from './indexeddb/workspace-catalog.js';
import { createWorkspaceDatabase } from './indexeddb/db.js';
import { createIndexedDbWorkspaceRepository } from './indexeddb/workspace-repository.js';
import { migrateLegacyStorage } from './legacy/localstorage-migration.js';
// 浏览器存储组装入口：正常业务使用 IndexedDB；localStorage 仅在初始化时读取并迁移旧数据。
export function createBrowserLayoutRepository() {
  const database = createWorkspaceDatabase();
  const repository = createIndexedDbWorkspaceRepository(database, {
    initialize: () => migrateLegacyStorage(database, window.localStorage),
  });
  repository.catalog = createWorkspaceCatalog(database, repository);
  return repository;
}
