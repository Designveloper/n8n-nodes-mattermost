import {
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { apiRequest } from './transport';
const FormData = require('form-data');

export class MattermostUploadBinaryData implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mattermost Upload Binary Data',
		name: 'mattermostUploadBinaryData',
		group: ['transform'],
		version: 1,
		description: 'Upload a binary data to a Mattermost channel',
		defaults: { name: 'Upload Binary Data' },
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		icon: 'file:mattermost.svg',
		credentials: [{ name: 'mattermostUploadBinaryDataApi', required: true }],
		properties: [
			{
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				required: true,
				description: 'Channel ID to post file',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				description: 'Message to post along with the file',
			},
			{
				displayName: 'Binary Property Name',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property containing the file to upload',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const channelId = this.getNodeParameter('channelId', i) as string;
			const message = this.getNodeParameter('message', i) as string;
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

			if (!item.binary || !item.binary[binaryPropertyName]) {
				throw new NodeOperationError(
					this.getNode(),
					`Binary property "${binaryPropertyName}" not found on item ${i}`,
				);
			}

			const binaryData = item.binary[binaryPropertyName];
			const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
			const fileName = binaryData.fileName ?? binaryPropertyName;

			const form = new FormData();
			form.append('files', buffer, {
				filename: fileName,
				contentType: binaryData.mimeType,
			});
			form.append('channel_id', channelId);

			try {
				const uploadResp = await apiRequest.call(
					this,
					'POST',
					`files`,
					form,
					{},
					{ ...form.getHeaders() },
				);

				const fileId = uploadResp.file_infos?.[0]?.id;

				if (!fileId) {
					throw new NodeOperationError(this.getNode(), 'Mattermost did not return a file ID');
				}

				const postResp = await apiRequest.call(
					this,
					'POST',
					`posts`,
					{
						channel_id: channelId,
						message: message || 'File uploaded',
						file_ids: [fileId],
					},
					{},
				);

				returnData.push({ json: postResp });
			} catch (error) {
				throw new NodeOperationError(this.getNode(), `Failed to upload file: ${error}`);
			}
		}

		return [returnData];
	}
}
