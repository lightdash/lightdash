import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents';
import {
    assertUnreachable,
    DEFAULT_MANAGED_AGENT_POLICY,
    ManagedAgentActionType,
    ManagedAgentTargetType,
    resolveManagedAgentPolicy,
    toLlmJsonSchema,
    type JsonSchema,
    type ManagedAgentPolicy,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { produce } from 'immer';
import { z } from 'zod';
import type { ManagedAgentRuntime } from '../../../../config/parseConfig';

export type ManagedAgentPromptOptions = {
    preAggregatesEnabled?: boolean;
    runtime?: ManagedAgentRuntime;
};

export const AUTOPILOT_CHART_SKILL_NAME = 'developing-in-lightdash';

// The managed-agents runtime reaches the semantic layer over MCP; the AI SDK
// runtime has the equivalent tools in-process under different names.
const getDataToolWording = (runtime: ManagedAgentRuntime) => {
    switch (runtime) {
        case 'anthropic-managed':
            return {
                skills: `You have the **"Developing in Lightdash"** skill attached. Use it when creating or fixing charts:`,
                discover: `3. The MCP connection is already pinned to this project. Use MCP tools (list_explores, find_fields) to discover the data model. Do not attempt to switch projects
4. Use find_content (MCP) to check if a chart already exists for the topic
5. Call run_metric_query to validate the data before creating`,
            };
        case 'ai-sdk':
            return {
                skills: `Call loadSkill with name "${AUTOPILOT_CHART_SKILL_NAME}" before creating or fixing charts:`,
                discover: `3. Use grepFields and getMetadata to discover the data model. Every field ID must come from those tools
4. Use findContent to check if a chart already exists for the topic
5. Call runMetricQuery to validate the data before creating`,
            };
        default:
            return assertUnreachable(runtime, `Unknown runtime: ${runtime}`);
    }
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
            body: 'After the run is complete, call write_slack_summary exactly once with a short completion note. The published report is written afterwards from the evidence you gathered and the actions you saved, so do not draft the report in the note or invent counts. The completion note is not published.',
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
                return '- OBSERVE MODE: record maintenance findings with log_project_insight, or log_insight for a specific chart/dashboard; NEVER flag or soft-delete content. Chart creation and repairs remain enabled when their tools are available.';
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

    const wording = getDataToolWording(options.runtime ?? 'anthropic-managed');

    return `You are Autopilot, a Lightdash project health agent. You run on a schedule to keep this project clean and useful.

## Skills

${wording.skills}
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
Call get_recent_actions to understand what you've already done. For project-wide findings or summaries that are not about a specific chart/dashboard, use log_project_insight: it is already pinned to the current project and needs no target UUID. Use log_insight only for a real chart or dashboard returned by tools.
Don't re-flag content you've already flagged.${escalationChecklistLine}

**Recovery check:** Review the soft_deleted and flagged_stale actions from this run. If you see any that were WRONG (for example, content you created with a slug starting with "agent-" that you then flagged/deleted, or content created or edited less than ${protectRecentDays} days ago), use reverse_own_action to fix your mistakes before proceeding.

### 1. Preview Project Cleanup
${previewStep}

### 2. Stale Content Detection
${staleStep}

### 3. Broken Content
Call get_broken_content. It returns the complete set of validation error groups, one per root cause, so start by triaging groups, not individual charts:
- Use log_project_insight for a short summary of the full backlog first (total errors, affected items, and the biggest groups), so admins see the whole picture even when you only fix a few items
- A group whose model no longer exists means every chart in it is broken for the same reason. Call get_broken_content with that table_name for details; keep the same table_name and pass next_cursor as cursor until next_cursor is null to reach all affected content. When bulk_delete_broken_content is available, use it to clean up charts on that deleted model within its run cap; report any remaining backlog for the next run; flag affected dashboards instead of deleting them
- In flag-only mode, call bulk_flag_broken_content once per deleted model using its table_name. The handler flags every eligible chart in that group, applies protections, and skips existing flags. Flag affected dashboards individually. Use its counts in the summary; do not substitute a small sample of individual flags or a backlog insight for group flagging
- For renamed or replaced fields, load the chart skill, call get_chart_details, and discover current fields and their descriptions before judging a repair ambiguous. Search for a documented replacement before falling back to an insight or flag. Use fix_broken_chart when the fix is clear (removed field has an obvious replacement, or invalid fields can be dropped without changing the chart's purpose)
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
${wording.discover}
6. Prefix slugs with "agent-" to identify agent-created content
7. Place all charts in the "Agent Suggestions" space for admin review

CRITICAL: chartConfig.type must be "cartesian" (for line/bar/area), "table", "big_number", or "pie". Do NOT use "line" or "bar" as the type.

Max 3 charts per run. Skip if nothing warrants creation.

### 5. People & Ownership
Call get_inactive_users and get_orphaned_content. Both are reporting-only: record what you find with log_project_insight and NEVER flag, delete, or otherwise act on a person or their content.
- Inactive users: group by how long they've been quiet and say which signal you used. Frame it as a seat and ownership review for admins, never as a judgement about the person
- Orphaned content: group by former owner so admins can reassign in one pass. Leaving the company does not make content stale, so do not recommend deletion on those grounds alone
- If either returns nothing, say so briefly or skip

${buildChecklistTailSections(options)}
`;
};

const optionalNumber = (description: string) =>
    z.number().optional().describe(description);

const jsonObject = () => z.record(z.string(), z.unknown());

const optionalMetadata = (description: string) =>
    jsonObject().optional().describe(description);

const contentTargetType = z
    .enum([ManagedAgentTargetType.CHART, ManagedAgentTargetType.DASHBOARD])
    .describe('Type of content');

const autopilotToolDefinitionList = [
    {
        description:
            'Get the most recent actions taken by this agent on the project. Call this first to understand what you have already done in previous runs and avoid repeating yourself.',
        inputSchema: z.object({
            limit: optionalNumber('Max actions to return (default 50)'),
        }),
        name: 'get_recent_actions',
    },
    {
        description:
            'Get charts that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
        inputSchema: z.object({}),
        name: 'get_stale_charts',
    },
    {
        description:
            'Get dashboards that have not been viewed in 3+ months. Returns uuid, name, space, last_viewed_at, views_count, and created_by.',
        inputSchema: z.object({}),
        name: 'get_stale_dashboards',
    },
    {
        description:
            'Get validation errors grouped by root cause (e.g. one group per deleted model). Without arguments, returns the COMPLETE set of groups with counts and a capped sample of affected content per group. Pass table_name for a page of visible broken items. Continue with next_cursor as cursor and the same table_name until next_cursor is null. Items are ordered by UUID; omitted_count counts items remaining after this page.',
        inputSchema: z.object({
            limit: optionalNumber(
                'Max items per detail page (1–100, default 100)',
            ),
            cursor: z
                .string()
                .optional()
                .describe(
                    'The previous detail page next_cursor; omit for the first page. Keep the same table_name. Ignored in group-summary mode.',
                ),
            table_name: z
                .string()
                .optional()
                .describe(
                    'Root-cause model name from a summary group; switches to paginated detail for that model',
                ),
        }),
        name: 'get_broken_content',
    },
    {
        description:
            'Get preview projects older than 3 months. Returns uuid, name, created_at, and the project they were copied from.',
        inputSchema: z.object({}),
        name: 'get_preview_projects',
    },
    {
        description:
            'Get the most viewed charts and dashboards in the last 30 days. Returns uuid, name, type, views_count, unique_viewers, space name, and whether it is pinned.',
        inputSchema: z.object({}),
        name: 'get_popular_content',
    },
    {
        description:
            'Flag a chart, dashboard, or project in the action log. Does NOT delete or modify the content, only records an observation. Use for stale content, broken content, or old preview projects. Idempotent: flagging an already-flagged target returns the existing flag without creating a duplicate, and deleted targets are skipped — so never re-flag a list you have already processed this run.',
        inputSchema: z.object({
            description: z
                .string()
                .min(1)
                .describe(
                    'Human-readable explanation of WHY you are flagging this content',
                ),
            flag_type: z
                .enum([
                    ManagedAgentActionType.FLAGGED_STALE,
                    ManagedAgentActionType.FLAGGED_BROKEN,
                ])
                .describe('Why this content is being flagged'),
            metadata: optionalMetadata(
                'Additional data (e.g., last_viewed_at, views_count, errors)',
            ),
            target_name: z.string().min(1).describe('Name of the content'),
            target_type: z
                .enum([
                    ManagedAgentTargetType.CHART,
                    ManagedAgentTargetType.DASHBOARD,
                    ManagedAgentTargetType.PROJECT,
                ])
                .describe('Type of content'),
            target_uuid: z
                .string()
                .min(1)
                .describe('UUID of the content to flag'),
        }),
        name: 'flag_content',
    },
    {
        name: 'bulk_flag_broken_content',
        description:
            'Flag all visible, in-scope charts whose underlying model was deleted. Flag affected dashboards individually. Use the table_name from a model-level get_broken_content group. One call processes the whole group, including items beyond detail pages; do not enumerate individual UUIDs. Existing active flags are preserved without resetting escalation. Protected or verified content is skipped. Reports created, already-flagged and blocked counts. Does not modify or delete content. Safe to retry after interruption.',
        inputSchema: z.object({
            table_name: z
                .string()
                .min(1)
                .describe('Deleted model name from get_broken_content'),
            reason: z
                .string()
                .min(1)
                .describe('Why this model-level group needs review'),
        }),
    },
    {
        description:
            'Soft-delete a chart or dashboard. The content can be restored by an admin. Only usable on content that was flagged more than the escalation window ago and not dismissed; unflagged content is blocked, so flag_content it first. Do NOT use for content created in the last 30 days. Do NOT use for agent-created content (slug starts with agent-). Do NOT use if the chart is the only chart on a dashboard. At most 25 individual soft-deletes are allowed per run; further calls are blocked, so flag the remainder instead.',
        inputSchema: z.object({
            description: z
                .string()
                .min(1)
                .describe(
                    'Human-readable explanation of WHY you are deleting this content',
                ),
            metadata: optionalMetadata(
                'Additional data (e.g., last_viewed_at, views_count)',
            ),
            target_name: z.string().min(1).describe('Name of the content'),
            target_type: contentTargetType,
            target_uuid: z
                .string()
                .min(1)
                .describe('UUID of the chart or dashboard'),
        }),
        name: 'soft_delete_content',
    },
    {
        description:
            'Soft-delete charts whose underlying model was deleted, within the run cap. Only use when get_broken_content shows a model-level group (the whole model no longer exists). Charts are individually recoverable; dashboards referencing the model are never deleted by this tool, flag them instead. Deletes at most 25 charts per run across all bulk calls and reports the remainder. Per-chart guardrails still apply and skipped charts are reported with reasons.',
        inputSchema: z.object({
            reason: z
                .string()
                .min(1)
                .describe(
                    'Human-readable explanation of WHY this cleanup is safe (e.g. which model was removed and when)',
                ),
            table_name: z
                .string()
                .min(1)
                .describe(
                    'The deleted model name, exactly as returned by get_broken_content',
                ),
        }),
        name: 'bulk_delete_broken_content',
    },
    {
        description:
            'Log an actionable observation about a specific chart or dashboard returned by tools. Use log_project_insight for a whole-project or model-level finding; never invent a content UUID.',
        inputSchema: z.object({
            description: z
                .string()
                .min(1)
                .describe(
                    'The insight: what is noteworthy and what should the admin consider doing',
                ),
            metadata: optionalMetadata(
                'Supporting data (e.g., views_count, unique_viewers, space_name)',
            ),
            target_name: z.string().min(1).describe('Name of the content'),
            target_type: contentTargetType,
            target_uuid: z.string().min(1).describe('UUID of the content'),
        }),
        name: 'log_insight',
    },
    {
        name: 'log_project_insight',
        description:
            'Record a project-wide observation, model-level finding, or maintenance backlog summary. Automatically targets the current project; no UUID is needed. Reporting only, available in every cleanup mode.',
        inputSchema: z.object({
            description: z
                .string()
                .min(1)
                .describe('The finding and recommended admin follow-up'),
            metadata: optionalMetadata(
                'Supporting counts, model names, or other evidence',
            ),
        }),
    },
    {
        description:
            'Get the full details of a chart including its metricQuery, chartConfig, and tableName. Use this to understand a chart before fixing it.',
        inputSchema: z.object({
            chart_uuid: z.string().min(1).describe('UUID of the chart'),
        }),
        name: 'get_chart_details',
    },
    {
        description:
            'Fix a broken chart by updating its metricQuery and/or chartConfig. Provide the chart UUID and the corrected metricQuery and chartConfig objects. This creates a new version of the chart (the old version is preserved in history).',
        inputSchema: z.object({
            chart_config: jsonObject().describe(
                'The corrected chartConfig object. Remove references to fields that no longer exist.',
            ),
            chart_name: z
                .string()
                .min(1)
                .describe('Name of the chart (for logging)'),
            chart_uuid: z.string().min(1).describe('UUID of the chart to fix'),
            description: z
                .string()
                .min(1)
                .describe('What was wrong and what you fixed'),
            metric_query: jsonObject().describe(
                'The corrected metricQuery object. Remove invalid field references.',
            ),
            table_config: jsonObject()
                .optional()
                .describe('The corrected tableConfig object (optional).'),
        }),
        name: 'fix_broken_chart',
    },
    {
        description:
            'Get the chart-as-code JSON schema. Call this BEFORE creating any charts to understand the exact format required. The schema defines all valid field types, chart config types, and metric query structure.',
        inputSchema: z.object({}),
        name: 'get_chart_schema',
    },
    {
        description:
            'Create a new chart from a chart-as-code JSON definition. IMPORTANT: Call get_chart_schema first to understand the format. The chart will be placed in a "Dash Suggestions" space for admin review. Explore the data model with the discovery tools and validate the query before creating.',
        inputSchema: z.object({
            chart_as_code: jsonObject().describe(
                'The full chart-as-code JSON definition. Must match the schema from get_chart_schema. Key: chartConfig.type must be "cartesian" for line/bar/area charts, "table" for tables, "big_number" for big numbers, "pie" for pie charts.',
            ),
            description: z
                .string()
                .min(1)
                .describe('Why this chart is useful and what gap it fills'),
        }),
        name: 'create_content_from_code',
    },
    {
        description:
            'Get recent questions users have asked the AI assistant. Use this to understand what users are looking for and create charts that answer common questions. Returns the prompt text, who asked it, and when.',
        inputSchema: z.object({
            days: optionalNumber('Look back this many days (default 30)'),
            limit: optionalNumber('Max questions to return (default 30)'),
        }),
        name: 'get_user_questions',
    },
    {
        description:
            'Reverse an action from this run that was incorrect. Use this to restore content you wrongly soft-deleted, or dismiss flags you wrongly applied. For example if you deleted a chart that was created less than 30 days ago, or flagged your own agent-created content as stale, reverse it. Actions from earlier runs cannot be reversed here; admins handle those from the activity page. Check get_recent_actions to find the action_uuid.',
        inputSchema: z.object({
            action_uuid: z
                .string()
                .min(1)
                .describe(
                    'UUID of the action to reverse (from get_recent_actions)',
                ),
            reason: z
                .string()
                .min(1)
                .describe(
                    'Why this action was incorrect and should be reversed',
                ),
        }),
        name: 'reverse_own_action',
    },
    {
        description:
            'Get the slowest warehouse queries in the project from the last 30 days. Returns the chart or dashboard name, execution time in ms, query context, and when it ran. Use this to flag charts or dashboards with consistently slow queries so admins can optimize them.',
        inputSchema: z.object({
            limit: optionalNumber('Max results to return (default 20)'),
            threshold_ms: optionalNumber(
                'Minimum execution time in ms to consider slow (default 2000)',
            ),
        }),
        name: 'get_slow_queries',
    },
    {
        description:
            'Get users with access to this project who have shown no activity in it recently. Activity means viewing a chart, viewing a dashboard, or running a query. Returns user_uuid, name, email, role, last_active_at, and last_active_source (the signal the decision was based on), oldest first. Reporting only: never flag or delete anything based on this.',
        inputSchema: z.object({
            inactive_days: optionalNumber(
                'Days without activity before a user counts as inactive (default 90)',
            ),
            limit: optionalNumber('Max users to return (default 30)'),
        }),
        name: 'get_inactive_users',
    },
    {
        description:
            "Get charts and dashboards in this project whose owner is deactivated or has left the organization. Owner means a chart's last editor and a dashboard's original author. Returns content_type, uuid, name, space, owner name, owner_status, and last_viewed_at, grouped by owner. Reporting only: content is not stale just because its owner left, so never flag or delete based on this.",
        inputSchema: z.object({
            limit: optionalNumber('Max items to return (default 30)'),
        }),
        name: 'get_orphaned_content',
    },
    {
        description:
            'Get AI agents in this project that are getting little or no traffic. Traffic is counted as user prompts, so an opened conversation nobody spoke in does not count as use. Agents created inside the window and the auto-provisioned system agent are excluded. Returns name, reason (never_used, no_recent_use, only_failed_sessions, low_traffic), routing_signal (router_disabled, never_a_candidate, candidate_never_suggested, suggested_never_chosen, routed), last_used_at, prompt and thread counts, and router counts. Reporting only: never delete or disable an agent based on this.',
        inputSchema: z.object({
            limit: optionalNumber('Max agents to return (default 30)'),
            min_prompts: optionalNumber(
                'Prompts in the window below which an agent counts as low traffic (default 5)',
            ),
            window_days: optionalNumber(
                'Days of activity to look at (default 30). Agents younger than this are excluded',
            ),
        }),
        name: 'get_unused_agents',
    },
    {
        description:
            'Get explores where users burn warehouse time on repeated queries that a pre-aggregate could serve. Ranks explores by total warehouse execution time over the window, with the most common query shapes, existing pre-aggregate hit/miss stats by miss reason, and a suggested pre_aggregates YAML definition that has been validated against the project semantic layer. Queries already served by a pre-aggregate are excluded from the ranking. Reporting only: propose the YAML to admins via log_insight, never write dbt files.',
        inputSchema: z.object({
            limit: optionalNumber(
                'Max candidate explores to return (default 10)',
            ),
            min_queries: optionalNumber(
                'Minimum warehouse queries in the window for an explore to qualify (default 10)',
            ),
            window_days: optionalNumber(
                'Days of query history to analyze (default 30)',
            ),
        }),
        name: 'get_preagg_candidates',
    },
    {
        description:
            'Finish reporting for this run. Call exactly once with a short completion note after your work. The published report is written afterwards from the evidence you gathered and the actions you saved; the completion note is not published.',
        inputSchema: z.object({
            summary: z
                .string()
                .describe(
                    'A short completion note for the tool loop; not published',
                ),
        }),
        name: 'write_slack_summary',
    },
] as const satisfies readonly {
    name: string;
    description: string;
    inputSchema: z.ZodObject;
}[];

type AutopilotToolDefinitionEntry =
    (typeof autopilotToolDefinitionList)[number];

export type AutopilotToolName = AutopilotToolDefinitionEntry['name'];

export type AutopilotToolInput<TName extends AutopilotToolName> = z.output<
    Extract<AutopilotToolDefinitionEntry, { name: TName }>['inputSchema']
>;

export type AutopilotToolDefinition = {
    name: AutopilotToolName;
    description: string;
    inputSchema: z.ZodObject;
};

export const autopilotToolDefinitions: AutopilotToolDefinition[] = [
    ...autopilotToolDefinitionList,
];

export type AutopilotToolCall = {
    [TName in AutopilotToolName]: {
        name: TName;
        input: AutopilotToolInput<TName>;
    };
}[AutopilotToolName];

export type ParsedAutopilotToolCall =
    | { ok: true; call: AutopilotToolCall }
    | { ok: false; error: string };

export const parseAutopilotToolCall = (
    toolName: string,
    input: unknown,
): ParsedAutopilotToolCall => {
    const definition = autopilotToolDefinitions.find(
        (candidate) => candidate.name === toolName,
    );
    if (!definition) {
        return { ok: false, error: `Unknown tool: ${toolName}` };
    }
    const result = definition.inputSchema.safeParse(input);
    if (!result.success) {
        return {
            ok: false,
            error: `Invalid input for ${definition.name}: ${z.prettifyError(result.error)}`,
        };
    }
    // The schema lookup is keyed by name, so the parsed shape matches the tool.
    return {
        ok: true,
        call: {
            name: definition.name,
            input: result.data,
        } as AutopilotToolCall,
    };
};

export const toAutopilotToolJsonSchema = (
    definition: AutopilotToolDefinition,
): JsonSchema => {
    const { $schema: _draft, ...inputSchema } = toLlmJsonSchema(
        definition.inputSchema,
    );
    return inputSchema;
};

const toAnthropicCustomTool = (
    definition: AutopilotToolDefinition,
): NonNullable<AgentCreateParams['tools']>[number] => ({
    type: 'custom',
    name: definition.name,
    description: definition.description,
    input_schema: { ...toAutopilotToolJsonSchema(definition), type: 'object' },
});

// Anthropic-hosted sandbox tools: file access exists only so the agent can read
// its attached skills.
const managedAgentSandboxToolsets: NonNullable<AgentCreateParams['tools']> = [
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
];

export const AUTOPILOT_MANAGED_MODEL_ID = 'claude-opus-4-6';

const managedAgentConfig: AgentCreateParams = {
    name: 'Lightdash Autopilot Agent',
    description: null,
    model: {
        id: AUTOPILOT_MANAGED_MODEL_ID,
        speed: 'standard',
    },
    system: buildManagedAgentSystemPrompt(DEFAULT_MANAGED_AGENT_POLICY),
    mcp_servers: [],
    metadata: {},
    skills: [],
    tools: [],
};

type RenderAutopilotAgentArgs = {
    toolSettings?: Record<string, boolean>;
    policy?: ManagedAgentPolicy;
    preAggregatesEnabled?: boolean;
    runtime: ManagedAgentRuntime;
};

export type RenderedAutopilotAgent = {
    system: string;
    tools: AutopilotToolDefinition[];
};

type RenderManagedAgentConfigArgs = Omit<
    RenderAutopilotAgentArgs,
    'runtime'
> & {
    lightdashSiteUrl: string;
    projectUuid: string;
    skillIds: string[];
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
        'bulk_flag_broken_content',
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

export const renderAutopilotAgent = ({
    toolSettings = {},
    policy,
    preAggregatesEnabled = false,
    runtime,
}: RenderAutopilotAgentArgs): RenderedAutopilotAgent => {
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
    // Group flagging must not substitute for enabled deleted-model cleanup.
    if (!disabledToolNames.has('bulk_delete_broken_content')) {
        disabledToolNames.add('bulk_flag_broken_content');
    }
    const policyToolDescriptions = buildPolicyToolDescriptions(resolvedPolicy);

    const baseSystem = buildManagedAgentSystemPrompt(resolvedPolicy, {
        preAggregatesEnabled,
        runtime,
    });
    const system =
        disabledCapabilities.length > 0
            ? `${baseSystem}\n\n## Disabled capabilities\nThe following capabilities are disabled for this project and their tools are unavailable in this run: ${disabledCapabilities.join(', ')}. Skip checklist steps that require only disabled capabilities.`
            : baseSystem;

    const tools = autopilotToolDefinitions
        .filter((definition) => !disabledToolNames.has(definition.name))
        .map((definition) => ({
            ...definition,
            description:
                policyToolDescriptions[definition.name] ??
                definition.description,
        }));

    return { system, tools };
};

export const renderManagedAgentConfig = ({
    lightdashSiteUrl,
    projectUuid,
    skillIds,
    ...agentArgs
}: RenderManagedAgentConfigArgs): AgentCreateParams => {
    const { system, tools } = renderAutopilotAgent({
        ...agentArgs,
        runtime: 'anthropic-managed',
    });

    return produce(managedAgentConfig, (draft) => {
        // eslint-disable-next-line no-param-reassign
        draft.system = system;
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
        draft.tools = [
            ...managedAgentSandboxToolsets,
            ...tools.map(toAnthropicCustomTool),
        ];
    });
};

export const getManagedAgentConfigHash = (agentConfig: AgentCreateParams) =>
    createHash('md5').update(JSON.stringify(agentConfig)).digest('hex');
