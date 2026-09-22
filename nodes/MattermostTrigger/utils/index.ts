import { apiRequest } from '../transport';
async function getDisplayNameForDM(channel, currentUserId) {
  const userIds = channel.name.split('__');
  const otherUserId = userIds.find((id) => id !== currentUserId);
  return apiRequest.call(this, 'GET', `/users/${otherUserId}`).then((user) => {
    return user.first_name && user.last_name
      ? `${user.first_name} ${user.last_name}`
      : user.username;
  });
}
export { getDisplayNameForDM };
