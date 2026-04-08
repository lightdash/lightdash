# Slack AI Agent Integration

This document explains how AI agents work in Slack and clarifies common misconceptions about agent mentioning behavior.

## Architecture Overview

The Slack AI agent integration uses a **single Slack bot architecture** with intelligent agent routing.

### Key Concepts

1. **One Bot, Multiple Agents**
   - There is only ONE Slack bot installed per organization (the Lightdash app)
   - Users always mention the main Lightdash bot (e.g., `@lightdash`) to interact with AI agents
   - Individual agent names (like "Sales Agent" or "Marketing Agent") are NOT separate Slack bots

2. **Agent Names as Display Names**
   - Custom agent names appear as the `username` in Slack responses
   - They are NOT separate mentionable Slack users
   - Users cannot mention `@SalesAgent` or `@MarketingAgent` directly
   - This is a limitation of Slack's bot architecture - only bots with OAuth credentials can be mentioned

3. **Intelligent Routing**
   - An LLM-based system automatically selects the appropriate agent based on:
     - Agent description and custom instructions
     - Data access (which explores/tables the agent can query)
     - Verified questions (past successful queries)
     - The content of the user's question

## User Interaction Patterns

### Regular Channel Mode (Single Agent)

In standard channels:
- User mentions `@lightdash` with their question
- System routes to the single configured agent for the organization
- Agent name appears as the display name in the response

**Example:**
```
User: @lightdash what were our Q4 sales?
Bot Response: (appears as "Sales Agent")
```

### Multi-Agent Channel Mode

In channels designated as multi-agent channels (via `aiMultiAgentChannelId` setting):

#### New Threads
Users have two options:
1. Mention `@lightdash` with their question
2. Post a plain message (no mention required)

In both cases:
- AI automatically selects the most appropriate agent
- A confirmation message shows which agent was selected
- The thread continues with that agent

**Example:**
```
User: What were our Q4 sales?
Bot: I've selected "Sales Agent" to help with this question.
Bot Response: (appears as "Sales Agent")
```

#### Existing Threads
- User mentions `@lightdash` to continue the conversation
- Thread maintains consistency with the originally selected agent
- Agent cannot change mid-thread

## Implementation Details

### Event Handlers

#### `app_mention` Event
- Triggered when users mention `@lightdash`
- Handles both single-agent and multi-agent scenarios
- For multi-agent new threads: performs agent selection
- For existing threads: continues with assigned agent

See: `CommercialSlackService.setupEventListeners()` and `AiAgentService.handleAppMention()`

#### `message` Event
- Only active in the channel specified by `aiMultiAgentChannelId`
- Processes plain messages (without @mention) for new threads only
- Skips messages with @lightdash mention (handled by app_mention)
- Skips threaded replies (must use @lightdash to continue threads)

See: `AiAgentService.handleMultiAgentChannelMessage()`

### Agent Selection Logic

The system uses `selectBestAgentWithContext()` to intelligently route queries:

1. **Context Gathering**: Collects agent summaries including:
   - Agent name and description
   - Custom instructions
   - Available explores and tables
   - Verified questions from past interactions

2. **LLM Selection**: Uses an LLM to analyze the user's question and select the best agent

3. **Confidence Levels**:
   - **High confidence**: Auto-selects agent and proceeds
   - **Medium confidence**: Auto-selects but indicates uncertainty
   - **Low confidence**: Prompts user to manually select from available agents

4. **Manual Selection**: If confidence is low, presents interactive buttons for agent selection

See: `packages/backend/src/ee/services/ai/agents/agentSelector.ts`

## Why This Design?

### Technical Constraints
1. **Slack Bot Architecture**: Each mentionable bot requires separate OAuth credentials and installation
2. **Bot Proliferation**: Installing separate Slack bots for each agent would be complex to manage
3. **Dynamic Agent Creation**: Organizations can create/modify agents without reconfiguring Slack

### Benefits
1. **Centralized Management**: One bot simplifies permissions, scopes, and configuration
2. **Intelligent Routing**: LLM-based selection can make smarter decisions than manual tagging
3. **Flexible Configuration**: Agents can be added, removed, or modified without Slack changes
4. **Better User Experience**: In multi-agent channels, users don't need to know which agent to use

## Common Misconceptions

### ❌ Incorrect Understanding
> "I should be able to mention `@SalesAgent` to trigger the Sales Agent"

**Why this doesn't work:**
- "Sales Agent" is a display name, not a Slack bot
- Only the main Lightdash bot has OAuth credentials and can be mentioned
- Slack does not support dynamic bot name aliases

### ✅ Correct Understanding
> "I mention `@lightdash` and the system intelligently routes to the appropriate agent"

**This is the designed behavior:**
- Users mention the Lightdash bot
- System selects the appropriate agent automatically
- Agent name appears in the response for clarity

## Configuration

### Single Agent Setup
Set `aiAgentUuid` in Slack settings to specify the default agent for the organization.

### Multi-Agent Setup
1. Set `aiMultiAgentChannelId` to designate a channel for multi-agent conversations
2. Optionally set `aiMultiAgentProjectUuids` to limit agent selection to specific projects
3. Users can interact via `@lightdash` mention or plain messages (for new threads)

## Troubleshooting

### "Agent not responding to custom name mentions"
**Expected behavior.** Users must mention `@lightdash`, not individual agent names.

### "Wrong agent is selected"
The selection is based on LLM analysis. To improve accuracy:
- Add more specific agent descriptions
- Add custom instructions to guide agent selection
- Create verified questions for common use cases
- Review agent data access (explores/tables)

### "User wants to switch agents mid-thread"
Currently not supported. Each thread is tied to one agent for consistency. Start a new thread to use a different agent.

## Code References

- Single bot setup: `packages/backend/src/ee/services/SlackService/SlackService.ts`
- App mention handler: `packages/backend/src/ee/services/AiAgentService/AiAgentService.ts:5052+`
- Multi-agent message handler: `packages/backend/src/ee/services/AiAgentService/AiAgentService.ts:4322+`
- Agent selection logic: `packages/backend/src/ee/services/ai/agents/agentSelector.ts:70-143`
- Display name usage: `packages/backend/src/ee/services/AiAgentService/AiAgentService.ts:3412, 4196, 4276`
