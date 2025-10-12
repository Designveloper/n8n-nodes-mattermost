import {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	NodeConnectionType,
	NodeOperationError,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';
import { apiRequest } from './transport';
import { Team } from './types';

export class MattermostTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mattermost Trigger',
		name: 'mattermostTrigger',
		group: ['trigger'],
		version: 1,
		description: 'Trigger for Mattermost events',
		defaults: {
			name: 'Mattermost Trigger',
		},
		icon: 'file:mattermost.svg',
		subtitle: '={{$parameter["eventType"]}}',
		inputs: [],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'mattermostTriggerApi',
				required: true,
			},
		],
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
				typeOptions: {
					loadOptionsMethod: 'getChannels',
				},
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
			async getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const channels = await apiRequest.call(this, 'GET', '/users/me/channels');
				const teams: Team[] = await apiRequest.call(this, 'GET', '/users/me/teams');

				if (channels === undefined) {
					throw new NodeOperationError(this.getNode(), 'No data got returned');
				}

				const returnData: INodePropertyOptions[] = [];
				for (const channel of channels) {
					if (channel.delete_at !== 0 || channel.type === 'D' || channel.type === 'G') {
						continue;
					}

					let name: string = '_';

					const team = teams.find((item) => item.id == channel.team_id);
					const visibility = channel.type === 'O' ? 'public' : 'private';
					name = `${team?.display_name} - ${channel.display_name || channel.name} (${visibility})`;

					returnData.push({
						name,
						value: channel.id as string,
					});
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

	async trigger(this: ITriggerFunctions): Promise<any> {
		const credentials = await this.getCredentials('mattermostTriggerApi');
		const token = credentials.accessToken as string;
		const websocketUrl = (this.getNodeParameter('websocketUrl', 0) as string) || '';
		const eventType = this.getNodeParameter('eventType', 0) as string;
		const includeDM = this.getNodeParameter('includeDM', 0) as boolean;
		const includeGM = this.getNodeParameter('includeGM', 0) as boolean;
		const channelIds = this.getNodeParameter('channelIds', 0) as string[];

		const WebSocket = require('ws');

		let ws: InstanceType<typeof WebSocket> | null = null;

		// timers
		let pingInterval: NodeJS.Timeout | null = null;
		let pongTimeout: NodeJS.Timeout | null = null;
		let reconnectTimer: NodeJS.Timeout | null = null;

		// reconnection state
		let reconnectAttempts = 0;
		const BASE_DELAY = 1000;           // 1s
		const MAX_DELAY = 30_000;          // 30s
		let stopping = false;              // set to true in closeFunction to prevent further reconnects
		let connecting = false;            // prevent parallel connects

		const clearTimers = () => {
			if (pingInterval) clearInterval(pingInterval);
			if (pongTimeout) clearTimeout(pongTimeout);
			if (reconnectTimer) clearTimeout(reconnectTimer);
			pingInterval = pongTimeout = reconnectTimer = null;
		};

		const startKeepAlive = () => {
			// Send ws.ping() every 30s and require a pong within 10s
			pingInterval = setInterval(() => {
				if (!ws || ws.readyState !== WebSocket.OPEN) return;
				try {
					ws.ping();
					console.log("MattermostTrigger: ping...")
					if (pongTimeout) clearTimeout(pongTimeout);
					pongTimeout = setTimeout(() => {
						// No pong in 10s => terminate to trigger 'close' and reconnection
						try {
							console.log('MattermostTrigger: heartbeat missed, terminating socket');
							ws?.terminate();
						} catch { }
					}, 10_000);
				} catch { }
			}, 30_000);
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
			} catch { }
		};

		const scheduleReconnect = (reason: string) => {
			if (stopping) return;
			if (reconnectTimer) return; // already scheduled

			reconnectAttempts += 1;
			// exponential backoff with jitter
			const exp = Math.min(reconnectAttempts, 8); // cap exponent growth
			const delay = Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, exp));
			const jitter = Math.floor(Math.random() * 500); // up to 0.5s jitter
			const waitMs = delay + jitter;

			console.log(`MattermostTrigger: reconnect in ${waitMs}ms (attempt ${reconnectAttempts}) due to: ${reason}`);
			reconnectTimer = setTimeout(() => {
				reconnectTimer = null;
				connect();
			}, waitMs);
		};

		const teardownSocket = () => {
			try {
				ws?.removeAllListeners?.();
				if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
					try { ws.close(); } catch { }
					try { ws.terminate(); } catch { }
				}
			} catch { }
			ws = null;
			clearTimers();
			connecting = false;
		};

		const connect = () => {
			if (stopping) return;
			if (connecting) return;
			connecting = true;

			teardownSocket(); // ensure clean state before opening new one (also clears timers)

			try {
				ws = new WebSocket(websocketUrl, {
					headers: { Authorization: `Bearer ${token}` },
				});

				ws.on('open', () => {
					console.log('MattermostTrigger: WS open');
					reconnectAttempts = 0;      // reset backoff on successful open
					connecting = false;
					authenticate();
					startKeepAlive();
				});

				ws.on('upgrade', () => {
					// Some environments emit 'upgrade' before 'open'
					// nothing to do, but useful to know socket is in progress
				});

				ws.on('unexpectedResponse', (_req: any, res: any) => {
					console.error('MattermostTrigger: unexpectedResponse', res?.statusCode);
					connecting = false;
					scheduleReconnect('unexpectedResponse');
				});

				ws.on('pong', () => {
					console.log("MattermostTrigger: pong...")
					if (pongTimeout) clearTimeout(pongTimeout);
				});

				ws.on('message', (data: Buffer) => {
					try {
						const msg = JSON.parse(data.toString());

						if (msg.event === 'hello') return;

						if (msg.event === 'ping') {
							try {
								ws?.send(JSON.stringify({ seq: msg.seq || 0, action: 'pong' }));
							} catch { }
							return;
						}

						// Filter by event type
						if (eventType && msg.event !== eventType) return;

						// Channel filtering
						const chType = msg?.data?.channel_type as 'D' | 'G' | 'O' | 'P' | undefined;
						if (!includeDM && chType === 'D') return;
						if (!includeGM && chType === 'G') return;

						const bcastCh = msg?.broadcast?.channel_id;
						if (['O', 'P'].includes(chType || '') && Array.isArray(channelIds) && channelIds.length) {
							if (!bcastCh || !channelIds.includes(bcastCh)) return;
						}

						// Emit payload
						if (eventType === 'posted') {
							const post = JSON.parse(msg.data.post);
							this.emit([this.helpers.returnJsonArray([post])]);
						} else {
							this.emit([this.helpers.returnJsonArray([msg])]);
						}
					} catch { }
				});

				ws.on('error', (err: any) => {
					console.error('MattermostTrigger: WS error', err?.message || err);
					// error alone may not close the socket; let 'close' handle reconnection,
					// but in some cases 'error' is terminal without 'close', so schedule reconnect too.
					scheduleReconnect('error');
				});

				ws.on('close', (code: number, reasonBuf: Buffer) => {
					const reason = reasonBuf?.toString?.() || '';
					console.warn(`MattermostTrigger: WS closed (code=${code}) ${reason}`);
					connecting = false;
					teardownSocket();
					scheduleReconnect(`close code=${code}`);
				});
			} catch (e: any) {
				connecting = false;
				console.error('MattermostTrigger: connect() threw', e?.message || e);
				teardownSocket();
				scheduleReconnect('connect exception');
			}
		};

		// initial connect
		connect();

		return {
			closeFunction: () => {
				try {
					console.log('MattermostTrigger: shutting down');
					stopping = true;         // prevents any further reconnects
					if (reconnectTimer) clearTimeout(reconnectTimer);
					reconnectTimer = null;
					teardownSocket();
				} catch { }
			},
		};
	}

}
