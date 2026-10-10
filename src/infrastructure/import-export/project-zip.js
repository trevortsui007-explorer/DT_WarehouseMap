import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { parseWorkspaceImport } from '../../core/workspace/import-workspace.js';
import { projectBackup } from '../../core/workspace/resources.js';
const limit = 40 * 1024 * 1024;
const allowed = new Set([
  'manifest.json',
  'layout.json',
  'resources.json',
  'assets/underlay.png',
  'assets/underlay.jpg',
]);
const encode = value => strToU8(JSON.stringify(value));
export async function createProjectZip(input) {
  const backup = projectBackup(input.layout, input.resources, input.names);
  const resources = structuredClone(backup.resources);
  const files = {};
  if (resources.underlay) {
    const [header, body] = resources.underlay.dataUrl.split(',');
    const path = header.includes('image/png') ? 'assets/underlay.png' : 'assets/underlay.jpg';
    files[path] = Uint8Array.from(atob(body), c => c.charCodeAt(0));
    delete resources.underlay.dataUrl;
    resources.underlay.asset = path;
  }
  files['manifest.json'] = encode({ format: 'wms-map-project-zip', formatVersion: 1, names: backup.names });
  files['layout.json'] = encode(backup.layout);
  files['resources.json'] = encode(resources);
  if (Object.values(files).reduce((n, bytes) => n + bytes.length, 0) > limit) throw Error('项目包内容不能超过 40 MB');
  return new Promise((resolve, reject) =>
    zip(files, { level: 1 }, (error, bytes) => (error ? reject(error) : resolve(bytes)))
  );
}
export async function readProjectFile(file) {
  if (file.size > limit) throw Error('导入文件不能超过 40 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return parseWorkspaceImport(strFromU8(bytes));
  let total = 0,
    invalid = false;
  const files = await new Promise((resolve, reject) =>
    unzip(
      bytes,
      {
        filter(entry) {
          total += entry.originalSize;
          if (!allowed.has(entry.name) || !Number.isFinite(entry.originalSize) || total > limit) {
            invalid = true;
            return false;
          }
          return true;
        },
      },
      (error, result) => (error ? reject(Error('ZIP 文件损坏，当前工作未修改')) : resolve(result))
    )
  );
  if (invalid) throw Error('ZIP 包含不支持的文件或解压后超过 40 MB');
  const read = name => {
    if (!files[name]) throw Error('项目包缺少 ' + name);
    return JSON.parse(strFromU8(files[name]));
  };
  const manifest = read('manifest.json');
  if (manifest.format !== 'wms-map-project-zip' || manifest.formatVersion !== 1) throw Error('不支持的 ZIP 项目版本');
  const resources = read('resources.json');
  if (resources.underlay) {
    const path = resources.underlay.asset;
    if (!['assets/underlay.png', 'assets/underlay.jpg'].includes(path) || !files[path]) throw Error('项目包底图缺失');
    let binary = '';
    for (let i = 0; i < files[path].length; i += 8192)
      binary += String.fromCharCode(...files[path].subarray(i, i + 8192));
    resources.underlay.dataUrl = `data:image/${path.endsWith('.png') ? 'png' : 'jpeg'};base64,${btoa(binary)}`;
    delete resources.underlay.asset;
  }
  return { layoutOnly: false, backup: projectBackup(read('layout.json'), resources, manifest.names) };
}
export function downloadProjectZip(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'warehouse-project.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
