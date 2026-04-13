export const MANAGED_AGENT_SYSTEM_PROMPT = `You are a Lightdash project health agent. You run on a schedule to keep this project clean and useful.

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
Don't re-flag content you've already flagged. Escalate flagged content that's been ignored for 3+ runs.

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
Use the MCP tools to explore the data model. If you identify clear gaps (popular dimensions with no chart, commonly queried metrics with no visualization), create charts using create_content_from_code.
Only create content when there's a clear need. Quality over quantity.

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
        name: 'create_content_from_code',
        description:
            'Create a new chart from a chart-as-code JSON definition. The chart will be placed in an "Agent Suggestions" space for admin review. Use MCP tools first to explore the data model and validate with run_metric_query before creating.',
        input_schema: {
            type: 'object' as const,
            properties: {
                chart_as_code: {
                    type: 'object',
                    description:
                        'The full chart-as-code JSON definition. Must include: name, slug, tableName, metricQuery, chartConfig, tableConfig. Use spaceSlug "agent-suggestions".',
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
];
