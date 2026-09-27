# Phase 4–7 边界与验证

## 分阶段执行

- Phase 4：Konva / Three 场景和对象生命周期集中到 renderers；阶段测试 15/15。
- Phase 5：Application 管理选择、命令、会话 Undo/Redo；Konva 管理手势与渲染预览；阶段测试 17/17。
- Phase 6：异步 WorkspaceRepository 隔离旧 localStorage 实现，先验证兼容；阶段测试 18/18。
- Phase 7：切换 Dexie，新增事务、迁移、重试、幂等及 debounce 验证；完整测试 31/31。

## 依赖

Vue → Application → Core；Application 协调 Renderer，并通过注入的 Repository 访问持久化。
bootstrap 负责装配具体 Repository → Dexie → IndexedDB。
Core 不依赖 UI、Renderer 或存储。Renderer 不维护正式 Layout、历史或持久化。

主要目录：

```text
src/
  application/{commands,editor,selection,history,layout,persistence}/
  core/{model,geometry,spatial,doors,contracts}/
  renderers/{konva,three}/
  infrastructure/persistence/
    indexeddb/{db.js,schema.js,workspace-repository.js}
    legacy/{localstorage-migration.js,legacy-workspace-repository.js}
    preference/local-preference.js
  components/
  views/
  bootstrap.js
```

## 本机数据

数据库 `wms-map-workspace` 显式版本 1。drafts 保存当前草稿和本地元数据；history 保存历史索引；snapshots 保存完整备份；meta 保存迁移状态和旧数据原文。baseVersion 为 null，不虚构服务器版本。布局 JSON、LocationCode 和 schemaVersion 2 不变。

常规历史最多 20 条，迁移归档长期保留并可从历史列表恢复。编辑会话 Undo/Redo 独立于数据库历史。自动保存为有意义修改结束后 1200ms debounce；保存队列串行，完成旧版本写入不会误报更新的编辑已保存。导入和恢复在事务成功前不替换内存模型。

迁移处理 library-v1 与 layout-v3/v2/v1 四个明确业务键，使用现有 Schema 转换和校验。先事务写入，再独立读回校验，标记成功后才清理内容仍匹配的旧键。稳定记录 ID 避免重试重复；已有 IndexedDB 草稿不会被旧数据覆盖。中断在写入、校验或清理阶段均可重试，旧原文同时留在 meta。未知键和偏好键保留。损坏数据会阻止启动并明确报错，不能以默认布局覆盖旧数据。

旧 localStorage Repository 仅保留兼容测试用途，生产装配使用 Dexie。PreferenceRepository 可继续使用 localStorage；当前未增加业务数据写入。

## 自动化覆盖与限制

最终验证：`npm run build`、`npm test`（31/31）、`npm run check`（5/5）、`npm run lint`、`npm run format:check` 均通过。原本机开发入口 HTTP 200。生产 JS 约 940.85 KB（gzip 273.96 KB），体积提示非阻塞，未调整警告阈值。

保留五个 check 脚本；Core 与 Renderer/Application 依赖边界有静态检查。命令、Undo/Redo、Vue 联动、FG、2D/3D 选择、导入恢复和保存失败有测试；原几何脚本继续验证框选方向、旋转、阵列、吸附、门沿边移动、重叠与越界及稳定货位身份。

Dexie 测试使用 fake-indexeddb 和真实事务，覆盖 draft/history、回滚、所有已知旧键、旧 Schema、读回失败、重试、幂等、部分清理失败、旧原文保留及生产 Repository 装配。DOM 测试模拟 Canvas/WebGL，不替代 GPU 视觉与真实鼠标操作验收。

本轮浏览器工具无法连接，尚未对真实浏览器中的旧数据迁移、画面、门拖动和快捷键完整手测。请继续使用原浏览器配置与 `http://127.0.0.1:5173`；其他 origin 有独立数据库。强制关闭页面不能保证异步写入完成，未保存时会请求浏览器离开提示；建议确认已保存或导出备份后关闭。

Phase 8+ 留存：Layout/Runtime 分离、C# API、SQL Server、Server Draft/Publish、SignalR、Bundle Optimization。
