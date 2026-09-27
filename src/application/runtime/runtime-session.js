// Snapshot is authoritative. Deltas buffered during connect/resync close the GET/subscription gap.
// 协调权威快照与实时增量；连接和重同步期间缓冲事件，避免 GET 与订阅之间丢失更新。
export function createRuntimeSession({ store, repository, realtime, scope }) {
  let disposed = false,
    connected = false,
    buffering = true,
    buffer = [],
    syncing = null,
    starting = null;
  let connectionEpoch = 0;
  let bufferGeneration = 0;
  const controller = new AbortController();
  const setStatus = (status, error = null) => {
    if (!disposed) store.status(status, error);
  };
  // 没有快照时失败为 error；已有基线则为 stale，保留可见数据但明确提示可能过期。
  const failure = error => setStatus(store.state.sequence === null ? 'error' : 'stale', error.message);
  // 只缓存当前仓库事件；超过上限清空并增加代次，使正在进行的快照不能误判缓冲完整。
  function enqueue(event) {
    if (event?.warehouseCode !== scope.warehouseCode) return;
    buffer.push(event);
    if (buffer.length > 5000) {
      bufferGeneration++;
      buffer = [];
      throw Error('运行态事件缓冲超过上限，请重新同步');
    }
  }
  // GET 并验证快照建立基线；取消或销毁后不再更新状态，也没有示例数据兜底。
  async function baseline() {
    const snapshot = await repository.getSnapshot(scope, controller.signal);
    if (!disposed) store.snapshot(snapshot);
  }
  // 复用进行中的同步 Promise；新快照之后按序回放缓冲，连续缺口最多尝试三次。
  function resync() {
    if (disposed) return Promise.resolve();
    if (syncing) return syncing;
    buffering = true;
    setStatus(store.state.sequence === null ? 'loading' : 'stale');
    // 立即执行的 async 函数返回 Promise，供并发调用共享；finally 在成功或失败后释放同步锁。
    syncing = (async () => {
      try {
        // Bounded retry avoids spinning on a permanently inconsistent server sequence.
        for (let attempt = 0; attempt < 3; attempt++) {
          const generation = bufferGeneration;
          await baseline();
          if (disposed) return;
          if (generation !== bufferGeneration) continue;
          const pending = buffer.sort((a, b) => a.sequence - b.sequence);
          buffer = [];
          let gap = false;
          for (let index = 0; index < pending.length; index++) {
            if (store.delta(pending[index]) === 'gap') {
              buffer.push(...pending.slice(index));
              gap = true;
              break;
            }
          }
          if (!gap) {
            buffering = !connected;
            store.state.connected = connected;
            setStatus(connected ? 'ready' : 'stale', connected ? null : '实时连接尚未恢复');
            return;
          }
        }
        throw Error('运行态序号缺口尚未恢复，请重试同步');
      } catch (error) {
        failure(error);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }
  // 正常时直接应用单个增量；遇到缺号先保留事件，再请求新快照。
  function event(value) {
    if (disposed) return;
    try {
      if (buffering || !connected || syncing) {
        enqueue(value);
        return;
      }
      if (store.delta(value) === 'gap') {
        enqueue(value);
        void resync();
      }
    } catch (error) {
      buffering = true;
      failure(error);
    }
  }
  // 连接代次递增，阻止旧连接建立流程在断线后把状态重新标为已连接。
  function disconnect(error) {
    connectionEpoch++;
    connected = false;
    buffering = true;
    store.state.connected = false;
    setStatus(store.state.sequence === null ? 'error' : 'stale', error?.message || '实时连接已断开，请重试');
  }
  // 首次 GET → 建立订阅 → 再 GET 并回放缓冲；不依赖服务器支持历史事件重放。
  function start() {
    if (disposed) return Promise.resolve();
    if (starting) return starting;
    if (connected) return resync();
    starting = (async () => {
      try {
        await realtime?.stop();
        buffering = true;
        buffer = [];
        setStatus(store.state.sequence === null ? 'loading' : 'reconnecting');
        await baseline();
        if (disposed) return;
        if (!realtime) throw Error('快照已载入，但尚未配置实时连接');
        const epoch = connectionEpoch;
        await realtime.connect(scope, {
          event,
          reconnecting(error) {
            connectionEpoch++;
            connected = false;
            buffering = true;
            store.state.connected = false;
            setStatus('reconnecting', error?.message || null);
          },
          // 重连后必须重建快照基线，不能假设断线期间没有库存变化。
          async reconnected() {
            connected = true;
            await resync();
          },
          closed: disconnect,
        });
        if (disposed) return;
        if (connectionEpoch !== epoch) throw Error('连接建立期间已中断，请重试同步');
        connected = true;
        // No server replay assumption: subscribe first, GET again, then replay buffered deltas > snapshot.sequence.
        await resync();
      } catch (error) {
        failure(error);
      } finally {
        starting = null;
      }
    })();
    return starting;
  }
  return {
    start,
    resync,
    // 取消在途 HTTP 并丢弃缓冲，关闭实时连接；旧回调通过 disposed 检查失效。
    dispose() {
      disposed = true;
      controller.abort();
      buffer = [];
      return realtime?.stop().catch(() => {});
    },
  };
}
