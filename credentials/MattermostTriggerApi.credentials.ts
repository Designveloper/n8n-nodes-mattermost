import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class MattermostTriggerApi implements ICredentialType {
	name = 'mattermostTriggerApi';
	displayName = 'Mattermost API';
	documentationUrl = 'https://docs.mattermost.com/';
	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
		},
	];
}
