![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n Custom Nodes

This repository contains a collection of **custom n8n nodes** used internally or shared with the community. Each node is built to extend [n8n](https://n8n.io) with additional integrations or logic beyond the default capabilities.

These nodes follow the n8n node development standards and can be run locally or deployed within your own n8n instance.

---

## 🧩 Available Nodes

| Node Name           | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `MattermostTrigger` | Listen for Mattermost events via WebSocket (`posted`, `user_added`, etc.) |

<!-- Add more nodes here as the repository grows -->

---

## 🛠️ Development Setup

If you want to develop or customize these nodes, follow the steps below:

### Prerequisites

- [Node.js](https://nodejs.org/) v20+ and [npm](https://www.npmjs.com/)
- [git](https://git-scm.com/)
- (Optional) Global n8n installation:
  ```bash
  npm install -g n8n
  ```
