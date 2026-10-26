import { SCHEDULER_TASKS } from '@lightdash/common';
import type { Knex } from 'knex';
import { aiUsageCompactedColumns } from '../analytics/eventStream/aiUsageStream';
import { historicalActivityColumns } from '../analytics/eventStream/usageHistorySources';

type HistorySource = {
    table: string;
    id: string;
    timestamp?: string;
    fact: string;
    scope:
        | 'organization'
        | 'thread'
        | 'prompt'
        | 'research'
        | 'export'
        | 'router'
        | 'evaluation'
        | 'evaluationResult'
        | 'evaluationAssessment'
        | 'artifact'
        | 'threadFile';
    fields?: Record<string, string>;
};

// These are explicitly database facts/current snapshots, not reconstructed live
// request or tool-completion events. Never select payloads, SQL or external IDs.
const activitySources: HistorySource[] = [
    {
        table: 'ai_thread',
        id: 'ai_thread_uuid',
        fact: 'agent_thread_recorded',
        scope: 'organization',
        fields: {
            agent_id: 's.agent_uuid',
            thread_id: 's.ai_thread_uuid',
            context: 's.created_from',
        },
    },
    ...[
        { fact: 'agent_prompt_recorded', timestamp: 'created_at' },
        { fact: 'agent_prompt_responded', timestamp: 'responded_at' },
        { fact: 'agent_prompt_latest_retry', timestamp: 'retried_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_prompt',
            id: 'ai_prompt_uuid',
            fact,
            timestamp,
            scope: 'prompt',
            fields: {
                user_id: 's.created_by_user_uuid',
                context: 's.execution_mode',
                content_id: 's.saved_query_uuid',
                content_type:
                    "CASE WHEN s.saved_query_uuid IS NOT NULL THEN 'chart' END",
                // These describe the current retained row, not its state at created_at.
                current_status:
                    "CASE WHEN s.error_message IS NOT NULL THEN 'error' WHEN s.needs_user_input THEN 'awaiting_input' WHEN s.responded_at IS NOT NULL THEN 'responded' ELSE 'pending' END",
                ...(fact === 'agent_prompt_recorded'
                    ? {
                          human_score: 's.human_score',
                          total_tokens:
                              "CASE WHEN jsonb_typeof(s.token_usage->'totalTokens') = 'number' THEN s.token_usage->'totalTokens' END",
                      }
                    : {}),
            },
        }),
    ),
    {
        table: 'ai_prompt_interrupt',
        id: 'ai_prompt_interrupt_uuid',
        fact: 'agent_prompt_interrupted',
        scope: 'prompt',
        fields: { user_id: 's.created_by_user_uuid' },
    },
    ...[
        { fact: 'agent_prompt_steer_recorded', timestamp: 'created_at' },
        { fact: 'agent_prompt_steer_consumed', timestamp: 'consumed_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_prompt_steer',
            id: 'ai_prompt_steer_uuid',
            fact,
            timestamp,
            scope: 'prompt',
            fields: { user_id: 's.created_by_user_uuid' },
        }),
    ),
    ...[
        ['ai_agent_tool_call', 'agent_tool_call_recorded'],
        ['ai_agent_tool_result', 'agent_tool_result_recorded'],
        ['ai_agent_tool_call_error', 'agent_tool_call_rejected'],
    ].map(
        ([table, fact]): HistorySource => ({
            table,
            id: `${table}_uuid`,
            fact,
            scope: 'prompt',
            fields: { tool_name: 's.tool_name' },
        }),
    ),
    {
        table: 'ai_agent_reasoning',
        id: 'ai_agent_reasoning_uuid',
        fact: 'agent_reasoning_recorded',
        scope: 'prompt',
    },
    {
        table: 'ai_prompt_context',
        id: 'ai_prompt_context_uuid',
        fact: 'agent_context_recorded',
        scope: 'prompt',
        fields: { content_id: 's.entity_uuid', content_type: 's.entity_type' },
    },
    {
        table: 'ai_prompt_decision',
        id: 'ai_prompt_decision_uuid',
        fact: 'agent_decision_recorded',
        scope: 'prompt',
        fields: {
            context: 's.operation',
            current_status: 's.outcome',
            duration_ms: 's.latency_ms',
            success: 's.applied',
        },
    },
    {
        table: 'ai_prompt_decision_shadow',
        id: 'ai_prompt_decision_shadow_uuid',
        fact: 'agent_shadow_decision_recorded',
        scope: 'prompt',
        fields: {
            context: 's.operation',
            current_status: 's.shadow_outcome',
            duration_ms: 's.shadow_latency_ms',
        },
    },
    {
        table: 'ai_thread_compaction',
        id: 'ai_thread_compaction_uuid',
        fact: 'agent_thread_compacted',
        scope: 'thread',
    },
    ...[
        { fact: 'agent_thread_share_recorded', timestamp: 'created_at' },
        { fact: 'agent_thread_share_revoked', timestamp: 'revoked_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_thread_share',
            id: 'ai_thread_share_uuid',
            fact,
            timestamp,
            scope: 'organization',
            fields: {
                user_id: 's.created_by_user_uuid',
                agent_id: 's.agent_uuid',
                thread_id: 's.ai_thread_uuid',
                prompt_id: 's.snapshot_prompt_uuid',
            },
        }),
    ),
    {
        table: 'ai_writeback_run',
        id: 'ai_writeback_run_uuid',
        fact: 'agent_writeback_run_recorded',
        scope: 'organization',
        fields: {
            user_id: 's.created_by_user_uuid',
            thread_id: 's.ai_thread_uuid',
            prompt_id: 's.prompt_uuid',
            current_status: 's.status',
            context: 's.source',
        },
    },
    ...[
        { fact: 'deep_research_run_recorded', timestamp: 'created_at' },
        { fact: 'deep_research_run_started', timestamp: 'started_at' },
        { fact: 'deep_research_run_completed', timestamp: 'completed_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_deep_research_runs',
            id: 'ai_deep_research_run_uuid',
            fact,
            timestamp,
            scope: 'organization',
            fields: {
                user_id: 's.created_by_user_uuid',
                agent_id: 's.agent_uuid',
                thread_id: 's.ai_thread_uuid',
                prompt_id: 's.prompt_uuid',
                current_status: 's.status',
                context: 's.entry_point',
                stage: 's.failure_stage',
                ...(fact === 'deep_research_run_recorded'
                    ? {
                          duration_ms: 's.duration_ms',
                          input_tokens: 's.input_tokens',
                          output_tokens: 's.output_tokens',
                          total_tokens: 's.total_tokens',
                      }
                    : {}),
            },
        }),
    ),
    {
        table: 'ai_deep_research_events',
        id: 'ai_deep_research_event_uuid',
        fact: 'deep_research_event_recorded',
        scope: 'research',
        fields: { stage: 's.event_type' },
    },
    ...[
        { fact: 'agent_slack_delivery_recorded', timestamp: 'created_at' },
        { fact: 'agent_slack_delivery_finished', timestamp: 'finished_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_slack_artifact_deliveries',
            id: 'ai_prompt_uuid',
            fact,
            timestamp,
            scope: 'prompt',
            fields: { current_status: 's.outcome' },
        }),
    ),
    {
        table: 'mcp_tool_call',
        id: 'mcp_tool_call_uuid',
        fact: 'mcp_call_recorded',
        scope: 'organization',
        fields: {
            user_id:
                "CASE WHEN s.auth_type <> 'service-account' THEN s.user_uuid END",
            agent_id: 's.agent_uuid',
            tool_name: 's.tool_name',
            current_status: 's.status',
            duration_ms: 's.duration_ms',
            success: "s.status = 'success'",
            direction: 's.direction',
        },
    },
    {
        table: 'agent_action_log',
        id: 'agent_action_log_uuid',
        fact: 'agent_action_recorded',
        timestamp: 'occurred_at',
        scope: 'organization',
        fields: {
            content_id: 's.object_uuid',
            content_type: 's.object_type',
            current_status: 's.outcome',
            context: 's.action',
            stage: 's.policy_layer',
            success: "s.outcome = 'allowed'",
        },
    },
    {
        table: 'scheduler_log',
        id: 'scheduler_log_uuid',
        fact: 'export_job_recorded',
        scope: 'export',
        fields: {
            user_id: "s.details->>'createdByUserUuid'",
            current_status: 's.status',
            context: 's.task',
        },
    },
    ...[
        { fact: 'agent_router_decision_recorded', timestamp: 'created_at' },
        { fact: 'agent_router_decision_committed', timestamp: 'committed_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_router_decision',
            id: 'ai_router_decision_uuid',
            fact,
            timestamp,
            scope: 'router',
            fields: {
                user_id: 's.user_uuid',
                agent_id: 's.chosen_agent_uuid',
                thread_id: 's.thread_uuid',
                context: 's.selection_mode',
            },
        }),
    ),
    ...[
        { fact: 'agent_evaluation_run_recorded', timestamp: 'created_at' },
        { fact: 'agent_evaluation_run_completed', timestamp: 'completed_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_eval_run',
            id: 'ai_eval_run_uuid',
            fact,
            timestamp,
            scope: 'evaluation',
            fields: { current_status: 's.status' },
        }),
    ),
    ...[
        { fact: 'agent_evaluation_result_recorded', timestamp: 'created_at' },
        {
            fact: 'agent_evaluation_result_completed',
            timestamp: 'completed_at',
        },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_eval_run_result',
            id: 'ai_eval_run_result_uuid',
            fact,
            timestamp,
            scope: 'evaluationResult',
            fields: {
                current_status: 's.status',
                thread_id: 's.ai_thread_uuid',
            },
        }),
    ),
    {
        table: 'ai_eval_run_result_assessment',
        id: 'ai_eval_run_result_assessment_uuid',
        fact: 'agent_evaluation_assessed',
        timestamp: 'assessed_at',
        scope: 'evaluationAssessment',
        fields: {
            user_id: 's.assessed_by_user_uuid',
            context: 's.assessment_type',
            success: 's.passed',
        },
    },
    {
        table: 'ai_artifacts',
        id: 'ai_artifact_uuid',
        fact: 'agent_artifact_recorded',
        scope: 'thread',
        fields: {
            content_id: 's.ai_artifact_uuid',
            content_type: 's.artifact_type',
        },
    },
    {
        table: 'ai_artifact_versions',
        id: 'ai_artifact_version_uuid',
        fact: 'agent_artifact_version_recorded',
        scope: 'artifact',
        fields: {
            content_id: 's.ai_artifact_uuid',
            content_type: 'a.artifact_type',
            prompt_id: 's.ai_prompt_uuid',
            version: 's.version_number',
        },
    },
    ...[
        { fact: 'agent_file_uploaded', timestamp: 'created_at' },
        { fact: 'agent_file_claimed', timestamp: 'claimed_at' },
    ].map(
        ({ fact, timestamp }): HistorySource => ({
            table: 'ai_thread_file',
            id: 'ai_thread_file_uuid',
            fact,
            timestamp,
            scope: 'threadFile',
            fields: {
                user_id: 's.created_by_user_uuid',
                thread_id: 's.ai_thread_uuid',
                prompt_id: 's.ai_prompt_uuid',
            },
        }),
    ),
];

/** Only retained rows are recoverable. Cleanup windows are not eligibility
 * cutoffs here: a customer may still retain older history or pruned snapshots. */
export class UsageAdditionalHistoryModel {
    constructor(private readonly database: Knex) {}

    private jsonSelection(fields: Record<string, string>) {
        // Keys and expressions are a closed, internal whitelist. SQL values
        // (organization, cursor, snapshot boundary) remain parameter bindings.
        return this.database.raw(
            `json_build_object(${Object.entries(fields)
                .map(([key, expression]) => `'${key}', ${expression}`)
                .join(', ')})::text as json_line`,
        );
    }

    private withProjectOwnership(
        query: Knex.QueryBuilder,
        project: string,
        organizationUuid: string,
    ) {
        return query
            .leftJoin('projects as p', function joinProject() {
                this.on(
                    query.client.raw('p.project_uuid::text'),
                    '=',
                    query.client.raw(`${project}::text`),
                );
            })
            .leftJoin(
                'organizations as o',
                'o.organization_id',
                'p.organization_id',
            )
            .where((owner) =>
                owner
                    .whereRaw(`${project} is null`)
                    .orWhere('o.organization_uuid', organizationUuid),
            );
    }

    private async *pages(
        query: Knex.QueryBuilder,
        id: string,
    ): AsyncGenerator<string> {
        let cursor: string | undefined;
        while (true) {
            const page = query
                .clone()
                .select(`${id} as cursor`)
                .orderBy(id)
                .limit(1000);
            if (cursor) page.where(id, '>', cursor);
            // Each page releases its connection before storage/consumer work.
            // eslint-disable-next-line no-await-in-loop
            const rows = await this.database.transaction(async (trx) => {
                await trx.raw('SET TRANSACTION READ ONLY');
                await trx.raw("SET LOCAL statement_timeout = '10s'");
                await trx.raw("SET LOCAL lock_timeout = '1s'");
                await trx.raw("SET LOCAL TIME ZONE 'UTC'");
                return page.transacting(trx);
            });
            if (!rows.length) return;
            for (const row of rows) {
                // PostgreSQL serializes bigint and microsecond timestamps. Do
                // not round-trip through JS numbers or Date before Parquet.
                yield `${row.json_line}\n`;
            }
            cursor = rows[rows.length - 1].cursor;
        }
    }

    async *getAiUsageJsonLines(
        organizationUuid: string,
        before: string,
    ): AsyncGenerator<string> {
        const fields = {
            ...Object.fromEntries(
                aiUsageCompactedColumns.map(({ name }) => [name, 'NULL']),
            ),
            event_name: "'ai.usage'",
            org_id: 's.organization_uuid',
            project_id: 's.project_uuid',
            user_id: 's.user_uuid',
            event_id: 's.event_id',
            event_ts: `to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
            schema_version: '1',
            history_origin: "'database'",
            outcome: 's.outcome',
            feature: 's.feature',
            function_id: 's.function_id',
            agent_id: 's.agent_uuid',
            thread_id: 's.thread_uuid',
            prompt_id: 's.prompt_uuid',
            model: 's.model',
            provider: 's.provider',
            key_management: 's.key_management',
            channel: 's.usage_channel',
            ...Object.fromEntries(
                [
                    'input_tokens',
                    'output_tokens',
                    'cache_read_tokens',
                    'cache_write_tokens',
                    'reasoning_tokens',
                    'total_tokens',
                ].map((name) => [name, `s.${name}`]),
            ),
        };
        const query = this.withProjectOwnership(
            this.database('ai_usage_ledger as s')
                .where('s.organization_uuid', organizationUuid)
                .where('s.created_at', '<', before),
            's.project_uuid',
            organizationUuid,
        ).select(this.jsonSelection(fields));
        yield* this.pages(query, 's.ai_usage_ledger_uuid');
    }

    async *getActivityJsonLines(
        organizationUuid: string,
        before: string,
    ): AsyncGenerator<string> {
        for (const source of activitySources) {
            const timestamp = `s.${source.timestamp ?? 'created_at'}`;
            const fields: Record<string, string> = {
                ...Object.fromEntries(
                    historicalActivityColumns.map(({ name }) => [name, 'NULL']),
                ),
                history_source: `'${source.table}'`,
                record_id: `'${source.fact}:' || s.${source.id}::text`,
                activity_type: `'${source.fact}'`,
                event_ts: `to_char(${timestamp}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
                schema_version: '1',
            };
            let query: Knex.QueryBuilder = this.database(
                `${source.table} as s`,
            );
            let owner = 's';
            let projectOverride: string | undefined;
            if (source.scope === 'prompt' || source.scope === 'thread') {
                if (source.scope === 'prompt') {
                    const prompt = source.table === 'ai_prompt' ? 's' : 'ap';
                    if (prompt === 'ap')
                        query.join(
                            'ai_prompt as ap',
                            'ap.ai_prompt_uuid',
                            's.ai_prompt_uuid',
                        );
                    query.join(
                        'ai_thread as t',
                        't.ai_thread_uuid',
                        `${prompt}.ai_thread_uuid`,
                    );
                    fields.user_id = `${prompt}.created_by_user_uuid`;
                    fields.prompt_id = `${prompt}.ai_prompt_uuid`;
                } else {
                    query.join(
                        'ai_thread as t',
                        't.ai_thread_uuid',
                        's.ai_thread_uuid',
                    );
                }
                owner = 't';
                fields.thread_id = 't.ai_thread_uuid';
                fields.agent_id = 't.agent_uuid';
            } else if (source.scope === 'research') {
                query.join(
                    'ai_deep_research_runs as r',
                    'r.ai_deep_research_run_uuid',
                    's.ai_deep_research_run_uuid',
                );
                owner = 'r';
                fields.user_id = 'r.created_by_user_uuid';
                fields.thread_id = 'r.ai_thread_uuid';
                fields.prompt_id = 'r.prompt_uuid';
                fields.agent_id = 'r.agent_uuid';
            } else if (source.scope === 'router') {
                query.join(
                    'ai_router as rt',
                    'rt.ai_router_uuid',
                    's.ai_router_uuid',
                );
                owner = 'rt';
                // Router decisions can precede agent/project selection.
                projectOverride = 'NULL';
            } else if (
                source.scope === 'evaluation' ||
                source.scope === 'evaluationResult' ||
                source.scope === 'evaluationAssessment'
            ) {
                if (source.scope === 'evaluationAssessment') {
                    query.join(
                        'ai_eval_run_result as er',
                        'er.ai_eval_run_result_uuid',
                        's.ai_eval_run_result_uuid',
                    );
                }
                if (source.scope !== 'evaluation') {
                    query.join(
                        'ai_eval_run as evr',
                        'evr.ai_eval_run_uuid',
                        source.scope === 'evaluationResult'
                            ? 's.ai_eval_run_uuid'
                            : 'er.ai_eval_run_uuid',
                    );
                }
                query
                    .join(
                        'ai_eval as e',
                        'e.ai_eval_uuid',
                        source.scope === 'evaluation'
                            ? 's.ai_eval_uuid'
                            : 'evr.ai_eval_uuid',
                    )
                    .join('ai_agent as ag', 'ag.ai_agent_uuid', 'e.agent_uuid');
                owner = 'ag';
                fields.agent_id = 'ag.ai_agent_uuid';
                fields.user_id = 'e.created_by_user_uuid';
                fields.context = "'evaluation'";
            } else if (source.scope === 'artifact') {
                query
                    .join(
                        'ai_artifacts as a',
                        'a.ai_artifact_uuid',
                        's.ai_artifact_uuid',
                    )
                    .join(
                        'ai_thread as t',
                        't.ai_thread_uuid',
                        'a.ai_thread_uuid',
                    );
                owner = 't';
                fields.thread_id = 't.ai_thread_uuid';
                fields.agent_id = 't.agent_uuid';
            } else if (source.scope === 'threadFile') {
                query
                    .leftJoin(
                        'ai_thread as t',
                        't.ai_thread_uuid',
                        's.ai_thread_uuid',
                    )
                    .where((ownedThread) =>
                        ownedThread
                            .whereNull('s.ai_thread_uuid')
                            .orWhere('t.organization_uuid', organizationUuid),
                    );
                projectOverride = 't.project_uuid';
            }
            const org =
                source.scope === 'export'
                    ? "s.details->>'organizationUuid'"
                    : `${owner}.organization_uuid`;
            const project =
                projectOverride ??
                (source.scope === 'export'
                    ? "s.details->>'projectUuid'"
                    : `${owner}.project_uuid`);
            fields.org_id = org;
            fields.project_id = project;
            query
                .whereRaw(`${org} = ?`, [organizationUuid])
                .where(timestamp, '<', before);
            query = this.withProjectOwnership(query, project, organizationUuid);
            if (source.scope === 'export') {
                // Only the two actual export-job tasks have this recorded
                // provenance. Delivering a scheduled message is not an export.
                query
                    .whereIn('s.task', [
                        SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
                        SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                    ])
                    .whereNotNull('p.project_uuid');
            }
            Object.assign(fields, source.fields);
            yield* this.pages(
                query.select(this.jsonSelection(fields)),
                `s.${source.id}`,
            );
        }
    }
}
