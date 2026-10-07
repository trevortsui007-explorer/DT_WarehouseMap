import { migrateWorkspaceV2 } from './migrations/v2.js';
import Dexie from 'dexie';
import { DATABASE_NAME, STORES_V1, STORES_V3, STORES_V4 } from './schema.js';

// 显式声明数据库版本及升级步骤；这里的版本控制表结构/数据库升级，与 Layout JSON Schema 4 分开。
export function createWorkspaceDatabase(name = DATABASE_NAME, options) {
  const database = new Dexie(name, options);
  database.version(1).stores(STORES_V1);
  database.version(2).stores(STORES_V1).upgrade(migrateWorkspaceV2);
  // 新增独立本机资源和替换前项目恢复包，原表原样保留。
  database.version(3).stores(STORES_V3);
  database.version(4).stores(STORES_V4);
  return database;
}
