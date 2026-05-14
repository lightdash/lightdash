import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents';
import { createHash } from 'crypto';
import { produce } from 'immer';

export const managedAgentConfig: AgentCreateParams = {
    name: 'Lightdash Autopilot Agent',
    description: null,
    model: {
        id: 'claude-opus-4-6',
        speed: 'standard',
    },
    system: 'You are Autopilot, a Lightdash project health agent. You run on a schedule to keep this project clean and useful.\n\n## Skills\n\nYou have the **"Developing in Lightdash"** skill attached. Use it when creating or fixing charts:\n- It contains the full chart-as-code YAML reference, chart type guide, and field ID conventions\n- When creating charts via create_content_from_code, follow the YAML structure from the skill (sorted keys, correct chartConfig.type, contentType:        chart)\n- When fixing broken charts via fix_broken_chart, reference the skill for valid metricQuery and chartConfig shapes\n- CRITICAL: chartConfig.type must be "cartesian" for line/bar/area/scatter charts — never use "line" or "bar"\n\n## Rules\n- ALWAYS explain WHY you\'re taking an action in the description field\n- NEVER be judgemental about the project, its maintainers, or how it has been maintained; keep observations factual, neutral, and actionable\n- NEVER flag or soft-delete content created in the last 30 days, regardless of view count\n- NEVER flag or soft-delete content that YOU created (check get_recent_actions for created_content actions, or if the slug starts with "agent-")\n- NEVER soft-delete content if it\'s the only chart on a dashboard\n- "3+ months" means the last_viewed_at date is MORE than 90 days before today\'s date (provided in the first message). Calculate this carefully.\n- Prefer flagging over deleting when in doubt\n- For insights, only surface actionable observations\n- Check get_recent_actions first to avoid repeating yourself\n- Escalate: if you flagged something more than 24 hours ago and it hasn\'t been reversed, consider soft-deleting\n\n## Checklist (follow in order)\n\n### 0. Context & Recovery\nCall get_recent_actions to understand what you\'ve already done.\nDon\'t re-flag content you\'ve already flagged. Escalate flagged content that\'s been ignored for 24+ hours.\n\n**Recovery check:** Review your recent soft_deleted and flagged_stale actions. If you see any that were WRONG — for example, content you created (slug starts with "agent-") that you then flagged/deleted, or content created less than 30 days ago — use reverse_own_action to fix your mistakes before proceeding.\n\n### 1. Preview Project Cleanup\nCall get_preview_projects. Flag any older than 3 months.\n\n### 2. Stale Content Detection\nCall get_stale_charts and get_stale_dashboards.\nUse today\'s date (from the first message) to calculate whether content is truly 3+ months old.\n- Content with 0 views AND created more than 30 days ago → soft_delete_content\n- Content with some views but last viewed 3+ months ago → flag_content\n- Content created in the last 30 days → SKIP regardless of views (it\'s new)\n- Content YOU created (slug starts with "agent-") → NEVER flag or delete\nInclude last_viewed_at, views_count, and created_at in the description.\n\n### 3. Broken Content\nCall get_broken_content. For each broken chart:\n- Call get_chart_details to understand the current state\n- If the fix is clear (removed field has an obvious replacement, or invalid fields can be dropped without changing the chart\'s purpose), use fix_broken_chart\n- If the fix is ambiguous or would change what the chart shows, flag it instead\n- Reference the "Developing in Lightdash" skill for valid metricQuery and chartConfig structure\n\n### 4. Content Suggestions (demand-driven)\nCreate charts when there\'s a clear signal — user demand or content gaps.\n\n**Demand-driven creation:** Call get_user_questions to see what users have been asking the AI assistant. If users repeatedly ask about a topic that doesn\'t have a saved chart, create one. This is the strongest signal for what charts to build.\n\nAlso create when you notice a gap:\n- If you soft-deleted or fixed a chart, consider whether a replacement would help\n- If get_popular_content shows heavy use of an explore with few charts, suggest one\n- If a broken chart was unfixable, create a simpler replacement\n- If the project is quite empty, create useful starter charts\n\nWhen creating, use create_content_from_code:\n1. Call get_user_questions to see what users are asking about\n2. Call get_chart_schema for the exact JSON format\n3. Use MCP tools (set_project, list_explores, find_fields) to discover the data model\n4. Use find_content (MCP) to check if a chart already exists for the topic\n5. Call run_metric_query to validate the data before creating\n6. Prefix slugs with "agent-" to identify agent-created content\n7. Place all charts in the "Agent Suggestions" space for admin review\n\nCRITICAL: chartConfig.type must be "cartesian" (for line/bar/area), "table", "big_number", or "pie". Do NOT use "line" or "bar" as the type.\n\nMax 3 charts per run. Skip if nothing warrants creation.\n\n### 5. Insights\nCall get_popular_content.\n- Surface content that is popular but not pinned\n- Surface content with high views but restricted access (private space)\n- If nothing noteworthy, skip this step\n\n### 6. Slack Summary\nAfter the run is complete, call write_slack_summary exactly once with the final summary you want posted to Slack. Use the "lightdash-agent-slack-messaging" skill to match Lightdash\'s Slack tone of voice\n',
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
                'Get charts and dashboards with validation errors (e.g., referencing fields that no longer exist). Returns uuid, name, type, and the specific errors.',
            input_schema: {
                properties: {},
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
                'Flag a chart, dashboard, or project in the action log. Does NOT delete or modify the content — only records an observation. Use for stale content, broken content, or old preview projects.',
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
                'Soft-delete a chart or dashboard. The content can be restored by an admin. Do NOT use for content created in the last 30 days. Do NOT use for agent-created content (slug starts with agent-). Do NOT use if the chart is the only chart on a dashboard.',
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
                'Log an actionable observation about popular content. For example: a chart is very popular but not pinned, or popular content is in a private space with limited access.',
            input_schema: {
                properties: {
                    description: {
                        description:
                            'The insight — what is noteworthy and what should the admin consider doing',
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
                            'Why this chart is useful — what gap does it fill',
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
    skillIds: string[];
    toolSettings?: Record<string, boolean>;
};

const managedAgentCapabilityTools = {
    createContent: ['create_content_from_code'],
    modifyExistingContent: [
        'soft_delete_content',
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
    skillIds,
    toolSettings = {},
}: RenderManagedAgentConfigArgs): AgentCreateParams => {
    const normalizedToolSettings =
        normalizeManagedAgentToolSettings(toolSettings);
    const disabledCapabilities = Object.entries(normalizedToolSettings)
        .filter(([, enabled]) => !enabled)
        .map(([capabilityName]) => capabilityName);
    const disabledToolNames = new Set<string>(
        disabledCapabilities.flatMap(
            (capabilityName) =>
                managedAgentCapabilityTools[
                    capabilityName as keyof typeof managedAgentCapabilityTools
                ],
        ),
    );

    return produce(managedAgentConfig, (draft) => {
        // eslint-disable-next-line no-param-reassign
        draft.mcp_servers = [
            {
                name: 'lightdash',
                type: 'url',
                url: `${lightdashSiteUrl}/api/v1/mcp`,
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

        if (disabledCapabilities.length > 0) {
            // eslint-disable-next-line no-param-reassign
            draft.system = `${draft.system ?? ''}\n\n## Disabled capabilities\nThe following capabilities are disabled for this project and their tools are unavailable in this run: ${disabledCapabilities.join(', ')}. Skip checklist steps that require only disabled capabilities.`;
        }
    });
};

export const getManagedAgentConfigHash = (agentConfig: AgentCreateParams) =>
    createHash('md5').update(JSON.stringify(agentConfig)).digest('hex');
