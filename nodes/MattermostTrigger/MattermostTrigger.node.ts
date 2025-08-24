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
		let pingInterval: NodeJS.Timeout | null = null;
		let pongTimeout: NodeJS.Timeout | null = null;
		let reconnectTimer: NodeJS.Timeout | null = null;
		let backoff = 1000;

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
					if (pongTimeout) clearTimeout(pongTimeout);
					pongTimeout = setTimeout(() => {
						try {
							ws?.terminate();
						} catch {}
					}, 10000);
				} catch (_) {}
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

		const reconnect = () => {
			clearTimers();
			if (reconnectTimer) clearTimeout(reconnectTimer);
			reconnectTimer = setTimeout(connect, backoff);
			backoff = Math.min(backoff * 2, 30000);
		};

		const connect = () => {
			clearTimers();
			try {
				ws = new WebSocket(websocketUrl, {
					headers: { Authorization: `Bearer ${token}` },
				});

				ws.on('open', () => {
					backoff = 1000;
					authenticate();
					startKeepAlive();
				});

				ws.on('pong', () => {
					console.log('pong!');
					if (pongTimeout) clearTimeout(pongTimeout);
				});

				ws.on('message', (data: Buffer) => {
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

						const chType = msg?.data?.channel_type as 'D' | 'G' | 'O' | 'P' | undefined;
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
					} catch (err) {}
				});

				ws.on('error', (_err: any) => {
					console.error('WS error', _err);
				});

				ws.on('close', (_code: number, _reason: Buffer) => {
					reconnect();
				});
			} catch (_e) {
				reconnect();
			}
		};

		connect();

		return {
			closeFunction: () => {
				try {
					ws?.close();
				} catch {}
				clearTimers();
			},
		};
	}
}
