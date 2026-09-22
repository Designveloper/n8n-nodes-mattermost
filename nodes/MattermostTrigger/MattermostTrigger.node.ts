import { NodeOperationError } from 'n8n-workflow';
import type { INodeTypeDescription, ITriggerFunctions, ITriggerResponse } from 'n8n-workflow';
import { apiRequest } from './transport';
class MattermostTrigger {
  description: INodeTypeDescription = {
    displayName: 'Mattermost Trigger',
    name: 'mattermostTrigger',
    group: ['trigger'],
    version: 1,
    description: 'Trigger for Mattermost events',
    defaults: { name: 'Mattermost Trigger' },
    icon: 'file:mattermost.svg',
    subtitle: '={{$parameter["eventType"]}}',
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'mattermostTriggerApi', required: true }],
    properties: [
      {
        displayName: 'Event Type',
        name: 'eventType',
        type: 'options',
        default: 'posted',
        options: [
          { name: 'On Message Posted', value: 'posted' },
          { name: 'On User Joined', value: 'user_added' },
          { name: 'On Channel Deleted', value: 'channel_deleted' },
        ],
        required: true,
      },
      {
        displayName: 'WebSocket URL',
        name: 'websocketUrl',
        type: 'string',
        default: '',
        placeholder: 'ws://your-server.com/api/v4/websocket',
        required: true,
      },
      {
        displayName: 'Channel Names or IDs',
        name: 'channelIds',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getChannels' },
        default: [],
        options: [],
        description:
          'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
      },
      {
        displayName: 'Listen to Direct Messages',
        name: 'includeDM',
        type: 'boolean',
        default: false,
        description: 'Whether to listen for events from Direct Message (DM) channels',
      },
      {
        displayName: 'Listen to Group Messages',
        name: 'includeGM',
        type: 'boolean',
        default: false,
        description: 'Whether to listen for events from Group Message (GM) channels',
      },
    ],
  };

  methods = {
    loadOptions: {
      async getChannels() {
        const channels = await apiRequest.call(this, 'GET', '/users/me/channels');
        const teams = await apiRequest.call(this, 'GET', '/users/me/teams');
        if (channels === undefined) {
          throw new NodeOperationError(this.getNode(), 'No data got returned');
        }
        const returnData = [];
        for (const channel of channels) {
          if (channel.delete_at !== 0 || channel.type === 'D' || channel.type === 'G') {
            continue;
          }
          let name = '_';
          const team = teams.find((item) => item.id == channel.team_id);
          const visibility = channel.type === 'O' ? 'public' : 'private';
          name = `${team?.display_name} - ${channel.display_name || channel.name} (${visibility})`;
          returnData.push({ name, value: channel.id });
        }
        returnData.sort((a, b) => {
          if (a.name < b.name) {
            return -1;
          }
          if (a.name > b.name) {
            return 1;
          }
          return 0;
        });
        return returnData;
      },
    },
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const credentials = await this.getCredentials('mattermostTriggerApi');
    const token = credentials.accessToken;
    const websocketUrl = this.getNodeParameter('websocketUrl', 0) || '';
    const eventType = this.getNodeParameter('eventType', 0);
    const includeDM = this.getNodeParameter('includeDM', 0);
    const includeGM = this.getNodeParameter('includeGM', 0);
    const channelIds = this.getNodeParameter('channelIds', 0);
    const WebSocket = require('ws');
    let ws = null;
    let pingInterval = null;
    let pongTimeout = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const BASE_DELAY = 1000;
    const MAX_DELAY = 30000;
    const HANDSHAKE_TIMEOUT = 15000;
    let stopping = false;
    let connecting = false;
    const clearTimers = () => {
      if (pingInterval) clearInterval(pingInterval);
      if (pongTimeout) clearTimeout(pongTimeout);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      pingInterval = pongTimeout = reconnectTimer = null;
    };
    const startKeepAlive = () => {
      pingInterval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.ping();
          console.log('MattermostTrigger: ping...');
          if (pongTimeout) clearTimeout(pongTimeout);
          pongTimeout = setTimeout(() => {
            try {
              console.log('MattermostTrigger: heartbeat missed, terminating socket');
              ws?.terminate();
            } catch {}
          }, 10000);
        } catch {}
      }, 30000);
    };
    const authenticate = () => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const challenge = {
        seq: 1,
        action: 'authentication_challenge',
        data: { token },
      };
      try {
        ws.send(JSON.stringify(challenge));
      } catch {}
    };
    const scheduleReconnect = (reason) => {
      if (stopping) return;
      if (reconnectTimer) return;
      reconnectAttempts += 1;
      const exp = Math.min(reconnectAttempts, 8);
      const delay = Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, exp));
      const jitter = Math.floor(Math.random() * 500);
      const waitMs = delay + jitter;
      console.log(
        `MattermostTrigger: reconnect in ${waitMs}ms (attempt ${reconnectAttempts}) due to: ${reason}`,
      );
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, waitMs);
    };
    const teardownSocket = () => {
      try {
        ws?.removeAllListeners?.call(ws);
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          try {
            ws.close();
          } catch {}
          try {
            ws.terminate();
          } catch {}
        }
      } catch {}
      ws = null;
      clearTimers();
      connecting = false;
    };
    const connect = () => {
      if (stopping) return;
      if (connecting) return;
      connecting = true;
      teardownSocket();
      try {
        let handshakeTimeout: ReturnType<typeof setTimeout> | null = null;
        const clearHandshakeTimeout = () => {
          if (handshakeTimeout) clearTimeout(handshakeTimeout);
          handshakeTimeout = null;
        };
        ws = new WebSocket(websocketUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        handshakeTimeout = setTimeout(() => {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('MattermostTrigger: handshake timeout');
            clearHandshakeTimeout();
            try {
              ws?.terminate();
            } catch {}
            connecting = false;
            scheduleReconnect('handshake timeout');
          }
        }, HANDSHAKE_TIMEOUT);
        ws.on('open', () => {
          clearHandshakeTimeout();
          console.log('MattermostTrigger: WS open');
          reconnectAttempts = 0;
          connecting = false;
          authenticate();
          startKeepAlive();
        });
        ws.on('upgrade', () => {});
        ws.on('unexpectedResponse', (_req, res) => {
          clearHandshakeTimeout();
          console.error('MattermostTrigger: unexpectedResponse', res?.statusCode);
          connecting = false;
          scheduleReconnect('unexpectedResponse');
        });
        ws.on('pong', () => {
          console.log('MattermostTrigger: pong...');
          if (pongTimeout) clearTimeout(pongTimeout);
        });
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.event === 'hello') return;
            if (msg.event === 'ping') {
              try {
                ws?.send(JSON.stringify({ seq: msg.seq || 0, action: 'pong' }));
              } catch {}
              return;
            }
            if (eventType && msg.event !== eventType) return;
            const chType = msg?.data?.channel_type;
            if (!includeDM && chType === 'D') return;
            if (!includeGM && chType === 'G') return;
            const bcastCh = msg?.broadcast?.channel_id;
            if (
              ['O', 'P'].includes(chType || '') &&
              Array.isArray(channelIds) &&
              channelIds.length
            ) {
              if (!bcastCh || !channelIds.includes(bcastCh)) return;
            }
            if (eventType === 'posted') {
              const post = JSON.parse(msg.data.post);
              this.emit([this.helpers.returnJsonArray([post])]);
            } else {
              this.emit([this.helpers.returnJsonArray([msg])]);
            }
          } catch {}
        });
        ws.on('error', (err) => {
          clearHandshakeTimeout();
          console.error('MattermostTrigger: WS error', err?.message || err);
          scheduleReconnect('error');
        });
        ws.on('close', (code, reasonBuf) => {
          clearHandshakeTimeout();
          const reason = reasonBuf?.toString() || '';
          console.warn(`MattermostTrigger: WS closed (code=${code}) ${reason}`);
          connecting = false;
          teardownSocket();
          scheduleReconnect(`close code=${code}`);
        });
      } catch (e) {
        connecting = false;
        console.error('MattermostTrigger: connect() threw', e?.message || e);
        teardownSocket();
        scheduleReconnect('connect exception');
      }
    };
    connect();
    return {
      closeFunction: async () => {
        try {
          console.log('MattermostTrigger: shutting down');
          stopping = true;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = null;
          teardownSocket();
        } catch {}
      },
    };
  }
}
export { MattermostTrigger };
