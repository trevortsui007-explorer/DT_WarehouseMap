import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

// SignalR 只传 Runtime Delta；布局保存和发布仍由 Remote Repository 通过 REST 完成。
export function createSignalRClient(url, { connectionFactory } = {}) {
  let connection,
    stopped = false;
  // 建立连接并订阅仓库范围；重连时重新订阅后通知 Application 请求快照。
  async function connect(scope, handlers) {
    if (!url) throw Error('尚未配置 SignalR Hub 地址');
    stopped = false;
    connection = connectionFactory
      ? connectionFactory()
      : new HubConnectionBuilder()
          .withUrl(url, { withCredentials: true })
          .withAutomaticReconnect()
          .configureLogging(LogLevel.Warning)
          .build();
    const current = connection;
    // 闭包捕获本次连接 current，忽略已停止或被新连接替换的迟到回调。
    const active = () => !stopped && current === connection;
    const subscribe = () => current.invoke('SubscribeRuntime', scope);
    current.on('LocationRuntimeChanged', event => {
      if (active()) handlers.event(event);
    });
    current.on('VirtualAreaRuntimeChanged', event => {
      if (active()) handlers.event(event);
    });
    current.onreconnecting(error => {
      if (active()) handlers.reconnecting(error);
    });
    current.onreconnected(async () => {
      if (!active()) return;
      try {
        await subscribe();
        if (active()) await handlers.reconnected();
      } catch (error) {
        if (active()) handlers.closed(error);
        await current.stop();
      }
    });
    current.onclose(error => {
      if (active()) handlers.closed(error);
    });
    try {
      await current.start();
      if (!active()) {
        await current.stop();
        return;
      }
      await subscribe();
    } catch (error) {
      await current.stop();
      throw error;
    }
  }
  // 先使回调失效，再等待连接停止，避免关停事件反向污染新会话状态。
  async function stop() {
    stopped = true;
    await connection?.stop();
  }
  return { connect, stop };
}
