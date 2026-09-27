import { parseLayout, validateLayout } from '../../../core/model/layout-validation.js';
import { LAYOUT_ID, draftRecord } from '../indexeddb/schema.js';

export const LEGACY_KEYS = [
  'warehouse-layout-library-v1',
  'warehouse-layout-v3',
  'warehouse-layout-v2',
  'warehouse-layout-v1',
];
export const MIGRATION_KEY = 'legacy-localstorage-v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 按已识别旧键的优先顺序解析并校验；稳定记录 ID 使同一来源重试不会重复生成历史。
function decode(sources) {
  const snapshots = [],
    recent = [];
  let current = null,
    savedAt = null;
  for (const [sourceIndex, source] of sources.entries()) {
    const envelope = source.key === LEGACY_KEYS[0] ? JSON.parse(source.raw) : null;
    if (envelope && (envelope.format !== 1 || !Array.isArray(envelope.history))) throw Error('旧本机布局库格式异常');
    const model = envelope ? validateLayout(envelope.current) : parseLayout(source.raw);
    const at = envelope?.savedAt || new Date(0).toISOString();
    const currentId = `legacy:${source.key}:current`;
    snapshots.push({ id: currentId, layoutId: LAYOUT_ID, kind: 'legacy', at, label: source.key, data: model });
    if (sourceIndex === 0) {
      current = model;
      savedAt = at;
    }
    for (const [index, entry] of (envelope?.history || []).entries()) {
      if (typeof entry.id !== 'string' || typeof entry.at !== 'string' || typeof entry.label !== 'string')
        throw Error('旧历史记录元数据无效');
      const id = `legacy:${source.key}:history:${index}:${entry.id}`;
      const data = validateLayout(entry.model);
      snapshots.push({ id, layoutId: LAYOUT_ID, kind: 'legacy', at: entry.at, label: entry.label, data });
      if (sourceIndex === 0)
        recent.push({ id, layoutId: LAYOUT_ID, order: index, snapshotId: id, at: entry.at, label: entry.label });
    }
    if (sourceIndex === 0 && !recent.length)
      recent.push({ id: currentId, layoutId: LAYOUT_ID, order: 0, snapshotId: currentId, at, label: '旧布局迁移' });
  }
  return { snapshots, recent, current, savedAt };
}

/** Read-only detection until IndexedDB transaction + read-back verification have succeeded. */
// 迁移顺序：检测 → 解析 → 事务写入 → 独立读回验证 → 成功标记 → 清理已识别且未变化的旧键。
export async function migrateLegacyStorage(database, storage) {
  const detected = LEGACY_KEYS.map(key => ({ key, raw: storage.getItem(key) })).filter(
    source => source.raw !== null && source.raw !== undefined
  );
  let marker = await database.meta.get(MIGRATION_KEY);
  if (!detected.length && !marker) return { migrated: false };
  if (marker) {
    for (const source of detected) {
      const old = marker.sources.find(item => item.key === source.key);
      if (!old || old.raw !== source.raw)
        throw Error('迁移期间旧布局发生变化，原数据已保留；请关闭旧版编辑器后检查备份再重试');
    }
  }
  const sources = marker?.sources || detected;
  const decoded = decode(sources);
  if (!marker) {
    marker = await database.transaction(
      'rw',
      database.drafts,
      database.history,
      database.snapshots,
      database.meta,
      async () => {
        const concurrent = await database.meta.get(MIGRATION_KEY);
        if (concurrent) {
          if (!same(concurrent.sources, sources)) throw Error('另一个页面正在迁移不同旧数据，请关闭其他页面后重试');
          return concurrent;
        }
        const existing = await database.drafts.get(LAYOUT_ID);
        await database.snapshots.bulkPut(decoded.snapshots);
        if (!existing) {
          await database.drafts.put(draftRecord(decoded.current, decoded.savedAt));
          await database.history.bulkPut(decoded.recent);
        }
        // 先写 pending-verification，不能在未读回验证前把迁移标记为成功。
        const pending = { key: MIGRATION_KEY, status: 'pending-verification', sources, installedDraft: !existing };
        await database.meta.put(pending);
        return pending;
      }
    );
  }
  // A separate read-back transaction verifies committed data before marking migration complete.
  await database.transaction('rw', database.drafts, database.history, database.snapshots, database.meta, async () => {
    for (const expected of decoded.snapshots) {
      const actual = await database.snapshots.get(expected.id);
      if (
        !actual ||
        !same(validateLayout(actual.data), expected.data) ||
        actual.label !== expected.label ||
        actual.at !== expected.at
      )
        throw Error('迁移读回校验失败，旧数据已保留，可重试');
    }
    const latest = await database.meta.get(MIGRATION_KEY);
    if (latest.status !== 'success' && latest.installedDraft) {
      const draft = await database.drafts.get(LAYOUT_ID);
      if (!draft || !same(validateLayout(draft.data), decoded.current))
        throw Error('迁移草稿读回校验失败，旧数据已保留');
      for (const row of decoded.recent) {
        if (!same(await database.history.get(row.id), row)) throw Error('迁移历史读回校验失败，旧数据已保留');
      }
    }
    await database.meta.put({
      ...latest,
      status: 'success',
      verifiedAt: latest.verifiedAt || new Date().toISOString(),
    });
  });
  // Only recognized business keys with unchanged contents may be removed. Preferences are untouched.
  // 只在验证成功后清理；遇到旧版页面并发改写即停止，未知键与偏好键不会删除。
  for (const source of sources) {
    const raw = storage.getItem(source.key);
    if (raw === null || raw === undefined) continue;
    if (raw !== source.raw) throw Error('旧布局在清理前发生变化，保留原数据，请关闭旧版编辑器后重试');
    storage.removeItem(source.key);
  }
  return { migrated: true };
}
