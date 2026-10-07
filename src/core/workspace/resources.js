import { workspaceName } from './projects.js';
import { validateLayout } from '../model/layout-validation.js';
// 独立资源契约：普通 Layout 和服务器 DTO 不携带这些本机数据。
export const emptyResources = () => ({ underlay: null, surveys: [] });
export function validateResources(input) {
  if (!input || !Array.isArray(input.surveys) || input.surveys.length > 20000) throw Error('实测记录列表无效');
  const surveys = input.surveys.map(record => {
    if (
      !record ||
      typeof record.objectId !== 'string' ||
      !['door', 'rack', 'fixture', 'space'].includes(record.kind) ||
      !record.values ||
      typeof record.values !== 'object'
    )
      throw Error('实测记录无效');
    const keys =
      record.kind === 'door'
        ? ['width', 'offset']
        : record.kind === 'rack'
          ? ['width', 'depth', 'levelHeight']
          : record.kind === 'fixture'
            ? ['width', 'depth', 'height']
            : ['width', 'depth'];
    if (
      keys.some(
        key =>
          !Number.isFinite(record.values[key]) ||
          record.values[key] < 0 ||
          (key !== 'offset' && record.values[key] === 0) ||
          record.values[key] > 400
      )
    )
      throw Error('实测值无效');
    if (
      typeof record.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
      Number.isNaN(Date.parse(record.date))
    )
      throw Error('实测日期无效');
    if (record.appliedGeometry != null && typeof record.appliedGeometry !== 'string') throw Error('实测应用标识无效');
    return {
      objectId: record.objectId,
      kind: record.kind,
      date: record.date,
      notes: String(record.notes || '').slice(0, 4000),
      values: Object.fromEntries(keys.map(key => [key, record.values[key]])),
      needsReview: !!record.needsReview,
      appliedGeometry: record.appliedGeometry || null,
    };
  });
  if (new Set(surveys.map(record => record.objectId)).size !== surveys.length) throw Error('实测对象记录重复');
  let underlay = null;
  if (input.underlay != null) {
    const image = input.underlay;
    if (
      typeof image.dataUrl !== 'string' ||
      image.dataUrl.length > 28 * 1024 * 1024 ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)
    )
      throw Error('底图必须是有效的 PNG/JPEG，最大 20 MB');
    for (const key of ['pixelWidth', 'pixelHeight', 'scale', 'x', 'y', 'rotation', 'opacity'])
      if (!Number.isFinite(image[key])) throw Error('底图参数无效');
    if (
      image.pixelWidth < 1 ||
      image.pixelHeight < 1 ||
      image.pixelWidth * image.pixelHeight > 50000000 ||
      image.scale <= 0 ||
      image.scale > 400 ||
      image.opacity < 0 ||
      image.opacity > 1
    )
      throw Error('底图尺寸或透明度无效');
    let calibration = null;
    if (image.calibration) {
      const { points, distance } = image.calibration;
      if (
        !Array.isArray(points) ||
        points.length !== 2 ||
        !Number.isFinite(distance) ||
        distance <= 0 ||
        points.some(
          p =>
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            p.x < 0 ||
            p.y < 0 ||
            p.x > image.pixelWidth ||
            p.y > image.pixelHeight
        ) ||
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) < 1
      )
        throw Error('底图标定信息无效');
      calibration = { points: points.map(p => ({ x: p.x, y: p.y })), distance };
      if (Math.abs(distance / Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) - image.scale) > 1e-8)
        throw Error('底图比例与标定信息不一致');
    }
    underlay = {
      dataUrl: image.dataUrl,
      name: String(image.name || '图纸底图').slice(0, 200),
      pixelWidth: image.pixelWidth,
      pixelHeight: image.pixelHeight,
      scale: image.scale,
      x: image.x,
      y: image.y,
      rotation: image.rotation,
      opacity: image.opacity,
      visible: image.visible !== false,
      locked: image.locked !== false,
      needsReview: !!image.needsReview,
      calibration,
    };
  }
  return { underlay, surveys };
}
export function markResourcesForReview(resources) {
  const next = structuredClone(resources);
  if (next.underlay) next.underlay.needsReview = true;
  next.surveys.forEach(record => {
    record.needsReview = true;
  });
  return next;
}
export function projectBackup(layout, resources, names = { projectName: '地图项目', schemeName: '现状方案' }) {
  return {
    format: 'wms-map-project',
    formatVersion: 2,
    names: { projectName: workspaceName(names.projectName), schemeName: workspaceName(names.schemeName) },
    exportedAt: new Date().toISOString(),
    layout: validateLayout(layout),
    resources: validateResources(resources),
  };
}
export function parseProjectBackup(text) {
  if (new TextEncoder().encode(text).length > 40 * 1024 * 1024) throw Error('项目备份不能超过 40 MB');
  const value = JSON.parse(text);
  if (value.format !== 'wms-map-project' || ![1, 2].includes(value.formatVersion)) throw Error('不支持的项目备份格式');
  if (value.formatVersion === 2 && !value.names) throw Error('项目备份缺少名称信息');
  return projectBackup(value.layout, value.resources, value.formatVersion === 2 ? value.names : undefined);
}
