import { createWorkspaceController } from './application/workspace/workspace-controller.js';
import { createMapApplication } from './application/app.js';
import { createBrowserLayoutRepository } from './infrastructure/persistence/browser-layout-repository.js';
import { createHttpClient } from './infrastructure/api/http-client.js';
import { createRemoteLayoutRepository } from './infrastructure/persistence/remote/remote-layout-repository.js';
import { createRuntimeRepository } from './infrastructure/api/runtime-repository.js';
import { createSignalRClient } from './infrastructure/realtime/signalr-client.js';
import { createRuntimeSession } from './application/runtime/runtime-session.js';

// 应用组合入口：把具体存储、HTTP 和实时通信实现注入 Application，避免业务层直接依赖基础设施。
export async function bootstrapMap(ui) {
  const repository = createBrowserLayoutRepository();
  try {
    // import.meta.env 由 Vite 提供；未配置服务地址时不启用远程布局仓库。
    const baseUrl = import.meta.env.VITE_WMS_API_BASE || '';
    const services = {
      remote: baseUrl ? createRemoteLayoutRepository(createHttpClient(baseUrl)) : null,
      remoteScope: baseUrl,
      runtimeRepository: createRuntimeRepository(createHttpClient(baseUrl)),
      layoutCode: import.meta.env.VITE_WMS_LAYOUT_CODE || null,
      warehouseCode: import.meta.env.VITE_WMS_WAREHOUSE_CODE || null,
      // 按当前布局的 WMS 范围创建独立 Runtime 会话；FG 归属不能替代仓库范围。
      startRuntime(store, model) {
        const hubUrl = import.meta.env.VITE_WMS_HUB_URL;
        const session = createRuntimeSession({
          store,
          repository: createRuntimeRepository(createHttpClient(baseUrl)),
          realtime: hubUrl ? createSignalRClient(hubUrl) : null,
          scope: { warehouseCode: store.state.warehouseCode, layoutCode: model().layoutCode },
        });
        // void 表示不等待启动完成；加载与失败状态由会话内部处理，布局可以先显示。
        void session.start();
        return session;
      },
    };
    if (repository.catalog)
      return await createWorkspaceController({
        ui,
        root: repository,
        services,
        createApplication: createMapApplication,
      });
    return await createMapApplication(ui, repository, services);
  } catch (error) {
    // 可选调用 ?.() 只在 close 存在时执行，启动失败后释放已创建的存储连接。
    repository.close?.();
    throw error;
  }
}
