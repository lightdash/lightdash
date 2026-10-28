# AI Agent Service

## Slack Configuration

### Organization Settings (Integrations → Slack)

| Setting                                                       | Description                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **AI Agents thread access consent** (`aiThreadAccessConsent`) | When enabled, AI can read previous messages in a thread when user @mentions the bot. Provides conversation context. |
| **AI Agents OAuth requirement** (`aiRequireOAuth`)            | Require users to authenticate via OAuth before using AI agents.                                                     |
| **Links only** (`aiLinksOnly`)                                | Never post query results into Slack: no chart images or CSV files, and the prompt forbids values in the reply. Users open results in Lightdash. Pair with data access off on the agent for a strict guarantee. |
| **Multi-agent channel** (`aiMultiAgentChannelId`)             | Designated channel where users can access multiple AI agents.                                                       |

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

| Type              | Output                                                        |
| ----------------- | ------------------------------------------------------------- |
| Chart             | PNG image (echarts)                                           |
| Custom chart type | PNG image (headless artifact export; Lightdash link on failure) |
| Table             | Optional inline `data_table`, selected by the final answer |

Slack final answers default to a summary without supporting tables. To include a useful executed table, the model emits `<slack-table queryUuid="<execution UUID>" />`. Only successful table executions from the current prompt are eligible; the server removes these markers from visible and stored answer text. Unselected semantic table artifacts are omitted from the answer cards when inline data sharing is allowed.

Generated Slack charts are optional too. The final answer selects exact successful chart versions from the current prompt using `<slack-chart versionUuid="<artifact version UUID>" />`. Prefer a single useful chart, and include several when the user requests them or distinct views materially improve the answer. Omit diagnostics, redundant charts and superseded versions. Chart images are deferred until after selection; missing deferred images leave a Lightdash link. Both chart and table markers are removed before persistence and display.

On the composer base, results are hidden until the agent calls `visualize` (`ai/tools/visualize.ts`) with a node in the thread's node registry; each call writes a composer v2 artifact version, or a classic semantic version for a lone semantic-layer node, which Slack shows as a classic card without a marker. Slack uses no markers there: a table version posts as an inline `data_table` from the execution `visualize` ran (`ai/utils/slackTablePreviews.ts`), and a chart version posts a card linking to the thread. For bar, horizontal bar, line, area, scatter, pie and funnel, `visualize` registers a `composer` render input (a `runQuery` one for a classic semantic version) and deferred delivery adds a PNG drawn by the runQuery Slack echarts builders through `getComposerSlackEchartsConfig` (common). A big number posts its formatted first-row value and label as card text, read from the same execution when the answer is built (`ai/utils/slackBigNumbers.ts`); custom types stay link-only. Links-only organizations and data-access-off agents get the link card for tables and charts.
