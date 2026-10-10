import { projectBackup, parseProjectBackup, emptyResources } from './resources.js';
// 用户文件入口兼容纯布局；恢复包解析仍保持严格，不把损坏备份降级为空资源布局。
export function parseWorkspaceImport(text) {
  if (new TextEncoder().encode(text).length > 40 * 1024 * 1024) throw Error('导入文件不能超过 40 MB');
  const value = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (value && !Object.hasOwn(value, 'format') && Object.hasOwn(value, 'schemaVersion') && Array.isArray(value.racks))
    return {
      layoutOnly: true,
      backup: projectBackup(value, emptyResources(), { projectName: '导入地图', schemeName: '导入方案' }),
    };
  return { layoutOnly: false, backup: parseProjectBackup(JSON.stringify(value)) };
}
