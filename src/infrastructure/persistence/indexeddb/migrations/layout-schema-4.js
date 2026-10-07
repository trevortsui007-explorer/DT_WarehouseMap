import { validateLayout } from '../../../../core/model/layout-validation.js';

// JSON content migration only. IndexedDB tables/indexes and database version stay unchanged.
// 仅迁移旧版 JSON 内容：补 areaBindings 和 rooms、校验并剥离运行态；无需提升数据库表结构版本。
export async function migrateLayoutSchema4(database) {
  await database.transaction('rw', database.drafts, database.snapshots, async () => {
    for (const table of [database.drafts, database.snapshots]) {
      await table
        .toCollection()
        .filter(row => row.data?.schemaVersion < 6)
        .modify(row => {
          row.data = validateLayout(row.data);
          if (table.name === 'drafts') row.schemaVersion = row.data.schemaVersion;
        });
    }
  });
}
