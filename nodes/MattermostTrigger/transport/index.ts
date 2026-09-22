import type { IDataObject } from 'n8n-workflow';

async function apiRequest(method, endpoint, body = {}, query: IDataObject = {}) {
  const credentials = await this.getCredentials('mattermostTriggerApi');
  const baseUrl = credentials.baseUrl.replace(/\/$/, '');
  const options = {
    method,
    body,
    qs: query,
    url: `${baseUrl}/api/v4/${endpoint}`,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    skipSslCertificateValidation: credentials.allowUnauthorizedCerts,
  };
  return await this.helpers.httpRequestWithAuthentication.call(
    this,
    'mattermostTriggerApi',
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
