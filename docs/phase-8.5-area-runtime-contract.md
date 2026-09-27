# Phase 8.5 — Physical Area / Virtual Location Contract Patch

## Layout

`layout.areas` 代表 Physical Area。沿用原 id/name/type/x/y/width/depth/rotation；不改坐标系，不将原 inbound/outbound/aisle 类型替换成示例 STAGING，不改造成嵌套 geometry。

Layout schemaVersion=4，新增 `areaBindings:[]`。旧 v1/v2/v3 通过现有迁移链升级，保留物理区域、货架、门和货位身份。IndexedDB database version **仍为 2**，表与索引不变；已有草稿及快照通过事务迁移 JSON 内容，失败全部回滚。旧迁移原文归档继续保留。

```text
Physical Area (layout.areas)
  1 → N AreaBinding
           → virtualLocationCode（WMS CurrentLocation 业务位置）
           → runtime.virtualAreas[virtualLocationCode]（仅运行态）
```

Binding：`{id,areaId,virtualLocationCode,displayName,purpose,isActive}`。ID 唯一、Area 必须存在、编码非空；同一 Layout 内所有 Binding 的 virtualLocationCode 唯一，停用也不释放重复绑定约束。停用记录不参与运行态映射与汇总。

不支持 displayPriority / displayOrder / hiddenByDefault。所有 Active Binding 均展示。HOLD、WAITING、URGENT 是状态，不是逻辑库位。用途如 RECEIVING、PUTAWAY_PENDING、RETURN 描述实际 WMS 位置的用途，不能把动态状态伪装成位置。

绑定编辑、启停和删除进入 Layout Command、Undo、Local/Server Draft、Snapshot 和 Publish；删除 Physical Area 同一命令删除其绑定，Undo 一并恢复。复制/阵列 Physical Area 只复制几何，新区域不自动继承绑定，避免同一 Virtual Location 绑定两处。

## WMS 数据约束

**一个 HU 同一时刻只能拥有一个 Current Virtual Location。** HU001 不能同时属于 RECEIVE-01 和 PUTAWAY-01。Virtual Location 是 CurrentLocation 业务身份，不是状态标签。

因此 Physical Area 的 HU / Pallet / OuterBox 等可加性 Count 直接对全部 Active Binding 求和。不在前端做 HU 去重以掩盖 WMS 错误。未来明细发现同一 HU 多个 CurrentLocation，应由 WMS 报告数据异常并修正来源；本 Patch 不修改 HU、CurrentLocation、Inventory、Task、Reservation。

缺失任一绑定的 Runtime Summary 时，该行显示“—”，总计显示“未知”，不将缺失值当零。聚合结果仅在 Application 中计算，不写回 Layout。

## Runtime Snapshot / Delta

保留原 `locations`（兼容原数组及按 locationCode 索引的对象），新增可选 `virtualAreas` 编码索引对象：

```json
{
  "warehouseCode": "WMS-SCOPE",
  "sequence": 10836,
  "generatedAt": "2026-09-26T00:00:00Z",
  "locations": {},
  "virtualAreas": {
    "RECEIVE-01": { "huCount": 9, "palletCount": 4, "outerBoxCount": 56, "updatedAt": "2026-09-26T00:00:00Z" },
    "PUTAWAY-01": { "huCount": 8, "palletCount": 3, "outerBoxCount": 49, "updatedAt": "2026-09-26T00:00:00Z" }
  }
}
```

缺省 virtualAreas={}，用于旧服务兼容，不生成 Demo。三个 Count 均为非负安全整数。Snapshot 同时替换两类 Runtime 基线。禁止将 virtualAreas/palletCount 等运行态字段写进布局 JSON。

SignalR 新增 `VirtualAreaRuntimeChanged`，内容 `{eventType,warehouseCode,virtualLocationCode,sequence,state}`。state 为 `{huCount,palletCount,outerBoxCount,updatedAt}` 完整 Summary。与 LocationRuntimeChanged **共享同一连续 sequence**，不得为两种事件各建一套序号；服务端订阅需发送两种事件，沿用 stale rejection、gap resync、重连再订阅和 Snapshot 补偿。

更新流程：Runtime Store → Application 解析 Active Binding → 对受影响 Physical Area 调用 Konva/Three updateArea。Inactive 或未绑定编码可以更新 Runtime 基线，但不触发地图区域映射。不会生成 Layout Undo 或触发布局 AutoSave。

## 展示与交互

2D 保留一块 Physical Area Geometry，逐行展示全部 Active Virtual Location 与合计。按可用高度缩小字体；宽度不足时缩略行文字，点击区域可查看全部完整名称、编码及数量，绝不按优先级隐藏某一行。

3D 沿本地区域较长轴等分（宽深相等时沿宽轴），按稳定 Binding ID 顺序排列。N=1 使用整个 Footprint；N=0 保留原物理区域。分段只存在于渲染对象中，不创建新 Area、不改变 Layout Geometry。视觉分段与真实隔断无关。运行态变化更新文字纹理，不重建场景。

PC 区域属性面板展示全部绑定，点击逻辑库位展示 Summary，可按需读取 Detail。PDA 窄屏使用可滚动 Bottom Sheet，默认展开所有绑定；保留收起/展开整个面板的操作，不设置单库位隐藏规则。

## 按需 Detail 扩展点

Runtime Repository：`getAreaDetail(virtualLocationCode,{warehouseCode,layoutCode},signal)`。

路由 `GET /api/wms-fg/map/runtime/areas/{virtualLocationCode}?warehouseCode=...&layoutCode=...`。建议响应 `{virtualLocationCode,generatedAt,items:[...]}`，items 可包含 Pallet/HU/OuterBox/ProdNo/WeekCode/Qty/ArrivalTime/WaitingDuration/Task。实际字段映射待 WMS 确认；当前仅提供只读 Adapter 和错误/加载显示，不实现 C# 服务、不改业务库存。详情只在点击“按需读取明细”时请求；失败明确显示错误，不造数据。

后续业务意图可引用 `BusinessIntent.targetLocationCode`，本 Patch 仅查看绑定和 Runtime，不触发 WMS 写操作。

## 验证与范围

最终验证：`npm test` **67/67（13 个测试文件）**，原有 legacy checks **5/5**，`npm run build`、ESLint、Prettier 检查通过。生产 JS 969.30 KB / gzip 283.51 KB；原有非阻塞包体积与 SignalR PURE 注释提示仍保留。

自动化覆盖迁移、原 Area 保留、唯一/无效绑定、Inactive 排除、直接汇总、未知总计、长轴等分与零/单绑定、Snapshot 扩展、共享序号与 stale rejection、定点更新、无 Undo/AutoSave 污染，以及删除区域后 Undo 恢复绑定。原有 CAD/门/货架与无 Demo fallback 测试继续执行。

真实浏览器中的小区域文字可读性、PDA Bottom Sheet 与真实 WMS Detail 仍需人工复核。后端待办仅为 C# Runtime API、SQL Mapping、Runtime Detail API、WMS CurrentLocation Integration、PDA Business Intent。
