import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, INodeExecutionData, INodeTypeDescription } from 'n8n-workflow';
import { apiRequest } from './transport';
class MattermostGetMessages {
  description: INodeTypeDescription = {
    displayName: 'Mattermost Get Messages',
    name: 'mattermostGetMessages',
    group: ['transform'],
    version: 1,
    description: 'Fetch messages from a Mattermost channel',
    defaults: { name: 'Get Channel Messages' },
    inputs: ['main'],
    outputs: ['main'],
    icon: 'file:mattermost.svg',
    credentials: [{ name: 'mattermostGetMessagesApi', required: true }],
    properties: [
      {
        displayName: 'Channel ID',
        name: 'channelId',
        type: 'string',
        default: '',
        required: true,
        description: 'Enter the ID of the channel to fetch messages from',
      },
      {
        displayName: 'Number of Messages',
        name: 'perPage',
        type: 'number',
        default: 20,
        description: 'Number of messages to fetch',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const channelId = this.getNodeParameter('channelId', 0);
    const perPage = this.getNodeParameter('perPage', 0);
    try {
      const response = await apiRequest.call(
        this,
        'GET',
        `/channels/${channelId}/posts`,
        {},
        { per_page: perPage.toString() },
      );
      const sortedMessages = response.order.map((msgId) => ({
        json: { ...response.posts[msgId] },
      }));
      return [sortedMessages];
    } catch (error) {
      throw new NodeOperationError(this.getNode(), `Failed to fetch messages: ${error}`);
    }
  }
}
export { MattermostGetMessages };
