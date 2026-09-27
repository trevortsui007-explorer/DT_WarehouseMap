export const DATABASE_NAME = 'wms-map-workspace';
export const DATABASE_VERSION = 2;
export const LAYOUT_ID = 'main';
export const LAYOUT_CODE = 'MAIN';
// Dexie 索引声明：& 表示唯一键；草稿、历史索引、快照正文与迁移元数据分表保存。
export const STORES_V1 = {
  drafts: '&layoutId,updatedAt',
  history: '&id,layoutId,order,snapshotId',
  snapshots: '&id,layoutId,kind',
  meta: '&key',
};

// 包装单工作区草稿：存储键仍为 main，实际业务身份在 data 内；baseVersion 为空，不虚构服务器版本。
export function draftRecord(data, updatedAt = new Date().toISOString()) {
  return {
    layoutId: LAYOUT_ID,
    layoutCode: LAYOUT_CODE,
    schemaVersion: data.schemaVersion,
    baseVersion: null,
    dirty: true,
    updatedAt,
    data,
  };
}
