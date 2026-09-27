import { seed } from '../../core/model/model.js';
import { validateLayout } from '../../core/model/layout-validation.js';
import { ensureSpatial, defaultAreas } from '../../core/spatial/spatial.js';

// 优先恢复本机草稿，否则读取远程发布布局；只有未配置远程且没有本地数据才生成示例几何。
export async function loadWorkspace(local, { remote, layoutCode } = {}) {
  const saved = await local.load();
  if (saved) {
    const model = validateLayout(saved.model);
    if (layoutCode && model.layoutCode !== layoutCode)
      throw Error('本机草稿与配置的布局不同，请先导出并明确迁移工作区');
    return model;
  }
  if (remote) {
    const code = layoutCode || 'MAIN';
    const published = await remote.getPublishedLayout(code);
    if (published.layoutCode !== code) throw Error('服务器布局身份不匹配');
    let source;
    // 只有服务端明确表示从未发布才读取服务器草稿；网络错误不能转为示例布局。
    if (published.publishedVersion === null && published.layout === null) source = await remote.getServerDraft(code);
    else {
      if (!Number.isSafeInteger(published.publishedVersion) || published.publishedVersion < 0 || !published.layout)
        throw Error('服务器已发布布局契约无效');
      source = published;
    }
    const model = validateLayout(source.layout);
    if (source.layoutCode !== code || model.layoutCode !== code) throw Error('服务器布局编码不匹配');
    return model;
  }
  const model = seed();
  ensureSpatial(model);
  model.areas = defaultAreas(model);
  return model;
}
