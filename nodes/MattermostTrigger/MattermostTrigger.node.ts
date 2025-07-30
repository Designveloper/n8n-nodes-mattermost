import {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	NodeConnectionType,
	NodeOperationError,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';
import WebSocket from 'ws';
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
				displayName: 'Channel Name',
				name: 'channelIds',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getChannels',
				},
				default: [],
				options: [],
				description:
					'Select one or more channel IDs. Choose from the list, or use an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
		const token = credentials.accessToken;
		const websocketUrl = this.getNodeParameter('websocketUrl', 0) as string;
		const eventType = this.getNodeParameter('eventType', 0) as string;
		const includeDM = this.getNodeParameter('includeDM', 0) as boolean;
		const includeGM = this.getNodeParameter('includeGM', 0) as boolean;
		const channelIds = this.getNodeParameter('channelIds', 0) as string[];

		const ws = new WebSocket(websocketUrl, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		ws.on('open', () => {
			console.log('WebSocket connection established');
		});

		ws.on('message', (data: Buffer) => {
			try {
				const message = JSON.parse(data.toString());

				if (message.event !== eventType) return;

				if (!includeDM && message.data.channel_type === 'D') return;
				if (!includeGM && message.data.channel_type === 'G') return;
				if (
					!channelIds.includes(message?.broadcast?.channel_id) &&
					['O', 'P'].includes(message.data.channel_type)
				)
					return;

				if (eventType === 'posted') {
					const post = JSON.parse(message.data.post);
					this.emit([this.helpers.returnJsonArray([post])]);
				} else {
					this.emit([this.helpers.returnJsonArray([message])]);
				}
			} catch (err) {
				console.error('Error parsing message', err);
			}
		});

		ws.on('error', (err) => {
			console.error('WebSocket error:', err);
			throw new NodeOperationError(this.getNode(), 'Something went wrong');
		});

		return {
			closeFunction: () => {
				ws.close();
			},
		};
	}
}
