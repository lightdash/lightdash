# AI Agent Service

## Slack Configuration

### Organization Settings (Integrations → Slack)

| Setting | Description |
| ------- | ----------- |
| **AI Agents thread access consent** (`aiThreadAccessConsent`) | When enabled, AI can read previous messages in a thread when user @mentions the bot. Provides conversation context. |
| **AI Agents OAuth requirement** (`aiRequireOAuth`) | Require users to authenticate via OAuth before using AI agents. |
| **Multi-agent channel** (`aiMultiAgentChannelId`) | Designated channel where users can access multiple AI agents. |

### Agent Settings (AI Agent → Integrations → Slack)

Each AI agent can be mapped to specific Slack channels. When a user @mentions the bot in that channel, it routes to the configured agent.

## Slack Agent Selection

### Channel Types

1. **Multi-agent channel** - Designated channel (`aiMultiAgentChannelId`) where multiple AI agents can be accessed via LLM selection or UI picker
2. **Regular channel** - Single-agent channel where agent is mapped via AI Agent settings page

### Handlers

| Handler                          | Trigger                                            | Description                           |
| -------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `handleMultiAgentChannelMessage` | Plain message (no @mention) in multi-agent channel | Only new threads                      |
| `handleAppMention`               | @mention anywhere                                  | Both multi-agent and regular channels |

### Agent Selection (`selectAgentForSlack`)

Centralized method for multi-agent channels:

```
0 agents  → Error message
1 agent   → Auto-select
N agents  → LLM picks (falls back to UI picker if low confidence)
```

Requires `isMultiAgentChannel: boolean` guard parameter.

### Scenario Matrix

#### Multi-Agent Channel

| Trigger       | Thread   | Agent State  | Behavior           |
| ------------- | -------- | ------------ | ------------------ |
| Plain message | New      | -            | LLM selection      |
| @mention      | New      | -            | LLM selection      |
| @mention      | Existing | Assigned     | Use thread's agent |
| @mention      | Existing | Not assigned | LLM selection      |

#### Regular Channel

@mention routes to channel's configured agent.

### Duplicate Handler Prevention

When @mention in multi-agent channel, both handlers would fire. Prevention in `handleMultiAgentChannelMessage`:

```typescript
if (botUserId && event.text?.includes(`<@${botUserId}>`)) {
    return; // Let handleAppMention handle it
}
```

### Slack Visualizations

Query results in Slack (from `ai/tools/runQuery.ts`):

| Type  | Output              |
| ----- | ------------------- |
| Chart | PNG image (echarts) |
| Table | CSV file attachment |
