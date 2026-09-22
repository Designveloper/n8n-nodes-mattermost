# n8n Mattermost nodes

Custom [n8n](https://n8n.io) nodes for [Mattermost](https://mattermost.com). The package provides a WebSocket trigger and helper nodes for reading messages, sending direct messages, and uploading files.

## Install

In the n8n UI, open **Settings > Community nodes**, then install:

```text
@designveloper/n8n-nodes-mattermost-trigger
```

Self-hosted n8n installations can also add the package under **Settings > Nodes**. Docker deployments should install it in the container or custom image and restart n8n afterward.

## Nodes

### Mattermost Trigger

Listens to Mattermost WebSocket events and starts a workflow when an event arrives.

**Credential:** create a Mattermost API credential with:

- **Base URL:** for example `https://chat.example.com`
- **Access Token:** a Mattermost personal access token or bot token

**Parameters:**

- **WebSocket URL:** `https://chat.example.com/api/v4/websocket`
- **Event Type:** `On Message Posted`, `On User Joined`, or `On Channel Deleted`
- **Channel Names or IDs:** limits public/private channel events to selected channels
- **Listen to Direct Messages:** include direct-message channels
- **Listen to Group Messages:** include group-message channels

For `On Message Posted`, the node outputs the Mattermost post object. Other event types output the raw Mattermost WebSocket message.

Channel filtering follows the channel type in the event. Selecting no channels listens to all public and private channels that the credential can access. Direct and group messages are controlled separately by their checkboxes.

### Mattermost Get Messages

Fetches posts from a channel through `GET /api/v4/channels/{channel_id}/posts`.

### Mattermost Send DM

Finds or creates the direct channel between the credential user and a target user, then posts a message.

### Mattermost Upload Binary Data

Uploads a binary file to a channel and optionally creates a post containing that file.

## Reliability

The trigger maintains a WebSocket connection with:

- authentication through the Mattermost WebSocket challenge
- protocol ping/pong every 30 seconds
- missed-pong termination after 10 seconds
- exponential reconnect backoff from 2 seconds to 30 seconds
- a 15-second handshake timeout

The handshake timeout fixes a reconnect deadlock: if a retry opened a socket but the TCP/TLS/WebSocket handshake never completed, the old trigger stayed in a `connecting` state forever and ignored every later retry. A timeout now terminates that attempt and schedules another retry.

For production, monitor n8n logs for repeated `MattermostTrigger: WS closed`, `WS error`, or `handshake timeout` messages. A long run of these messages means Mattermost is unreachable or the token/network is being rejected.

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Node.js 20.15 or newer is required.

## Publish checklist

1. Confirm `package.json` has the intended package version.
2. Run `npm test`, `npm run lint`, and `npm run build`.
3. Inspect `npm pack` output; only the `dist` directory and package metadata should be included.
4. Authenticate with an npm account that can publish `@designveloper`.
5. Publish with `npm publish --access public`.
6. Tag the release and update the n8n deployment to the new version.
