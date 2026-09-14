import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents';
import {
    assertUnreachable,
    DEFAULT_MANAGED_AGENT_POLICY,
    resolveManagedAgentPolicy,
    type ManagedAgentPolicy,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { produce } from 'immer';

export type ManagedAgentPromptOptions = {
    preAggregatesEnabled?: boolean;
};

// Tail sections number themselves so a conditional section (pre-aggregates)
// does not force renumbering every section after it.
const buildChecklistTailSections = (
    options: ManagedAgentPromptOptions,
): string => {
    const sections: Array<{ title: string; body: string }> = [
        {
            title: 'AI Agent Usage',
            body: `Call get_unused_agents. Reporting-only: record what you find with log_insight and NEVER delete, disable, or edit an agent.
- Lead with the reason field. never_used, no_recent_use, only_failed_sessions and low_traffic call for different advice, so do not blur them into "unused"
- Use routing_signal to say why traffic may not be arriving: never_a_candidate and candidate_never_suggested point at the agent's name, description and tags rather than at the agent being unwanted; suggested_never_chosen means users are overriding the router
- only_failed_sessions is a reliability problem, not a popularity one. Say so, and never suggest retiring an agent on that basis
- An admin_only agent has a small audience by design; do not read its low traffic as a discoverability problem
- If it returns nothing, skip this step`,
        },
        ...(options.preAggregatesEnabled
            ? [
                  {
                      title: 'Pre-Aggregate Candidates',
                      body: `Call get_preagg_candidates. Reporting-only: record findings with log_insight and NEVER write dbt files or change project configuration.
- Each candidate includes a suggested_yaml block already validated against this project's semantic layer. Quote it verbatim in your insight; never invent or edit pre-aggregate YAML yourself
- Lead with the cost story: total_warehouse_ms and query_count say how much warehouse time is at stake, and covered_query_count out of coverable_query_count says how much of the observed traffic the suggestion actually serves
- preagg_misses_by_reason distinguishes explores with no pre-aggregate from pre-aggregates that keep missing. dimension_not_in_pre_aggregate and metric_not_in_pre_aggregate mean an EXISTING pre-aggregate should be extended, not a new one added
- ineligible_fields can never be pre-aggregated (non-additive metrics, custom SQL, user attributes). Mention them so admins understand the coverage gap; do not propose workarounds
- Tell admins to check the materialized row count before adopting a suggestion: high-cardinality dimensions can exceed the recommended 1,000,000 row threshold. Suggest max_rows or filters when that risk looks real
- If it returns nothing, skip this step`,
                  },
              ]
            : []),
        {
            title: 'Insights',
            body: `Call get_popular_content.
- Surface content that is popular but not pinned
- Surface content with high views but restricted access (private space)
- If nothing noteworthy, skip this step`,
        },
        {
            title: 'Slack Summary',
            body: `After the run is complete, call write_slack_summary exactly once with the final summary you want posted to Slack. Use the "lightdash-agent-slack-messaging" skill to match Lightdash's Slack tone of voice`,
        },
    ];

    return sections
        .map(
            (section, index) =>
                `### ${index + 6}. ${section.title}\n${section.body}`,
        )
        .join('\n\n');
};

export const buildManagedAgentSystemPrompt = (
    policy: ManagedAgentPolicy,
    options: ManagedAgentPromptOptions = {},
): string => {
    const {
        stalenessChartDays,
        stalenessDashboardDays,
        previewProjectDays,
        slowQueryThresholdMs,
        protectRecentDays,
        escalationHours,
        aggression,
        audience,
        verifiedContent,
    } = policy;

    const aggressionRules = (() => {
        switch (aggression) {
            case 'observe':
                return '- OBSERVE MODE: this project is configured for observation only. Record findings with log_insight; NEVER flag or soft-delete content';
            case 'flag':
                return '- FLAG-ONLY MODE: this project is configured to flag, not delete. Flag stale or broken content; NEVER soft-delete it';
            case 'cleanup':
                return `- Prefer flagging over deleting when in doubt\n- Escalate: if you flagged something more than ${escalationHours} hours ago and it hasn't been reversed or dismissed, consider soft-deleting`;
            default:
                return assertUnreachable(
                    aggression,
                    `Unknown aggression level: ${aggression}`,
                );
        }
    })();

    const escalationChecklistLine =
        aggression === 'cleanup'
            ? ` Escalate flagged content that's been ignored for ${escalationHours}+ hours.`
            : '';

    const previewStep = (() => {
        switch (aggression) {
            case 'observe':
                return `Call get_preview_projects. It only returns preview projects older than ${previewProjectDays} days per project policy. Record them with log_insight.`;
            case 'flag':
            case 'cleanup':
                return `Call get_preview_projects. It only returns preview projects older than ${previewProjectDays} days per project policy. Flag them.`;
            default:
                return assertUnreachable(
                    aggression,
                    `Unknown aggression level: ${aggression}`,
                );
        }
    })();

    const staleStep = (() => {
        const intro = `Call get_stale_charts and get_stale_dashboards. They only return content that is already stale per this project's policy (charts: ${stalenessChartDays} days, dashboards: ${stalenessDashboardDays} days without views). Each row includes a reason field.`;
        switch (aggression) {
            case 'observe':
                return `${intro}\nRecord notable staleness patterns with log_insight. Do NOT flag or delete anything.`;
            case 'flag':
                return `${intro}\n- Any reason → flag_content\n- Content YOU created (slug starts with "agent-") → NEVER flag\nInclude last_viewed_at, views_count, and created_at in the description.`;
            case 'cleanup':
                return `${intro}\n- First sighting of a stale item (any reason) → flag_content; NEVER delete on first sight\n- Items you flagged more than ${escalationHours} hours ago that were not reversed or dismissed → soft_delete_content\n- Content YOU created (slug starts with "agent-") → NEVER flag or delete\n- Max 25 individual soft-deletes per run. When the cap is reached, flag the remaining candidates and report the backlog in your summary instead of deleting\nInclude last_viewed_at, views_count, and created_at in the description.`;
            default:
                return assertUnreachable(
                    aggression,
                    `Unknown aggression level: ${aggression}`,
                );
        }
    })();

    const brokenFallback =
        aggression === 'observe'
            ? 'record an insight instead'
            : 'flag it instead';

    return `You are Autopilot, a Lightdash project health agent. You run on a schedule to keep this project clean and useful.

## Skills

You have the **"Developing in Lightdash"** skill attached. Use it when creating or fixing charts:
- It contains the full chart-as-code YAML reference, chart type guide, and field ID conventions
- When creating charts via create_content_from_code, follow the YAML structure from the skill (sorted keys, correct chartConfig.type, contentType:        chart)
- When fixing broken charts via fix_broken_chart, reference the skill for valid metricQuery and chartConfig shapes
- CRITICAL: chartConfig.type must be "cartesian" for line/bar/area/scatter charts. Never use "line" or "bar"

## Project policy

This project's admin has configured the following policy. It is enforced by your tools; respect it in your reasoning and descriptions:
- Stale charts: not viewed in ${stalenessChartDays}+ days. Stale dashboards: not viewed in ${stalenessDashboardDays}+ days
- Content created or edited in the last ${protectRecentDays} days is protected: never flag or delete it
- Old preview projects: ${previewProjectDays}+ days
- Slow queries: ${slowQueryThresholdMs}+ ms warehouse execution time
- Cleanup mode: ${aggression}
- Audience: ${audience === 'admins' ? 'admin-only (your suggestions space is restricted to admins)' : 'everyone (your suggestions are visible to all project users)'}
- Verified content: ${verifiedContent === 'protected' ? 'protected. You may report on it with log_insight but NEVER flag, fix, or delete it' : 'treated like any other content'}

## Rules
- ALWAYS explain WHY you're taking an action in the description field
- NEVER be judgemental about the project, its maintainers, or how it has been maintained; keep observations factual, neutral, and actionable
- NEVER flag or soft-delete content created or edited in the last ${protectRecentDays} days, regardless of view count
- NEVER flag or soft-delete content that YOU created (check get_recent_actions for created_content actions, or if the slug starts with "agent-")
- NEVER soft-delete content if it's the only chart on a dashboard
- For insights, only surface actionable observations
- Check get_recent_actions first to avoid repeating yourself
- Admins may exclude spaces or content from your scope. Your tools already filter them out; NEVER act on or report about content your tools did not return
${aggressionRules}

## Checklist (follow in order)

### 0. Context & Recovery
Call get_recent_actions to understand what you've already done.
Don't re-flag content you've already flagged.${escalationChecklistLine}

**Recovery check:** Review your recent soft_deleted and flagged_stale actions. If you see any that were WRONG (for example, content you created with a slug starting with "agent-" that you then flagged/deleted, or content created or edited less than ${protectRecentDays} days ago), use reverse_own_action to fix your mistakes before proceeding.

### 1. Preview Project Cleanup
${previewStep}

### 2. Stale Content Detection
${staleStep}

### 3. Broken Content
Call get_broken_content. It returns the complete set of validation error groups, one per root cause, so start by triaging groups, not individual charts:
- Always log_insight a short summary of the full backlog first (total errors, affected items, and the biggest groups), so admins see the whole picture even when you only fix a few items
- A group whose model no longer exists means every chart in it is broken for the same reason. Call get_broken_content with that table_name to list all affected content. When bulk_delete_broken_content is available, use it to clean up all charts on that deleted model in one call; flag affected dashboards instead of deleting them
- For renamed or replaced fields, fix charts individually: call get_chart_details to understand the current state, then use fix_broken_chart when the fix is clear (removed field has an obvious replacement, or invalid fields can be dropped without changing the chart's purpose)
- If the fix is ambiguous or would change what the chart shows, ${brokenFallback}
- Reference the "Developing in Lightdash" skill for valid metricQuery and chartConfig structure

### 4. Content Suggestions (demand-driven)
Create charts when there's a clear signal: user demand or content gaps.

**Demand-driven creation:** Call get_user_questions to see what users have been asking the AI assistant. If users repeatedly ask about a topic that doesn't have a saved chart, create one. This is the strongest signal for what charts to build.

Also create when you notice a gap:
- If you soft-deleted or fixed a chart, consider whether a replacement would help
- If get_popular_content shows heavy use of an explore with few charts, suggest one
- If a broken chart was unfixable, create a simpler replacement
- If the project is quite empty, create useful starter charts

When creating, use create_content_from_code:
1. Call get_user_questions to see what users are asking about
2. Call get_chart_schema for the exact JSON format
3. The MCP connection is already pinned to this project. Use MCP tools (list_explores, find_fields) to discover the data model. Do not attempt to switch projects
4. Use find_content (MCP) to check if a chart already exists for the topic
5. Call run_metric_query to validate the data before creating
6. Prefix slugs with "agent-" to identify agent-created content
7. Place all charts in the "Agent Suggestions" space for admin review

CRITICAL: chartConfig.type must be "cartesian" (for line/bar/area), "table", "big_number", or "pie". Do NOT use "line" or "bar" as the type.

Max 3 charts per run. Skip if nothing warrants creation.

### 5. People & Ownership
Call get_inactive_users and get_orphaned_content. Both are reporting-only: record what you find with log_insight and NEVER flag, delete, or otherwise act on a person or their content.
- Inactive users: group by how long they've been quiet and say which signal you used. Frame it as a seat and ownership review for admins, never as a judgement about the person
- Orphaned content: group by former owner so admins can reassign in one pass. Leaving the company does not make content stale, so do not recommend deletion on those grounds alone
- If either returns nothing, say so briefly or skip

${buildChecklistTailSections(options)}
`;
};

export const managedAgentConfig: AgentCreateParams = {
    name: 'Lightdash Autopilot Agent',
    description: null,
    model: {
        id: 'claude-opus-4-6',
        speed: 'standard',
    },
    system: buildManagedAgentSystemPrompt(DEFAULT_MANAGED_AGENT_POLICY),
    mcp_servers: [],
    metadata: {},
    skills: [],
    tools: [
        {
            configs: [
                {
                    enabled: true,
                    name: 'read',
                    permission_policy: {
                        type: 'always_allow',
                    },
                },
                {
                    enabled: true,
                    name: 'write',
                    permission_policy: {
                        type: 'always_allow',
                    },
                },
            ],
            default_config: {
                enabled: false,
                permission_policy: {
                    type: 'always_allow',
                },
            },
            type: 'agent_toolset_20260401',
        },
        {
            configs: [],
            default_config: {
                enabled: true,
                permission_policy: {
                    type: 'always_allow',
                },
            },
            mcp_server_name: 'lightdash',
            type: 'mcp_toolset',
        },
        {
            description:
                'Get the most recent actions taken by this agent on the project. Call this first to understand what you have already done in previous runs and avoid repeating yourself.',
            input_schema: {
                properties: {
                    limit: {
                        description: 'Max actions to return (default 50)',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_recent_actions',
            type: 'custom',
        },
        {
            description:
                'Get charts that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
            input_schema: {
                properties: {},
                required: [],
                type: 'object',
            },
            name: 'get_stale_charts',
            type: 'custom',
        },
        {
            description:
                'Get dashboards that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
            input_schema: {
                properties: {},
                required: [],
                type: 'object',
            },
            name: 'get_stale_dashboards',
            type: 'custom',
        },
        {
            description:
                'Get validation errors grouped by root cause (e.g. one group per deleted model). Without arguments, returns the COMPLETE set of groups with counts and a capped sample of affected content per group. Pass table_name to list every broken item caused by that model.',
            input_schema: {
                properties: {
                    limit: {
                        description:
                            'Max items to return in table_name detail mode',
                        type: 'number',
                    },
                    table_name: {
                        description:
                            'Root-cause model name from a summary group; switches to detail mode listing all affected content for that model',
                        type: 'string',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_broken_content',
            type: 'custom',
        },
        {
            description:
                'Get preview projects older than 3 months. Returns uuid, name, created_at, and the project they were copied from.',
            input_schema: {
                properties: {},
                required: [],
                type: 'object',
            },
            name: 'get_preview_projects',
            type: 'custom',
        },
        {
            description:
                'Get the most viewed charts and dashboards in the last 30 days. Returns uuid, name, type, views_count, unique_viewers, space name, and whether it is pinned.',
            input_schema: {
                properties: {},
                required: [],
                type: 'object',
            },
            name: 'get_popular_content',
            type: 'custom',
        },
        {
            description:
                'Flag a chart, dashboard, or project in the action log. Does NOT delete or modify the content, only records an observation. Use for stale content, broken content, or old preview projects. Idempotent: flagging an already-flagged target returns the existing flag without creating a duplicate, and deleted targets are skipped — so never re-flag a list you have already processed this run.',
            input_schema: {
                properties: {
                    description: {
                        description:
                            'Human-readable explanation of WHY you are flagging this content',
                        type: 'string',
                    },
                    flag_type: {
                        description: 'Why this content is being flagged',
                        enum: ['flagged_stale', 'flagged_broken'],
                        type: 'string',
                    },
                    metadata: {
                        description:
                            'Additional data (e.g., last_viewed_at, views_count, errors)',
                        type: 'object',
                    },
                    target_name: {
                        description: 'Name of the content',
                        type: 'string',
                    },
                    target_type: {
                        description: 'Type of content',
                        enum: ['chart', 'dashboard', 'project'],
                        type: 'string',
                    },
                    target_uuid: {
                        description: 'UUID of the content to flag',
                        type: 'string',
                    },
                },
                required: [
                    'target_uuid',
                    'target_type',
                    'target_name',
                    'flag_type',
                    'description',
                ],
                type: 'object',
            },
            name: 'flag_content',
            type: 'custom',
        },
        {
            description:
                'Soft-delete a chart or dashboard. The content can be restored by an admin. Only usable on content that was flagged more than the escalation window ago and not dismissed; unflagged content is blocked, so flag_content it first. Do NOT use for content created in the last 30 days. Do NOT use for agent-created content (slug starts with agent-). Do NOT use if the chart is the only chart on a dashboard. At most 25 individual soft-deletes are allowed per run; further calls are blocked, so flag the remainder instead.',
            input_schema: {
                properties: {
                    description: {
                        description:
                            'Human-readable explanation of WHY you are deleting this content',
                        type: 'string',
                    },
                    metadata: {
                        description:
                            'Additional data (e.g., last_viewed_at, views_count)',
                        type: 'object',
                    },
                    target_name: {
                        description: 'Name of the content',
                        type: 'string',
                    },
                    target_type: {
                        description: 'Type of content',
                        enum: ['chart', 'dashboard'],
                        type: 'string',
                    },
                    target_uuid: {
                        description: 'UUID of the chart or dashboard',
                        type: 'string',
                    },
                },
                required: [
                    'target_uuid',
                    'target_type',
                    'target_name',
                    'description',
                ],
                type: 'object',
            },
            name: 'soft_delete_content',
            type: 'custom',
        },
        {
            description:
                'Soft-delete every chart whose underlying model was deleted, in one call. Only use when get_broken_content shows a model-level group (the whole model no longer exists). Charts are individually recoverable; dashboards referencing the model are never deleted by this tool, flag them instead. Deletes at most 25 charts per call and reports the remainder. Per-chart guardrails still apply and skipped charts are reported with reasons.',
            input_schema: {
                properties: {
                    reason: {
                        description:
                            'Human-readable explanation of WHY this cleanup is safe (e.g. which model was removed and when)',
                        type: 'string',
                    },
                    table_name: {
                        description:
                            'The deleted model name, exactly as returned by get_broken_content',
                        type: 'string',
                    },
                },
                required: ['table_name', 'reason'],
                type: 'object',
            },
            name: 'bulk_delete_broken_content',
            type: 'custom',
        },
        {
            description:
                'Log an actionable observation about popular content. For example: a chart is very popular but not pinned, or popular content is in a private space with limited access.',
            input_schema: {
                properties: {
                    description: {
                        description:
                            'The insight: what is noteworthy and what should the admin consider doing',
                        type: 'string',
                    },
                    metadata: {
                        description:
                            'Supporting data (e.g., views_count, unique_viewers, space_name)',
                        type: 'object',
                    },
                    target_name: {
                        description: 'Name of the content',
                        type: 'string',
                    },
                    target_type: {
                        description: 'Type of content',
                        enum: ['chart', 'dashboard'],
                        type: 'string',
                    },
                    target_uuid: {
                        description: 'UUID of the content',
                        type: 'string',
                    },
                },
                required: [
                    'target_uuid',
                    'target_type',
                    'target_name',
                    'description',
                ],
                type: 'object',
            },
            name: 'log_insight',
            type: 'custom',
        },
        {
            description:
                'Get the full details of a chart including its metricQuery, chartConfig, and tableName. Use this to understand a chart before fixing it.',
            input_schema: {
                properties: {
                    chart_uuid: {
                        description: 'UUID of the chart',
                        type: 'string',
                    },
                },
                required: ['chart_uuid'],
                type: 'object',
            },
            name: 'get_chart_details',
            type: 'custom',
        },
        {
            description:
                'Fix a broken chart by updating its metricQuery and/or chartConfig. Provide the chart UUID and the corrected metricQuery and chartConfig objects. This creates a new version of the chart (the old version is preserved in history).',
            input_schema: {
                properties: {
                    chart_config: {
                        description:
                            'The corrected chartConfig object. Remove references to fields that no longer exist.',
                        type: 'object',
                    },
                    chart_name: {
                        description: 'Name of the chart (for logging)',
                        type: 'string',
                    },
                    chart_uuid: {
                        description: 'UUID of the chart to fix',
                        type: 'string',
                    },
                    description: {
                        description: 'What was wrong and what you fixed',
                        type: 'string',
                    },
                    metric_query: {
                        description:
                            'The corrected metricQuery object. Remove invalid field references.',
                        type: 'object',
                    },
                    table_config: {
                        description:
                            'The corrected tableConfig object (optional).',
                        type: 'object',
                    },
                },
                required: [
                    'chart_uuid',
                    'chart_name',
                    'metric_query',
                    'chart_config',
                    'description',
                ],
                type: 'object',
            },
            name: 'fix_broken_chart',
            type: 'custom',
        },
        {
            description:
                'Get the chart-as-code JSON schema. Call this BEFORE creating any charts to understand the exact format required. The schema defines all valid field types, chart config types, and metric query structure.',
            input_schema: {
                properties: {},
                required: [],
                type: 'object',
            },
            name: 'get_chart_schema',
            type: 'custom',
        },
        {
            description:
                'Create a new chart from a chart-as-code JSON definition. IMPORTANT: Call get_chart_schema first to understand the format. The chart will be placed in a "Dash Suggestions" space for admin review. Use MCP tools to explore the data model and validate with run_metric_query before creating.',
            input_schema: {
                properties: {
                    chart_as_code: {
                        description:
                            'The full chart-as-code JSON definition. Must match the schema from get_chart_schema. Key: chartConfig.type must be "cartesian" for line/bar/area charts, "table" for tables, "big_number" for big numbers, "pie" for pie charts.',
                        type: 'object',
                    },
                    description: {
                        description:
                            'Why this chart is useful and what gap it fills',
                        type: 'string',
                    },
                },
                required: ['chart_as_code', 'description'],
                type: 'object',
            },
            name: 'create_content_from_code',
            type: 'custom',
        },
        {
            description:
                'Get recent questions users have asked the AI assistant. Use this to understand what users are looking for and create charts that answer common questions. Returns the prompt text, who asked it, and when.',
            input_schema: {
                properties: {
                    days: {
                        description: 'Look back this many days (default 30)',
                        type: 'number',
                    },
                    limit: {
                        description: 'Max questions to return (default 30)',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_user_questions',
            type: 'custom',
        },
        {
            description:
                'Reverse a previous action you took that was incorrect. Use this to restore content you wrongly soft-deleted, or dismiss flags you wrongly applied. For example if you deleted a chart that was created less than 30 days ago, or flagged your own agent-created content as stale, reverse it. Check get_recent_actions to find the action_uuid.',
            input_schema: {
                properties: {
                    action_uuid: {
                        description:
                            'UUID of the action to reverse (from get_recent_actions)',
                        type: 'string',
                    },
                    reason: {
                        description:
                            'Why this action was incorrect and should be reversed',
                        type: 'string',
                    },
                },
                required: ['action_uuid', 'reason'],
                type: 'object',
            },
            name: 'reverse_own_action',
            type: 'custom',
        },
        {
            description:
                'Get the slowest warehouse queries in the project from the last 30 days. Returns the chart or dashboard name, execution time in ms, query context, and when it ran. Use this to flag charts or dashboards with consistently slow queries so admins can optimize them.',
            input_schema: {
                properties: {
                    limit: {
                        description: 'Max results to return (default 20)',
                        type: 'number',
                    },
                    threshold_ms: {
                        description:
                            'Minimum execution time in ms to consider slow (default 2000)',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_slow_queries',
            type: 'custom',
        },
        {
            description:
                'Get users with access to this project who have shown no activity in it recently. Activity means viewing a chart, viewing a dashboard, or running a query. Returns user_uuid, name, email, role, last_active_at, and last_active_source (the signal the decision was based on), oldest first. Reporting only: never flag or delete anything based on this.',
            input_schema: {
                properties: {
                    inactive_days: {
                        description:
                            'Days without activity before a user counts as inactive (default 90)',
                        type: 'number',
                    },
                    limit: {
                        description: 'Max users to return (default 30)',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_inactive_users',
            type: 'custom',
        },
        {
            description:
                "Get charts and dashboards in this project whose owner is deactivated or has left the organization. Owner means a chart's last editor and a dashboard's original author. Returns content_type, uuid, name, space, owner name, owner_status, and last_viewed_at, grouped by owner. Reporting only: content is not stale just because its owner left, so never flag or delete based on this.",
            input_schema: {
                properties: {
                    limit: {
                        description: 'Max items to return (default 30)',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_orphaned_content',
            type: 'custom',
        },
        {
            description:
                'Get AI agents in this project that are getting little or no traffic. Traffic is counted as user prompts, so an opened conversation nobody spoke in does not count as use. Agents created inside the window and the auto-provisioned system agent are excluded. Returns name, reason (never_used, no_recent_use, only_failed_sessions, low_traffic), routing_signal (router_disabled, never_a_candidate, candidate_never_suggested, suggested_never_chosen, routed), last_used_at, prompt and thread counts, and router counts. Reporting only: never delete or disable an agent based on this.',
            input_schema: {
                properties: {
                    limit: {
                        description: 'Max agents to return (default 30)',
                        type: 'number',
                    },
                    min_prompts: {
                        description:
                            'Prompts in the window below which an agent counts as low traffic (default 5)',
                        type: 'number',
                    },
                    window_days: {
                        description:
                            'Days of activity to look at (default 30). Agents younger than this are excluded',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_unused_agents',
            type: 'custom',
        },
        {
            description:
                'Get explores where users burn warehouse time on repeated queries that a pre-aggregate could serve. Ranks explores by total warehouse execution time over the window, with the most common query shapes, existing pre-aggregate hit/miss stats by miss reason, and a suggested pre_aggregates YAML definition that has been validated against the project semantic layer. Queries already served by a pre-aggregate are excluded from the ranking. Reporting only: propose the YAML to admins via log_insight, never write dbt files.',
            input_schema: {
                properties: {
                    limit: {
                        description:
                            'Max candidate explores to return (default 10)',
                        type: 'number',
                    },
                    min_queries: {
                        description:
                            'Minimum warehouse queries in the window for an explore to qualify (default 10)',
                        type: 'number',
                    },
                    window_days: {
                        description:
                            'Days of query history to analyze (default 30)',
                        type: 'number',
                    },
                },
                required: [],
                type: 'object',
            },
            name: 'get_preagg_candidates',
            type: 'custom',
        },
        {
            description:
                'Persist the final Slack-ready summary for this run. Call exactly once after you finish your work and have written the final Slack message.',
            input_schema: {
                properties: {
                    summary: {
                        description:
                            'The final Slack-ready message to post for this run',
                        type: 'string',
                    },
                },
                required: ['summary'],
                type: 'object',
            },
            name: 'write_slack_summary',
            type: 'custom',
        },
    ],
};

type RenderManagedAgentConfigArgs = {
    lightdashSiteUrl: string;
    projectUuid: string;
    skillIds: string[];
    toolSettings?: Record<string, boolean>;
    policy?: ManagedAgentPolicy;
    preAggregatesEnabled?: boolean;
};

export const getManagedAgentMcpUrl = (
    lightdashSiteUrl: string,
    projectUuid: string,
) => `${lightdashSiteUrl}/api/v1/mcp/projects/${projectUuid}`;

// Aggression levels remove cleanup tools entirely so the model cannot use them
const aggressionDisabledTools: Record<
    ManagedAgentPolicy['aggression'],
    string[]
> = {
    observe: [
        'flag_content',
        'soft_delete_content',
        'bulk_delete_broken_content',
    ],
    flag: ['soft_delete_content', 'bulk_delete_broken_content'],
    cleanup: [],
};

const buildPolicyToolDescriptions = (
    policy: ManagedAgentPolicy,
): Record<string, string> => ({
    get_stale_charts: `Get charts that are stale per project policy: not viewed in ${policy.stalenessChartDays}+ days (or never viewed and created ${policy.stalenessChartDays}+ days ago), and not created or edited in the last ${policy.protectRecentDays} days. Returns uuid, name, space, last_viewed_at, views_count, created_by, and a reason field.`,
    get_stale_dashboards: `Get dashboards that are stale per project policy: not viewed in ${policy.stalenessDashboardDays}+ days (or never viewed and created ${policy.stalenessDashboardDays}+ days ago), and not created or edited in the last ${policy.protectRecentDays} days. Returns uuid, name, space, last_viewed_at, views_count, created_by, and a reason field.`,
    get_preview_projects: `Get preview projects older than ${policy.previewProjectDays} days per project policy. Returns uuid, name, created_at, and the project they were copied from.`,
    get_slow_queries: `Get the slowest warehouse queries in the project from the last 30 days (threshold: ${policy.slowQueryThresholdMs} ms per project policy). Returns the chart or dashboard name, execution time in ms, query context, and when it ran. Use this to flag charts or dashboards with consistently slow queries so admins can optimize them.`,
});

const managedAgentCapabilityTools = {
    createContent: ['create_content_from_code'],
    modifyExistingContent: [
        'soft_delete_content',
        'bulk_delete_broken_content',
        'fix_broken_chart',
        'reverse_own_action',
    ],
} as const;

const configurableCapabilityNames = Object.keys(managedAgentCapabilityTools);

export const normalizeManagedAgentToolSettings = (
    toolSettings: Record<string, boolean> = {},
) =>
    Object.fromEntries(
        configurableCapabilityNames
            .sort()
            .map((capabilityName) => [
                capabilityName,
                toolSettings[capabilityName] ?? true,
            ]),
    );

export const renderManagedAgentConfig = ({
    lightdashSiteUrl,
    projectUuid,
    skillIds,
    toolSettings = {},
    policy,
    preAggregatesEnabled = false,
}: RenderManagedAgentConfigArgs): AgentCreateParams => {
    const resolvedPolicy = resolveManagedAgentPolicy(policy);
    const normalizedToolSettings =
        normalizeManagedAgentToolSettings(toolSettings);
    const disabledCapabilities = Object.entries(normalizedToolSettings)
        .filter(([, enabled]) => !enabled)
        .map(([capabilityName]) => capabilityName);
    const disabledToolNames = new Set<string>([
        ...disabledCapabilities.flatMap(
            (capabilityName) =>
                managedAgentCapabilityTools[
                    capabilityName as keyof typeof managedAgentCapabilityTools
                ],
        ),
        ...aggressionDisabledTools[resolvedPolicy.aggression],
        ...(preAggregatesEnabled ? [] : ['get_preagg_candidates']),
    ]);
    const policyToolDescriptions = buildPolicyToolDescriptions(resolvedPolicy);

    return produce(managedAgentConfig, (draft) => {
        // eslint-disable-next-line no-param-reassign
        draft.system = buildManagedAgentSystemPrompt(resolvedPolicy, {
            preAggregatesEnabled,
        });
        // eslint-disable-next-line no-param-reassign
        draft.mcp_servers = [
            {
                name: 'lightdash',
                type: 'url',
                url: getManagedAgentMcpUrl(lightdashSiteUrl, projectUuid),
            },
        ];
        // eslint-disable-next-line no-param-reassign
        draft.skills = skillIds.map((skillId) => ({
            skill_id: skillId,
            type: 'custom',
            version: 'latest',
        }));

        // eslint-disable-next-line no-param-reassign
        draft.tools = draft.tools?.filter((tool) => {
            if (tool.type !== 'custom') {
                return true;
            }

            return !disabledToolNames.has(tool.name);
        });

        draft.tools?.forEach((tool) => {
            if (tool.type === 'custom' && policyToolDescriptions[tool.name]) {
                // eslint-disable-next-line no-param-reassign
                tool.description = policyToolDescriptions[tool.name];
            }
        });

        if (disabledCapabilities.length > 0) {
            // eslint-disable-next-line no-param-reassign
            draft.system = `${draft.system ?? ''}\n\n## Disabled capabilities\nThe following capabilities are disabled for this project and their tools are unavailable in this run: ${disabledCapabilities.join(', ')}. Skip checklist steps that require only disabled capabilities.`;
        }
    });
};

export const getManagedAgentConfigHash = (agentConfig: AgentCreateParams) =>
    createHash('md5').update(JSON.stringify(agentConfig)).digest('hex');
