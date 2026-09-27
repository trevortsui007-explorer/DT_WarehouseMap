# Phase 8–10 验证记录

## 范围与阶段门禁

- Phase 8：Layout schema 3、Runtime Store、Renderer 分离、IndexedDB v2 事务升级；阶段测试 34/34。
- Phase 9：Remote Repository、乐观并发、已发布货位身份锁及错误状态；阶段测试 38/38。
- Phase 10：GET 快照、SignalR 单货位 Delta、订阅窗口补偿、重连与定点渲染；阶段初轮测试 46/46。

最终完整测试 **54/54（12 个测试文件）**；原有 5 个 check 脚本、ESLint、格式检查通过。追加覆盖首次远程布局加载、已有本机工作优先、升级事务失败回滚、晚到保存响应、订阅时断线与缓冲溢出。

`npm run build` 通过，JS 957.44 KB / gzip 279.78 KB。保留非阻塞包体积提示；SignalR 依赖有两处 PURE 注释位置提示，Rollup 自动移除注释，不修改依赖源码。本机 Vite 已启动，`http://127.0.0.1:5173` HTTP 200。

保留 CAD 数学、坐标系、FG 语义、货架/门/货位 ID、JSON 导入导出与独立 Undo/Redo。旧测试中“新货位 cartons=0”的断言改为“不存在 cartons”，Schema 迁移断言改为 3；几何断言未放宽。历史 JSON fixture 仍保留 v2 cartons，用来验证兼容转换。

## 架构

```text
Vue
 └─ Application
     ├─ Layout State → Commands / Session History → Core
     │    ├─ Local Repository → Dexie (drafts/history/snapshots/meta)
     │    └─ Remote Lifecycle → Remote Repository → C# REST (待接)
     ├─ Runtime State ← Runtime Session ← Snapshot Repository + SignalR Adapter
     └─ Konva / Three ← Layout + Runtime + ViewState
```

Runtime 的 loading/ready/error/stale/reconnecting 状态独立于本机保存状态。正常启动没有 Demo Adapter；仅测试 fixture 显式生成数据。无配置时显示未配置/不可用，几何仍可查看。Runtime 不进入 Layout、Undo、Local Draft 或本机历史。

新浏览器配置了 Remote API 后，首次从服务器获取已发布布局（明确未发布时才读取服务器草稿），请求失败阻止初始化，不退回示例几何。已有本机草稿仍优先恢复，配置身份不匹配时保留草稿并拒绝切换。

库存颜色和数量按 LocationCode 查询独立 Runtime；未知货位显示“—”，非 NORMAL 锁状态用淡橙提示。2D 单货位更新所属列，3D 更新该货位台面材质和示意箱显隐；场景、相机和选择不重建。

保存三个概念分离：本机 1.2s AutoSave；Server Draft PUT 递增 draftRevision；独立 Publish 才接受服务器 publishedVersion。409 提供保留、导出和重新载入，后者先原子备份本机工作。已发布 LocationCode 锁定，服务端删除占用校验错误完整保留；真正的校验与发布事务尚待后端实现。

## 已实现 / 待实现

已实现：前端数据分层、本机迁移、Remote Repository、DTO 与错误边界、生命周期 UI、快照与 SignalR Adapter、自动化 fake API / SignalR 测试。

已定义但待 C#：REST endpoints、身份与 Capability 返回、Server Draft 并发控制、Publish 校验与事务、关系 Projection、Runtime GET、Hub SubscribeRuntime 分组协议。详见 [后端契约](wms-remote-contract.md)。未创建后端工程、执行 SQL 或连接生产数据库。

需 WMS 确认：仓库范围与 FG 关系、CurrentLocation/HU 汇总、锁/任务状态字典、序号 scope 与连续性、快照一致读取点、认证/CSRF/CORS，以及初始服务器草稿与 MAIN 布局身份映射。

## 人工 Smoke Test（尚待真实浏览器与服务）

- [ ] 打开地图时 Runtime 显示加载中，不出现 Demo 数量。
- [ ] Runtime Snapshot 返回后显示实际 Runtime。
- [ ] Runtime GET 失败显示错误，不显示 Demo Runtime。
- [ ] 2D Runtime 状态、未知状态与锁颜色正确。
- [ ] 3D Runtime 状态和箱数示意正确。
- [ ] Runtime 更新不会产生 Layout Undo。
- [ ] Runtime 更新不会触发 Layout Draft dirty / AutoSave。
- [ ] 修改 Layout 后 Local AutoSave 正常。
- [ ] Save Draft 与 Local AutoSave 分离；保存草稿不增加 PublishedVersion。
- [ ] 已发布 LocationCode 普通编辑器不可改。
- [ ] 删除业务占用货位时 Publish 被服务器规则拒绝，并显示原因。
- [ ] 409 冲突不丢失 Local Draft，可导出或备份后重新载入服务器草稿。
- [ ] SignalR 单货位变化更新地图，视角和选择保持。
- [ ] SignalR 断线重连后重新 GET 同步 Runtime。
- [ ] 原 CAD：Shift、多向框选、组合拖动、Alt、旋转、阵列、方向键、F/Home、门沿边吸附仍符合现场预期。
- [ ] 原浏览器旧数据库升级后，布局、历史和导出编码保持；原演示数量不再显示。

浏览器工具本轮仍无法连接，不能将 DOM/fake IndexedDB 测试当作真实浏览器验收。后端尚不存在，真实服务端拒绝占用删除、网络部署和 WMS 数值也未联调。强制关闭页面仍可能中断待完成的 IndexedDB 异步写入。

Bundle 动态分包暂缓；本轮优先业务边界与数据正确性。多本机布局工作区切换、管理员主数据改码、自动合并、离线同步队列不在当前实现中。
