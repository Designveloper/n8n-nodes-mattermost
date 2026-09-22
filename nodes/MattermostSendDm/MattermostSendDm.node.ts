import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, INodeTypeDescription } from 'n8n-workflow';
import { apiRequest } from './transport';
class MattermostSendDm {
  description: INodeTypeDescription = {
    displayName: 'Mattermost Send DM',
    name: 'mattermostSendDm',
    group: ['transform'],
    version: 1,
    description: 'Send a direct message to a user by ID in Mattermost',
    defaults: { name: 'Mattermost Send DM' },
    inputs: ['main'],
    outputs: ['main'],
    icon: 'file:mattermost.svg',
    credentials: [{ name: 'mattermostPostDirectMessageApi', required: true }],
    properties: [
      {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        default: '',
        required: true,
        description: 'Recipient user ID in Mattermost',
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        default: '',
        required: true,
        description: 'Message to send. Markdown formatting is supported.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData = [];
    for (let i = 0; i < items.length; i++) {
      const userId = this.getNodeParameter('userId', i);
      const message = String(this.getNodeParameter('message', i));
      const normalizedMessage = message.replace(/\r\n|\r|\n/g, '\n');
      try {
        const meResp = await apiRequest.call(this, 'GET', 'users/me');
        const myUserId = meResp.id;
        const channelResp = await apiRequest.call(this, 'POST', 'channels/direct', [
          myUserId,
          userId,
        ]);
        const channelId = channelResp.id;
        const postResp = await apiRequest.call(this, 'POST', 'posts', {
          channel_id: channelId,
          message: normalizedMessage,
        });
        returnData.push({ json: postResp });
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          error.response?.data || error.message || 'Unknown error',
        );
      }
    }
    return [returnData];
  }
}
export { MattermostSendDm };
