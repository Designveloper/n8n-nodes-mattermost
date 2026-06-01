import type {
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	GenericValue,
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

/**
 * Make an API request to Mattermost
 */
export async function apiRequest(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | GenericValue | GenericValue[] = {},
	query: IDataObject = {},
) {
	// Get credentials from n8n
	const credentials = await this.getCredentials('mattermostPostDirectMessageApi');
	if (!credentials) {
		throw new Error('No credentials got returned!');
	}

	const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/api/v4/${endpoint}`,
		body,
		qs: query,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
		skipSslCertificateValidation: credentials.allowUnauthorizedCerts as boolean,
	};

	// Use n8n built-in helper for authentication
	return await this.helpers.httpRequestWithAuthentication.call(
		this,
		'mattermostPostDirectMessageApi',
		options,
	);
}

/**
 * Make API requests and return all items (pagination support)
 */
export async function apiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD',
	endpoint: string,
	body: IDataObject = {},
	query: IDataObject = {},
) {
	const returnData: IDataObject[] = [];

	let responseData;
	query.page = 0;
	query.per_page = 100;

	do {
		responseData = await apiRequest.call(this, method, endpoint, body, query);
		query.page++;
		returnData.push.apply(returnData, responseData as IDataObject[]);
	} while ((responseData as IDataObject[]).length !== 0);

	return returnData;
}
