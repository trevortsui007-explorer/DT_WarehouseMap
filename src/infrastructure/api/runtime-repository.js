// 只读 Runtime HTTP 适配器；正式数据等待 WMS API 提供，不引入生产 Demo fallback。
export function createRuntimeRepository(request) {
  return {
    // 按需获取虚拟库位详情，URL 编码将业务编码作为单个路径段传递。
    getAreaDetail(virtualLocationCode, scope, signal) {
      const query = new URLSearchParams(scope);
      return request('/api/wms-fg/map/runtime/areas/' + encodeURIComponent(virtualLocationCode) + '?' + query, {
        signal,
      });
    },
    // 从参数对象解构出明确的仓库与布局范围，再请求完整运行态快照。
    getSnapshot({ warehouseCode, layoutCode }, signal) {
      if (!warehouseCode) throw Error('尚未配置 WMS warehouseCode；不会从 FG 归属推断仓库范围');
      const query = new URLSearchParams({ warehouseCode, layoutCode });
      return request('/api/wms-fg/map/runtime?' + query, { signal });
    },
  };
}
