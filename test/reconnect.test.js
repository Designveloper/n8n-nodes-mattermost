import assert from 'node:assert/strict';
import { test } from 'node:test';

test('handshake timeout resets connecting and schedules the next retry', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  const delays = [];
  const listeners = new Map();
  let readyState = 'connecting';
  let currentTimer = null;

  const setTimeoutImpl = (fn, delay) => {
    currentTimer = { fn, delay };
    delays.push(delay);
    return currentTimer;
  };
  const clearTimeoutImpl = (timer) => {
    if (timer === currentTimer) currentTimer = null;
  };
  const ws = {
    readyState,
    on: (event, handler) => listeners.set(event, handler),
    terminate: () => {
      readyState = 'closed';
      listeners.get('close')?.(1006, Buffer.from('handshake timeout'));
    },
  };

  const node = {
    async trigger() {
      const WebSocket = { CONNECTING: 'connecting', OPEN: 'open' };
      let wsRef = null;
      let connecting = false;
      let stopping = false;
      let reconnectAttempts = 0;
      let reconnectTimer = null;
      const clearTimers = () => {};
      const scheduleReconnect = (reason) => {
        if (stopping || reconnectTimer) return;
        reconnectAttempts++;
        reconnectTimer = setTimeoutImpl(() => {
          reconnectTimer = null;
          connect();
        }, 30000);
        this.lastReason = reason;
      };
      const teardownSocket = () => {
        wsRef = null;
        connecting = false;
      };
      const connect = () => {
        if (stopping || connecting) return;
        connecting = true;
        teardownSocket();
        let handshakeTimeout = setTimeoutImpl(() => {
          if (!wsRef || wsRef.readyState !== WebSocket.OPEN) {
            this.handshakeTimedOut = true;
            clearTimeoutImpl(handshakeTimeout);
            handshakeTimeout = null;
            wsRef?.terminate();
            connecting = false;
            scheduleReconnect('handshake timeout');
          }
        }, 15000);
        wsRef = ws;
        listeners.get('open')?.();
      };
      connect();
    },
  };

  await node.trigger();
  currentTimer.fn();

  assert.equal(node.handshakeTimedOut, true);
  assert.equal(node.lastReason, 'handshake timeout');
  assert.equal(delays.at(-1), 30000);
  assert.ok(logs.length === 0 || logs[0] === undefined);
  console.error = originalError;
});
