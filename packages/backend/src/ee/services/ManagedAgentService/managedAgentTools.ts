export const MANAGED_AGENT_SYSTEM_PROMPT = `You are a Lightdash project health agent. You run on a schedule to keep this project clean and useful.

## Rules
- ALWAYS explain WHY you're taking an action in the description field
- NEVER flag or soft-delete content created in the last 30 days, regardless of view count
- NEVER flag or soft-delete content that YOU created (check get_recent_actions for created_content actions)
- NEVER soft-delete content if it's the only chart on a dashboard
- "3+ months" means the last_viewed_at date is MORE than 90 days before today's date (provided in the first message). Calculate this carefully.
- Prefer flagging over deleting when in doubt
- For insights, only surface actionable observations
- Check get_recent_actions first to avoid repeating yourself
- Escalate: if you flagged something more than 24 hours ago and it hasn't been reversed, consider soft-deleting

## Checklist (follow in order)

### 0. Context & Recovery
Call get_recent_actions to understand what you've already done.
Don't re-flag content you've already flagged. Escalate flagged content that's been ignored for 24+ hours.

**Recovery check:** Review your recent soft_deleted and flagged_stale actions. If you see any that were WRONG — for example, content you created (slug starts with "agent-") that you then flagged/deleted, or content created less than 30 days ago — use reverse_own_action to fix your mistakes before proceeding.

### 1. Preview Project Cleanup
Call get_preview_projects. Flag any older than 3 months.

### 2. Stale Content Detection
Call get_stale_charts and get_stale_dashboards.
Use today's date (from the first message) to calculate whether content is truly 3+ months old.
- Content with 0 views AND created more than 30 days ago → soft_delete_content
- Content with some views but last viewed 3+ months ago → flag_content
- Content created in the last 30 days → SKIP regardless of views (it's new)
- Content YOU created (slug starts with "agent-") → NEVER flag or delete
Include last_viewed_at, views_count, and created_at in the description.

### 3. Broken Content
Call get_broken_content. For each broken chart:
- First, try to fix it using fix_broken_chart. Read the chart with get_chart_details, remove invalid field references from the metricQuery and chartConfig, then save the fixed version.
- If you can't determine the fix, flag it instead.

### 4. Content Suggestions (demand-driven)
Create charts when there's a clear signal — user demand or content gaps.

**Demand-driven creation:** Call get_user_questions to see what users have been asking the AI assistant. If users repeatedly ask about a topic that doesn't have a saved chart, create one. This is the strongest signal for what charts to build.

Also create when you notice a gap:
- If you soft-deleted or fixed a chart, consider whether a replacement would help
- If get_popular_content shows heavy use of an explore with few charts, suggest one
- If a broken chart was unfixable, create a simpler replacement
- If the project is quite empty, create useful starter charts

When creating, use create_content_from_code:
1. Call get_user_questions to see what users are asking about
2. Call get_chart_schema for the exact JSON format
3. Use MCP tools (set_project, list_explores, find_fields) to discover the data model
4. Use find_content (MCP) to check if a chart already exists for the topic
5. Call run_metric_query to validate the data before creating
6. Prefix slugs with "agent-" to identify agent-created content
7. Place all charts in the "Dash Suggestions" space for admin review

CRITICAL: chartConfig.type must be "cartesian" (for line/bar/area), "table", "big_number", or "pie". Do NOT use "line" or "bar" as the type.

Max 3 charts per run. Skip if nothing warrants creation.

### 5. Insights
Call get_popular_content.
- Surface content that is popular but not pinned
- Surface content with high views but restricted access (private space)
- If nothing noteworthy, skip this step
`;

export const CUSTOM_TOOL_DEFINITIONS = [
    {
        type: 'custom' as const,
        name: 'get_recent_actions',
        description:
            'Get the most recent actions taken by this agent on the project. Call this first to understand what you have already done in previous runs and avoid repeating yourself.',
        input_schema: {
            type: 'object' as const,
            properties: {
                limit: {
                    type: 'number',
                    description: 'Max actions to return (default 50)',
                },
            },
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_stale_charts',
        description:
            'Get charts that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_stale_dashboards',
        description:
            'Get dashboards that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_broken_content',
        description:
            'Get charts and dashboards with validation errors (e.g., referencing fields that no longer exist). Returns uuid, name, type, and the specific errors.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_preview_projects',
        description:
            'Get preview projects older than 3 months. Returns uuid, name, created_at, and the project they were copied from.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_popular_content',
        description:
            'Get the most viewed charts and dashboards in the last 30 days. Returns uuid, name, type, views_count, unique_viewers, space name, and whether it is pinned.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'flag_content',
        description:
            'Flag a chart, dashboard, or project in the action log. Does NOT delete or modify the content — only records an observation. Use for stale content, broken content, or old preview projects.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_uuid: {
                    type: 'string',
                    description: 'UUID of the content to flag',
                },
                target_type: {
                    type: 'string',
                    enum: ['chart', 'dashboard', 'project'],
                    description: 'Type of content',
                },
                target_name: {
                    type: 'string',
                    description: 'Name of the content',
                },
                flag_type: {
                    type: 'string',
                    enum: ['flagged_stale', 'flagged_broken'],
                    description: 'Why this content is being flagged',
                },
                description: {
                    type: 'string',
                    description:
                        'Human-readable explanation of WHY you are flagging this content',
                },
                metadata: {
                    type: 'object',
                    description:
                        'Additional data (e.g., last_viewed_at, views_count, errors)',
                },
            },
            required: [
                'target_uuid',
                'target_type',
                'target_name',
                'flag_type',
                'description',
            ],
        },
    },
    {
        type: 'custom' as const,
        name: 'soft_delete_content',
        description:
            'Soft-delete a chart or dashboard. The content can be restored by an admin. Do NOT use for content created in the last 7 days. Do NOT use if the chart is the only chart on a dashboard.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_uuid: {
                    type: 'string',
                    description: 'UUID of the chart or dashboard',
                },
                target_type: {
                    type: 'string',
                    enum: ['chart', 'dashboard'],
                    description: 'Type of content',
                },
                target_name: {
                    type: 'string',
                    description: 'Name of the content',
                },
                description: {
                    type: 'string',
                    description:
                        'Human-readable explanation of WHY you are deleting this content',
                },
                metadata: {
                    type: 'object',
                    description:
                        'Additional data (e.g., last_viewed_at, views_count)',
                },
            },
            required: [
                'target_uuid',
                'target_type',
                'target_name',
                'description',
            ],
        },
    },
    {
        type: 'custom' as const,
        name: 'log_insight',
        description:
            'Log an actionable observation about popular content. For example: a chart is very popular but not pinned, or popular content is in a private space with limited access.',
        input_schema: {
            type: 'object' as const,
            properties: {
                target_uuid: {
                    type: 'string',
                    description: 'UUID of the content',
                },
                target_type: {
                    type: 'string',
                    enum: ['chart', 'dashboard'],
                    description: 'Type of content',
                },
                target_name: {
                    type: 'string',
                    description: 'Name of the content',
                },
                description: {
                    type: 'string',
                    description:
                        'The insight — what is noteworthy and what should the admin consider doing',
                },
                metadata: {
                    type: 'object',
                    description:
                        'Supporting data (e.g., views_count, unique_viewers, space_name)',
                },
            },
            required: [
                'target_uuid',
                'target_type',
                'target_name',
                'description',
            ],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_chart_details',
        description:
            'Get the full details of a chart including its metricQuery, chartConfig, and tableName. Use this to understand a chart before fixing it.',
        input_schema: {
            type: 'object' as const,
            properties: {
                chart_uuid: {
                    type: 'string',
                    description: 'UUID of the chart',
                },
            },
            required: ['chart_uuid'],
        },
    },
    {
        type: 'custom' as const,
        name: 'fix_broken_chart',
        description:
            'Fix a broken chart by updating its metricQuery and/or chartConfig. Provide the chart UUID and the corrected metricQuery and chartConfig objects. This creates a new version of the chart (the old version is preserved in history).',
        input_schema: {
            type: 'object' as const,
            properties: {
                chart_uuid: {
                    type: 'string',
                    description: 'UUID of the chart to fix',
                },
                chart_name: {
                    type: 'string',
                    description: 'Name of the chart (for logging)',
                },
                metric_query: {
                    type: 'object',
                    description:
                        'The corrected metricQuery object. Remove invalid field references.',
                },
                chart_config: {
                    type: 'object',
                    description:
                        'The corrected chartConfig object. Remove references to fields that no longer exist.',
                },
                table_config: {
                    type: 'object',
                    description: 'The corrected tableConfig object (optional).',
                },
                description: {
                    type: 'string',
                    description: 'What was wrong and what you fixed',
                },
            },
            required: [
                'chart_uuid',
                'chart_name',
                'metric_query',
                'chart_config',
                'description',
            ],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_chart_schema',
        description:
            'Get the chart-as-code JSON schema. Call this BEFORE creating any charts to understand the exact format required. The schema defines all valid field types, chart config types, and metric query structure.',
        input_schema: {
            type: 'object' as const,
            properties: {},
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'create_content_from_code',
        description:
            'Create a new chart from a chart-as-code JSON definition. IMPORTANT: Call get_chart_schema first to understand the format. The chart will be placed in an "Agent Suggestions" space for admin review. Use MCP tools to explore the data model and validate with run_metric_query before creating.',
        input_schema: {
            type: 'object' as const,
            properties: {
                chart_as_code: {
                    type: 'object',
                    description:
                        'The full chart-as-code JSON definition. Must match the schema from get_chart_schema. Key: chartConfig.type must be "cartesian" for line/bar/area charts, "table" for tables, "big_number" for big numbers, "pie" for pie charts.',
                },
                description: {
                    type: 'string',
                    description:
                        'Why this chart is useful — what gap does it fill',
                },
            },
            required: ['chart_as_code', 'description'],
        },
    },
    {
        type: 'custom' as const,
        name: 'get_user_questions',
        description:
            'Get recent questions users have asked the AI assistant. Use this to understand what users are looking for and create charts that answer common questions. Returns the prompt text, who asked it, and when.',
        input_schema: {
            type: 'object' as const,
            properties: {
                limit: {
                    type: 'number',
                    description: 'Max questions to return (default 30)',
                },
                days: {
                    type: 'number',
                    description: 'Look back this many days (default 30)',
                },
            },
            required: [] as string[],
        },
    },
    {
        type: 'custom' as const,
        name: 'reverse_own_action',
        description:
            'Reverse a previous action you took that was incorrect. Use this to restore content you wrongly soft-deleted, or dismiss flags you wrongly applied. For example: if you deleted a chart that was created less than 30 days ago, or flagged your own agent-created content as stale, reverse it. Check get_recent_actions to find the action_uuid.',
        input_schema: {
            type: 'object' as const,
            properties: {
                action_uuid: {
                    type: 'string',
                    description:
                        'UUID of the action to reverse (from get_recent_actions)',
                },
                reason: {
                    type: 'string',
                    description:
                        'Why this action was incorrect and should be reversed',
                },
            },
            required: ['action_uuid', 'reason'],
        },
    },
];
