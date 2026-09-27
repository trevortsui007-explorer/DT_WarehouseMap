import { validateLayout } from '../../../../core/model/layout-validation.js';

// 在 Dexie 升级事务内迁移草稿和快照内容；校验失败使整个升级回滚，原始归档仍保留。
export async function migrateWorkspaceV2(transaction) {
  await transaction
    .table('drafts')
    .toCollection()
    .modify(row => {
      row.data = validateLayout(row.data);
      row.schemaVersion = row.data.schemaVersion;
    });
  await transaction
    .table('snapshots')
    .toCollection()
    .modify(row => {
      row.data = validateLayout(row.data);
    });
  // meta's legacy raw archive is retained for recovery only; never used as WMS Runtime.
}
