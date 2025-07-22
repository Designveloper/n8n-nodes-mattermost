import {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';
import WebSocket from 'ws';

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
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
			},
		],
	};

	async trigger(this: ITriggerFunctions): Promise<any> {
		const credentials = await this.getCredentials('mattermostTriggerApi');
		const token = credentials.accessToken;
		const channelId = this.getNodeParameter('channelId', 0) as string;
		const websocketUrl = this.getNodeParameter('websocketUrl', 0) as string;
		const eventType = this.getNodeParameter('eventType', 0) as string;

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

				if (eventType === 'posted') {
					const post = JSON.parse(message.data.post);
					if (post.channel_id === channelId) {
						this.emit([this.helpers.returnJsonArray([post])]);
					}
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
