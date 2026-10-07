import { verifyUnderlay } from '../../infrastructure/import-export/underlay-image.js';

// 每次打开创建独立应用会话和固定分区仓库；epoch 使旧会话迟到通知失效。
export async function createWorkspaceController({ ui, root, services, createApplication }) {
  const catalog = root.catalog;
  let application,
    currentId,
    currentInfo,
    epoch = 0,
    busy = false,
    disposed = false;
  const catalogState = { projects: [], error: '', busy: false };
  const publish = () => {
    if (!disposed) ui.patch({ workspaceCatalog: { ...catalogState, busy } });
  };
  async function refresh() {
    catalogState.projects = await catalog.list();
    publish();
  }
  async function prepare(id) {
    const info = await catalog.info(id),
      repo = catalog.repository(id);
    const saved = await repo.load();
    if (!saved) throw Error('目标方案草稿缺失，当前工作已保留');
    if (info.remoteEligible && services.layoutCode && saved.model.layoutCode !== services.layoutCode)
      throw Error('原工作区与配置的云端布局不一致，请核对服务配置');
    // 校验目标的历史及资源再销毁当前画面，避免打开半损坏工作区。
    await repo.history();
    const resources = await repo.loadResources();
    await verifyUnderlay(resources.underlay);
    return { id, info, repo, model: saved.model };
  }
  async function mount(bundle) {
    const generation = ++epoch;
    currentId = bundle.id;
    currentInfo = bundle.info;
    const scopedUi = {
      ...ui,
      isDisposed: () => disposed || generation !== epoch || ui.isDisposed?.(),
      patch: patch => {
        if (!disposed && generation === epoch) ui.patch(patch);
      },
      afterUpdate: callback =>
        ui.afterUpdate(() => {
          if (!disposed && generation === epoch) callback();
        }),
    };
    ui.patch({
      ready: false,
      busy: false,
      remote: null,
      layout: { layoutOpen: false, history: [], canApply: false, importSummary: '', layoutError: '' },
    });
    application = await createApplication(scopedUi, bundle.repo, {
      ...services,
      // 新分支不继承全局配置的写入目的地或并发修订；已绑定仓库仍可读取运行态。
      remote: bundle.info.remoteEligible ? services.remote : null,
      layoutCode: bundle.info.remoteEligible ? services.layoutCode : null,
      warehouseCode: bundle.info.remoteEligible ? services.warehouseCode : bundle.model?.warehouseCode || null,
      workspaceInfo: currentInfo,
      initialLayout: bundle.model,
      importAsNewProject: backup => transition(() => catalog.importProject(backup)),
    });
    if (disposed) {
      await application.dispose();
      return;
    }
    await catalog.ready();
    Object.assign(currentInfo, await catalog.info(currentId));
    application.refreshWorkspaceInfo?.();
  }
  async function transition(target) {
    if (busy || disposed) return false;
    busy = true;
    catalogState.error = '';
    publish();
    let detached = false,
      source;
    try {
      await application.prepareWorkspaceSwitch();
      source = await prepare(currentId);
      if (disposed) throw Error('页面已关闭');
      const id = typeof target === 'function' ? await target() : target;
      if (id === currentId) return true;
      const bundle = await prepare(id);
      if (disposed) throw Error('页面已关闭');
      await application.dispose();
      detached = true;
      await mount(bundle);
      if (disposed) return false;
      await catalog.remember(id);
      return true;
    } catch (error) {
      catalogState.error = error.message;
      // 极少数渲染初始化错误也重新载入已成功保存的源方案；目标仍留在列表可重试。
      if (detached && source && !disposed) {
        try {
          await application?.dispose();
          await mount(source);
        } catch (restoreError) {
          ui.patch({ loadError: restoreError.message, ready: false });
        }
      }
      return false;
    } finally {
      application?.cancelWorkspaceSwitch?.();
      busy = false;
      if (!disposed) {
        try {
          await refresh();
        } catch (error) {
          catalogState.error ||= error.message;
        }
        publish();
      }
    }
  }
  async function rename(operation) {
    if (busy || disposed) return;
    busy = true;
    catalogState.error = '';
    publish();
    try {
      await operation();
      Object.assign(currentInfo, await catalog.info(currentId));
      application.refreshWorkspaceInfo?.();
      await refresh();
    } catch (error) {
      catalogState.error = error.message;
    } finally {
      busy = false;
      publish();
    }
  }
  try {
    await catalog.ready();
    currentId = await catalog.last();
    const projects = await catalog.list();
    if (projects.length) await mount(await prepare(currentId));
    else
      await mount({
        id: 'main',
        info: {
          workspaceId: 'main',
          projectId: 'legacy-project',
          name: '现状方案',
          projectName: '成品仓',
          remoteEligible: true,
        },
        repo: catalog.repository('main'),
      });
    await catalog.remember(currentId);
    await refresh();
  } catch (error) {
    disposed = true;
    ++epoch;
    await application?.dispose();
    throw error;
  }
  const commands = {
    async openLayout() {
      try {
        await refresh();
      } catch (error) {
        catalogState.error = error.message;
        publish();
      }
      return application.openLayout();
    },
    openWorkspace: id => transition(id),
    createMap: input => transition(() => catalog.createMap(input)),
    copyWorkspace: name => transition(() => catalog.copy(currentId, name)),
    renameProject: (id, name) => rename(() => catalog.renameProject(id, name)),
    renameWorkspace: (id, name) => rename(() => catalog.renameWorkspace(id, name)),
    async dispose() {
      disposed = true;
      ++epoch;
      await application?.dispose();
      root.close?.();
    },
  };
  // Vue 持有稳定动作门面；重建会话后按钮会读取新会话方法，而非缓存旧闭包。
  return new Proxy(commands, { get: (target, key) => (key in target ? target[key] : application?.[key]) });
}
