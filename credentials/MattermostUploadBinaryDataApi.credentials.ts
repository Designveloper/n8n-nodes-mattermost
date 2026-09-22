export class MattermostUploadBinaryDataApi {
  name = 'mattermostUploadBinaryDataApi';
  displayName = 'Mattermost API';
  documentationUrl = 'https://docs.mattermost.com/';
  properties = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      placeholder: 'https://your-mattermost-server.com',
    },
    {
      displayName: 'Access Token',
      name: 'accessToken',
      type: 'string',
      default: '',
      typeOptions: {
        password: true,
      },
    },
    {
      displayName: 'Ignore SSL Issues (Insecure)',
      name: 'allowUnauthorizedCerts',
      type: 'boolean',
      description: 'Whether to connect even if SSL certificate validation is not possible',
      default: false,
    },
  ];
  authenticate = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.accessToken}}',
      },
    },
  };
  test = {
    request: {
      baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}/api/v4',
      url: '/users',
      skipSslCertificateValidation: '={{$credentials?.allowUnauthorizedCerts}}',
    },
  };
}
