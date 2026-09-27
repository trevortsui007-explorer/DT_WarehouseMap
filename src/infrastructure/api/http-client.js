// 保留 HTTP 状态、结构化错误码和详情；上层不解析中文提示来判断冲突或权限。
export class WmsApiError extends Error {
  // 扩展 Error，同时保留标准 message 与堆栈信息。
  constructor(code, message, status = 0, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// 创建可注入 transport 的 JSON 客户端，集中处理超时、取消、凭证与错误转换。
export function createHttpClient(baseUrl, { transport = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async (path, { method = 'GET', body, signal } = {}) => {
    if (!baseUrl) throw new WmsApiError('SERVER_UNAVAILABLE', '尚未配置 WMS API，本机草稿已保留');
    const controller = new AbortController();
    // 内部控制器合并外部取消与请求超时；finally 清理计时器和监听，避免资源泄漏。
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    try {
      const response = await transport(baseUrl.replace(/\/$/, '') + path, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new WmsApiError('SERVER_UNAVAILABLE', 'WMS API 未返回有效 JSON', response.status);
      }
      if (!response.ok) {
        const fallback =
          { 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 409: 'LAYOUT_DRAFT_CONFLICT' }[response.status] ||
          'SERVER_UNAVAILABLE';
        throw new WmsApiError(data.code || fallback, data.message || 'WMS 请求失败', response.status, data.details);
      }
      return data;
    } catch (error) {
      if (error instanceof WmsApiError) throw error;
      throw new WmsApiError('SERVER_UNAVAILABLE', error.message || 'WMS 服务暂不可用');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}
