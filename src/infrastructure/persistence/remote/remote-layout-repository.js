import { validateLayout } from '../../../core/model/layout-validation.js';

// 远程布局接口：本地保存、共享草稿、正式版本各自独立。
export function createRemoteLayoutRepository(request) {
  const root = '/api/wms-fg/map/layouts';
  const path = code => `${root}/${encodeURIComponent(code)}`;
  return {
    listLayouts: () => request(root),
    getPublishedLayout: code => request(path(code)),
    getServerDraft: code => request(path(code) + '/draft'),
    initializeLayout: (code, layout) =>
      request(path(code) + '/initialize', {
        method: 'POST',
        body: { schemaVersion: 6, layout: validateLayout(layout) },
      }),
    // PUT 更新草稿，发送前再次校验并剥离运行态；正式版本创建只走 publishLayout。
    saveServerDraft: (code, dto) =>
      request(path(code) + '/draft', {
        method: 'PUT',
        body: { ...dto, schemaVersion: 6, layout: validateLayout(dto.layout) },
      }),
    publishLayout: (code, dto) => request(path(code) + '/publish', { method: 'POST', body: dto }),
    listVersions: code => request(path(code) + '/versions'),
    getVersion: (code, version) => request(path(code) + '/versions/' + encodeURIComponent(version)),
  };
}
