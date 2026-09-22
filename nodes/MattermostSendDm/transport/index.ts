import type { IDataObject } from 'n8n-workflow';

async function apiRequest(method, endpoint, body = {}, query: IDataObject = {}) {
  const credentials = await this.getCredentials('mattermostPostDirectMessageApi');
  if (!credentials) {
    throw new Error('No credentials got returned!');
  }
  const baseUrl = credentials.baseUrl.replace(/\/$/, '');
  const options = {
    method,
    url: `${baseUrl}/api/v4/${endpoint}`,
    body,
    qs: query,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    skipSslCertificateValidation: credentials.allowUnauthorizedCerts,
  };
  return await this.helpers.httpRequestWithAuthentication.call(
    this,
    'mattermostPostDirectMessageApi',
    options,
  );
}
async function apiRequestAllItems(method, endpoint, body = {}, query: IDataObject = {}) {
  const returnData = [];
  let responseData;
  (query as IDataObject).page = 0;
  (query as IDataObject).per_page = 100;
  do {
    responseData = await apiRequest.call(this, method, endpoint, body, query);
    (query as IDataObject).page = Number((query as IDataObject).page ?? 0) + 1;
    returnData.push.apply(returnData, responseData);
  } while (responseData.length !== 0);
  return returnData;
}
export { apiRequest, apiRequestAllItems };
