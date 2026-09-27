# WMS Map — C# API / SQL Server / Runtime 对接契约

状态：前端 Repository、生命周期和 SignalR Adapter 已实现；仓库内没有 C# 后端项目，以下为待双方确认并实现的契约，未执行任何 SQL / DDL。

SignalR Adapter 面向 ASP.NET Core SignalR；如果现有 WMS 是旧版 ASP.NET SignalR，需确认并替换基础设施 Adapter，不能假设两种 Hub 协议兼容。

## 配置与身份

复制 `.env.example` 为 `.env.local`，填写真实 API base、WMS warehouseCode、SignalR Hub URL 后重新启动 Vite。未配置时本机布局仍可编辑、保存和导出，Runtime 明确报错，不产生演示库存。默认新建示例**几何**使用 layoutId=main、layoutCode=MAIN，warehouseCode/floorNo=null；不把 FG01/FG02 推断为 API 仓库范围。现阶段仍是一个本机布局工作区，不支持切换多个 LayoutCode；对接时需将现有 MAIN 与企业布局身份明确映射，不能用 UI 随意改业务身份。

Layout schemaVersion=4，slot.code 保持原 WMS LocationCode 语义。Runtime 字段不进入布局 JSON。数据库 schema 版本与 Layout schema、草稿修订及发布版本均独立。

`VITE_WMS_LAYOUT_CODE` 可为**尚无本机草稿**的工作区明确指定服务器布局，缺省为 MAIN。有本机草稿时优先恢复；如果该配置与本机身份不同，拒绝初始化并保留数据，不自动覆盖。空工作区已配置 Remote API 时，先 GET 已发布布局；服务器明确未发布才 GET Draft，网络失败不会退回示例几何。

HTTP 采用 JSON、凭据 cookie 和 15 秒超时；401/403 不降级为成功。不存储访问令牌。实际认证、CSRF、跨域凭据与网关部署需由 WMS 宿主确认；当前前端不能替代服务端鉴权。响应必须是 JSON，不能返回 SPA HTML 当作成功。

## REST

根路径 `/api/wms-fg/map/layouts`。路径参数 URL 编码。

| 方法 / 路径 | 语义 |
|---|---|
| GET /layouts | 布局目录，`{items:[{layoutCode,warehouseCode,publishedVersion}]}` |
| GET /layouts/{code} | 当前已发布布局、权限能力和已发布身份 |
| GET /layouts/{code}/draft | 当前共享草稿及并发基线 |
| PUT /layouts/{code}/draft | 更新同一个草稿，仅递增 draftRevision |
| POST /layouts/{code}/publish | 校验并创建不可变正式版本 |
| GET /layouts/{code}/versions | `{items:[{publishedVersion,status,publishedAt,publishedBy}]}` |
| GET /layouts/{code}/versions/{version} | 指定正式快照和元数据 |

已发布响应：

```json
{
  "layoutCode": "MAIN",
  "publishedVersion": 21,
  "layout": { "schemaVersion": 4 },
  "capabilities": { "canEditLayout": true, "canSaveDraft": true, "canPublishLayout": false }
}
```

示例 `layout` 省略了几何字段；实际必须提供完整、可校验的 Layout。从未发布时，必须明确返回 `publishedVersion:null, layout:null`，不能把 404/网络错误当作未发布。返回的 published layout 必须足以核验稳定 slot ID 与 LocationCode。

草稿 GET：`{layoutCode,draftRevision,basedOnPublishedVersion,layout,savedAt,savedBy}`。初始草稿必须由服务器提供受控基线；若尚未存在，后端可定义 revision=0 的初始布局响应，首次 PUT 需原子检查仍不存在。该初始化语义需要后端确认，前端不会自行生成服务器修订号。

草稿 PUT：

```json
{
  "expectedDraftRevision": 8,
  "basedOnPublishedVersion": 21,
  "schemaVersion": 4,
  "layout": { "schemaVersion": 4 }
}
```

响应 `{layoutCode,draftRevision:9,basedOnPublishedVersion:21,savedAt,savedBy}`。连续保存递增草稿修订，不创建 MapLayoutVersion。服务端检查当前发布基线和草稿修订；不得只检查其中一个。

Publish 请求 `{expectedDraftRevision,basedOnPublishedVersion}`，不上传 Layout；服务端读取已保存草稿。响应 `{layoutCode,publishedVersion:22,status:"PUBLISHED",publishedAt,publishedBy}`。前端只接受明确成功响应；随后要求重新载入服务器草稿建立新的基线。网络超时结果不确定时不得自动重发 Publish，应先读取服务状态核实。

## 本机工作与冲突

AutoSave → IndexedDB；Ctrl+S → 先落盘本机，再 PUT Server Draft；Publish 独立操作。运行态变化不触发其中任何一个。

并发基线存于本机 meta，按 API scope + layoutCode 隔离，包括 draftRevision、basedOnPublishedVersion 和最近同步的纯布局。重新读取服务器元数据不会自动将最新修订套到未同步的本机工作上。首次无基线时必须显式载入服务器草稿（本机布局先原子备份），再编辑或导入自己的备份。

409 不自动重试、merge 或覆盖。页面保留当前内存与 IndexedDB，提供保留本机草稿、导出、重新载入服务器草稿。载入服务器草稿会确认替换并保留替换前本机历史。保存响应晚于新的本机编辑时，新编辑仍标记未同步。

## 错误

响应 `{code,message,details,traceId?}`。前端按 code/status 判断，不解析中文 message。

| code | 建议 HTTP | 含义 |
|---|---|---|
| LAYOUT_DRAFT_CONFLICT | 409 | 草稿修订或发布基线冲突 |
| PUBLISHED_LOCATION_RENAME_FORBIDDEN | 422 | 普通编辑修改已发布 LocationCode |
| LOCATION_IN_USE | 422 | 删除/停用货位存在当前业务引用 |
| PUBLISH_VALIDATION_FAILED | 422 | 几何或其他发布校验失败 |
| SERVER_UNAVAILABLE | 503 | 服务不可用 |
| UNAUTHORIZED | 401 | 未认证 |
| FORBIDDEN | 403 | 缺少能力 |

`details` 可包含 `[{locationCode,reason,referenceType,referenceId}]`；前端保留完整结构，服务端 message 应说明业务原因并提示联系 IT，不向无权限用户暴露明细。

## LocationCode 与服务器发布事务

普通 UI 对已发布 LocationCode 提示“此货位已发布，如需更新请联系 IT 人员进行修改。”未知身份也先锁定。货架显示名称不联动改码；复制创建新 ID 和新编码。服务端仍必须对所有 PUT / Publish / Import 来源重新校验身份，不能信任前端锁或客户端 capabilities。IT 主数据改名迁移不在本轮范围。

比较当前 Published 与 Draft 中的 Location 集合。移除已使用货位必须检查：当前库存、现存 HU、活动上架/拣货/移库/盘点任务及其他活动 WMS 引用；有任一占用则 LOCATION_IN_USE，拒绝发布。仅历史 MoveLog、历史 HU、已完成任务不应阻止发布。业务连接表与查询由 WMS 确认，本文不推测实际表结构。

逻辑持久化模型（设计契约，不是 DDL）：

- MapLayout：稳定身份、当前发布指针、可编辑 Server Draft 及 draftRevision/basedOnPublishedVersion。
- MapLayoutVersion：不可变 SnapshotJson、publishedVersion、审计信息和 PUBLISHED/ARCHIVED 状态。
- MapRack / MapLocation：关系 Projection，供 Location Lookup、WMS JOIN、报表及集成使用。
- MapLocation 的退役以 Retire/Deactivate 为优先，历史业务引用继续有效；不物理删除历史主数据。

Publish 在同一个 SQL Server 事务内读取并锁定草稿与发布基线，重新验证能力、几何、ID/编码唯一性和活动业务引用；创建新不可变快照、更新关系 Projection、归档旧版本、更新当前发布指针后共同提交。任何失败全部回滚。须与 WMS 作业写入采用一致并发约束，避免“校验无库存后又入库”的时间窗口。隔离策略与业务锁由后端团队设计确认。Runtime 不写进 SnapshotJson。

## Runtime GET 与 SignalR

`GET /api/wms-fg/map/runtime?warehouseCode=...&layoutCode=...` → `{warehouseCode,sequence,generatedAt,locations:[...]}`。

每条 location：`{locationCode,huCount,outerBoxCount,skuSummary,occupancyStatus,lockStatus,taskStatus,updatedAt,version?}`。数量非负整数；占用 EMPTY/OCCUPIED/UNKNOWN；锁 NORMAL 或 WMS 约定非正常锁状态。缺失货位显示未知，不能默认为空。快照需覆盖约定仓库范围并与 sequence 具有一致读取点。

Hub 地址配置，订阅方法 **SubscribeRuntime({warehouseCode,layoutCode})**，服务端完成分组订阅后才确认 invoke。唯一入站事件 **LocationRuntimeChanged**：`{eventType,warehouseCode,locationCode,sequence,state}`，state 是完整该货位状态，不是局部属性 patch。不传 Layout 保存或发布消息。

当前 Adapter 不假设服务端支持 replay：先 GET，再连接及订阅，再次 GET，同时缓存收到的 Delta；最后只应用高于快照序号的事件。自动重连后重新订阅，再 GET 替换基线。SignalR 重连 API 使用官方客户端约定，首次连接失败由页面“重新同步运行态”显式重试：[Microsoft 客户端文档](https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-10.0)。

sequence 契约是**同一 warehouse scope 连续、单调递增、安全 JS 整数**，不能只向当前可见货位发送事件而保留全局缺口；客户端接收同一 scope 的全部序号。<=当前序号丢弃；出现缺口进行快照重同步，不推算库存。最多连续尝试 3 次，仍有缺口标记 stale 并允许手动重试；缓冲上限 5000，溢出明确提示重同步。服务端重启也应保持 sequence 单调；若需 stream epoch，应双方显式升级契约。

WMS 必须确认：CurrentLocation 的汇总粒度、托/箱/包 HU 去重计数、warehouseCode 与 FG 的实际关系、锁/任务优先级、序号范围、快照一致性与事件提交顺序。前端不从旧 cartons 推导任何真实 WMS 状态。

Area Runtime 扩展：Layout schema 4 新增 areaBindings；Snapshot 新增 virtualAreas；SignalR 同序号流新增 VirtualAreaRuntimeChanged。后续约束见 [Phase 8.5 Contract](phase-8.5-area-runtime-contract.md)。

