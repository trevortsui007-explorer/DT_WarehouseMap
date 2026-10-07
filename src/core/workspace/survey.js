import { spaces, doorOwner } from '../spatial/rooms.js';
import { isFixture } from '../spatial/fixtures.js';
import { meters } from './calibration.js';
export const SURVEY_LABELS = { width: '宽', depth: '深', height: '高', levelHeight: '层高', offset: '沿墙偏移' };
// 按稳定对象身份查找，删除后记录仍保留，撤销恢复后自然重新关联。
export function surveyTarget(layout, id) {
  const owner = doorOwner(layout, id);
  const object =
    owner?.doors.find(door => door.id === id) ||
    [...layout.racks, ...layout.areas, ...(layout.fixtures || []), ...spaces(layout)].find(item => item.id === id);
  if (!object) return null;
  const kind = owner ? 'door' : object.cols ? 'rack' : isFixture(object) ? 'fixture' : 'space';
  const keys =
    kind === 'door'
      ? ['width', 'offset']
      : kind === 'rack'
        ? ['width', 'depth', 'levelHeight']
        : kind === 'fixture'
          ? ['width', 'depth', 'height']
          : ['width', 'depth'];
  return { object, kind, keys, owner };
}
export function geometryStamp(target) {
  const { object, owner } = target;
  return JSON.stringify([
    object.x,
    object.y,
    object.rotation,
    object.side,
    object.cols,
    object.levels,
    ...target.keys.map(key => object[key]),
    owner?.id,
    owner?.x,
    owner?.y,
    owner?.width,
    owner?.depth,
  ]);
}
export function surveyStatus(record, target) {
  if (!record) return '未测量';
  if (record.needsReview || (record.appliedGeometry && record.appliedGeometry !== geometryStamp(target)))
    return '待复核';
  return record.appliedGeometry ? '已应用' : '已记录待应用';
}
export function createSurvey(target, input) {
  const values = {};
  for (const key of target.keys) {
    const value = meters(input.values[key], input.unit);
    if (value < 0 || (key !== 'offset' && value === 0) || value > 400)
      throw Error('实测尺寸需为有效正数（偏移可为零），且不超过 400 米');
    values[key] = value;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || Number.isNaN(Date.parse(input.date)))
    throw Error('请填写测量日期');
  return {
    objectId: target.object.id,
    kind: target.kind,
    date: input.date,
    notes: String(input.notes || '').slice(0, 4000),
    values,
    needsReview: false,
    appliedGeometry: null,
  };
}
