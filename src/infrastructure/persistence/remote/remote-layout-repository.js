import { validateLayout } from '../../../core/model/layout-validation.js';

// 定义未来 C# REST 对接边界；此处仅实现客户端请求，不代表发布校验或服务器存储已实现。
export function createRemoteLayoutRepository(request) {
  const root = '/api/wms-fg/map/layouts';
  const path = code => `${root}/${encodeURIComponent(code)}`;
  return {
    listLayouts: () => request(root),
    getPublishedLayout: code => request(path(code)),
    getServerDraft: code => request(path(code) + '/draft'),
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
