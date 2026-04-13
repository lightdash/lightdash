# Managed Agent: Self-Improving Project Health Agent

**Date:** 2026-04-13
**Status:** Draft
**Scope:** EE feature

## Overview

A Claude Managed Agent that runs on a configurable schedule (default: every 30 minutes) to monitor project health, manage stale content, detect broken content, surface insights on popular content, and create new charts via content-as-code. Enabled per-project by an admin. All actions are reversible.

## Architecture

### Approach: Hybrid — Agent Drives With a Checklist

A single Managed Agent session per heartbeat. The agent follows a structured checklist (preview projects, stale content, broken content, content creation, insights) but makes judgment calls within each step. Stateless sessions — the action log serves as memory via `get_recent_actions`.

### Flow

```
Graphile Worker cron fires (configurable, default 30min)
    |
    v
EE ManagedAgentTask reads managed_agent_settings
    | (is there an enabled project? if not, return)
    v
ManagedAgentService.runHeartbeat(projectUuid)
    |
    +-- Lazy-create Managed Agent + Environment (cached in memory)
    |
    +-- Create session
    |
    +-- Send user message: "Analyze project {name}"
    |
    +-- Stream events <---------------------------+
    |   |                                         |
    |   +-- agent.message -> log to console       |
    |   |                                         |
    |   +-- agent.custom_tool_use -----+          |
    |   |                              v          |
    |   |                  Tool handler executes   |
    |   |                  (queries DB, soft       |
    |   |                   deletes, writes to     |
    |   |                   action log)            |
    |   |                              |          |
    |   |                  user.custom_tool_result +
    |   |
    |   +-- agent.mcp_tool_use -> handled by Anthropic
    |   |   (MCP calls go directly to Lightdash MCP server)
    |   |
    |   +-- session.status_idle -> done
    |
    v
Log heartbeat completion
```

### Key Files (all EE)

| File | Responsibility |
|------|---------------|
| `packages/backend/src/ee/services/ManagedAgentService.ts` | Orchestrator: reads settings, calls client, executes custom tools |
| `packages/backend/src/ee/clients/ManagedAgentClient.ts` | Anthropic SDK wrapper: agent/env creation, session management, event streaming |
| `packages/backend/src/ee/models/ManagedAgentModel.ts` | DB access: settings CRUD, action log writes/reads, reversal |
| `packages/backend/src/ee/scheduler/managedAgentTask.ts` | Graphile Worker task handler |
| `packages/common/src/ee/types/managedAgent.ts` | Shared types: actions, settings, action type enum |

## Data Model

### `managed_agent_settings` (EE table)

Per-project agent configuration. One row per project.

| Column | Type | Notes |
|--------|------|-------|
| `project_uuid` | uuid PK | FK to projects |
| `enabled` | boolean | default false |
| `schedule_cron` | text | default `*/30 * * * *` |
| `enabled_by_user_uuid` | uuid | who turned it on |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### `managed_agent_actions` (EE table)

Every action the agent takes. Source of truth for the activity feed and reversals.

| Column | Type | Notes |
|--------|------|-------|
| `action_uuid` | uuid PK | |
| `project_uuid` | uuid | FK to projects |
| `session_id` | text | Anthropic session ID, groups actions from one heartbeat |
| `action_type` | text | enum: `flagged_stale`, `soft_deleted`, `flagged_broken`, `created_content`, `insight` |
| `target_type` | text | `chart`, `dashboard`, `space`, `project` |
| `target_uuid` | uuid | UUID of the affected entity |
| `target_name` | text | Denormalized (entity might get deleted later) |
| `description` | text | Agent's human-readable explanation of WHY it took this action |
| `metadata` | jsonb | Action-specific data (e.g., `{ "last_viewed_at": "...", "views_count": 0 }`) |
| `reversed_at` | timestamp | null until reversed |
| `reversed_by_user_uuid` | uuid | who reversed it |
| `created_at` | timestamp | when the action was taken |

The `session_id` groups all actions from a single heartbeat run for the calendar day view ("9:00 AM run: 3 actions taken").

## Tools

### MCP Tools (via Lightdash MCP server)

The Managed Agent connects to the Lightdash MCP server at `{SITE_URL}/api/v1/mcp` using a service account PAT. These tools are read-only and handled by Anthropic's infrastructure directly.

| MCP Tool | Purpose |
|----------|---------|
| `list_explores` | Understand available data models |
| `find_explores` | Semantic search over explores |
| `find_fields` | Find dimensions/metrics in explores |
| `run_metric_query` | Run structured queries to discover insights and validate data |
| `run_sql` | Run raw SQL queries |
| `find_content` | Search existing charts/dashboards |
| `search_field_values` | Look up distinct field values |

### Custom Tools (executed by Lightdash backend)

#### Read Tools

| Tool | Description | Returns |
|------|-------------|---------|
| `get_stale_charts` | Charts not viewed in 3+ months | `[{ uuid, name, space, last_viewed_at, views_count, created_by }]` |
| `get_stale_dashboards` | Dashboards not viewed in 3+ months | Same shape |
| `get_broken_content` | Charts/dashboards with validation errors | `[{ uuid, name, type, errors: [...] }]` |
| `get_preview_projects` | Preview projects older than 3 months | `[{ uuid, name, created_at, copied_from }]` |
| `get_popular_content` | Most viewed content in last 30 days | `[{ uuid, name, type, views_count, unique_viewers, space, is_pinned }]` |
| `get_recent_actions` | Last N actions taken by the agent on this project | `[{ action_uuid, action_type, target_name, description, created_at }]` |

#### Write Tools

| Tool | Description | Reversible? |
|------|-------------|-------------|
| `flag_content` | Mark content as stale/broken/preview in the action log | Dismiss flag |
| `soft_delete_content` | Soft-delete a chart or dashboard | Restore via existing infra |
| `log_insight` | Record an observation about popular content | Dismiss |
| `create_content_from_code` | Takes chart-as-code JSON, validates against schema, creates via CoderService into "Agent Suggestions" space | Delete created content |

Every write tool writes to `managed_agent_actions` before (or atomically with) the mutation.

### Server-Side Safety Rails

Enforced in the `soft_delete_content` tool handler regardless of what the agent decides:

- Reject soft-delete of content created in the last 7 days
- Reject soft-delete if the chart is the only chart on a dashboard

## Content Creation via Content-as-Code

The agent creates charts by writing chart-as-code JSON validated against the existing schema.

### Flow

1. Agent calls MCP `find_explores` and `find_fields` to understand the data model
2. Agent calls MCP `run_metric_query` to validate the data is interesting
3. Agent writes chart-as-code JSON in the Managed Agent container filesystem
4. Agent calls custom tool `create_content_from_code` with the JSON
5. Backend validates JSON against chart-as-code schema
6. Backend creates chart via CoderService (same path as `lightdash upload`)
7. Chart is placed in a dedicated "Agent Suggestions" space
8. Action logged to `managed_agent_actions` with `action_type: 'created_content'`

All created content lives in a single "Agent Suggestions" space per project, auto-created on the first content creation if it doesn't exist. This makes it easy to review and bulk-manage agent-created content separately from human-created content.

## Agent Configuration

### Managed Agent Definition

Created lazily on first heartbeat, cached in memory, reused across sessions.

```typescript
const agent = await client.beta.agents.create({
    name: 'Lightdash Project Health Agent',
    model: 'claude-sonnet-4-6',
    system: SYSTEM_PROMPT,  // structured checklist (see below)
    mcp_servers: [{
        type: 'url',
        url: `${siteUrl}/api/v1/mcp`,
        authorization_token: serviceAccountPat,
    }],
    tools: [
        { type: 'agent_toolset_20260401' },
        // ... custom tool definitions
    ],
});
```

### System Prompt (Structured Checklist)

```
You are a Lightdash project health agent. You run on a schedule to keep
this project clean and useful.

## Rules
- ALWAYS explain WHY you're taking an action in the description field
- NEVER soft-delete content created in the last 7 days, regardless of view count
- NEVER soft-delete content if it's the only chart on a dashboard
- Prefer flagging over deleting when in doubt
- For insights, only surface actionable observations
- Check get_recent_actions first to avoid repeating yourself
- Escalate: if you flagged something 3+ runs ago and it hasn't been reversed, consider soft-deleting

## Checklist (follow in order)

### 0. Context
Call get_recent_actions to understand what you've already done.
Don't re-flag content you've already flagged. Escalate flagged content
that's been ignored for 3+ runs.

### 1. Preview Project Cleanup
Call get_preview_projects. Flag any older than 3 months.

### 2. Stale Content Detection
Call get_stale_charts and get_stale_dashboards.
- Content with 0 views ever -> soft_delete_content
- Content with some views but none in 3+ months -> flag_content
Include last_viewed_at and views_count in the description.

### 3. Broken Content
Call get_broken_content. Flag all broken content with the specific errors.

### 4. Content Creation
Use the MCP tools to explore the data model. If you identify clear gaps
(popular dimensions with no chart, commonly queried metrics with no
visualization), create charts using create_content_from_code.
Only create content when there's a clear need. Quality over quantity.

### 5. Insights
Call get_popular_content.
- Surface content that is popular but not pinned
- Surface content with high views but restricted access (private space)
- If nothing noteworthy, skip this step
```

## Reversibility

Every action the agent takes is reversible.

| Action Type | Reverse Operation | Mechanism |
|-------------|------------------|-----------|
| `soft_deleted` | Restore | Existing restore infra — clears `deleted_at`/`deleted_by` |
| `flagged_stale` | Dismiss flag | Sets `reversed_at` on the action row |
| `flagged_broken` | Dismiss flag | Sets `reversed_at` on the action row |
| `created_content` | Delete content | Deletes the chart/dashboard created by the agent |
| `insight` | Dismiss | Sets `reversed_at` on the action row |

Preview project deletion is flag-only — the agent flags old preview projects but never deletes them. Admin decides.

## Configuration

### Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `MANAGED_AGENT_ENABLED` | `false` | Global kill switch |
| `ANTHROPIC_API_KEY` | (required) | API key for Managed Agents |
| `MANAGED_AGENT_SCHEDULE` | `*/30 * * * *` | Default cron for new projects |

### Per-Project Settings

Stored in `managed_agent_settings`. Admins toggle via project settings UI. The schedule is configurable per-project.

### MCP Authentication

The agent authenticates to the Lightdash MCP server using a service account PAT. The service account needs project-level permissions to read explores, run queries, and access content.

## Activity Feed

The activity feed is powered by `managed_agent_actions`. The UI presents a calendar day view grouped by session (heartbeat run).

### Data needed for the UI

- **Calendar day view:** `created_at` grouped by date, then by `session_id` within each day
- **Action sections:** `action_type` for grouping/filtering (stale, broken, insights, created)
- **Reverse button:** `reversed_at IS NULL` determines if the action is reversible
- **Details:** `description` (agent's reasoning), `metadata` (stats), `target_name` + `target_type` (link to content)
- **Session summary:** count of actions per `session_id`, time range per session

### API Endpoints (EE)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/projects/{uuid}/managed-agent/settings` | Get agent settings |
| `PATCH /api/v1/projects/{uuid}/managed-agent/settings` | Update agent settings (enable/disable, schedule) |
| `GET /api/v1/projects/{uuid}/managed-agent/actions` | List actions, filterable by date, type, session |
| `POST /api/v1/projects/{uuid}/managed-agent/actions/{actionUuid}/reverse` | Reverse an action |

## Rate Limits and Cost

- Managed Agents API: 60 creates/min per org (one session per heartbeat is well within limits)
- Model: Claude Sonnet 4.6 (~$3/MTok input, $15/MTok output)
- Each heartbeat session: estimated 5-20 tool calls, ~10K-50K tokens depending on project size
- At 30-min intervals: ~48 sessions/day per project, estimated $1-5/day per project

## Future Considerations (not in v1)

- Multi-project support (one session per project per heartbeat)
- Dashboard creation (not just charts)
- Admin approval workflow for destructive actions
- Configurable stale thresholds (not hardcoded 3 months)
- Agent creating explores or modifying dbt YAML
- Slack notifications when agent takes actions
