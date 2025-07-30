import { ILoadOptionsFunctions } from 'n8n-workflow';
import { Channel } from '../types';
import { apiRequest } from '../transport';

export async function getDisplayNameForDM(
	this: ILoadOptionsFunctions,
	channel: Channel,
	currentUserId: string,
): Promise<string | undefined> {
	const userIds = channel.name.split('__');
	const otherUserId = userIds.find((id) => id !== currentUserId);

	return apiRequest.call(this, 'GET', `/users/${otherUserId}`).then((user) => {
		return user.first_name && user.last_name
			? `${user.first_name} ${user.last_name}`
			: user.username;
	});
}
