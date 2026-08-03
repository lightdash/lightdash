import {
    type AiDeepResearchBudget,
    type AiDeepResearchChartDataMap,
    type AiDeepResearchEntryPoint,
    type AiDeepResearchEventPayload,
    type AiDeepResearchEventType,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchRunStatus,
    type AiDeepResearchTerminalReason,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export type DbAiDeepResearchRun = {
    ai_deep_research_run_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string;
    agent_uuid: string;
    ai_thread_uuid: string;
    prompt_uuid: string;
    tool_call_id: string | null;
    prompt: string;
    status: AiDeepResearchRunStatus;
    entry_point: AiDeepResearchEntryPoint;
    result_markdown: string | null;
    result_chart_data: AiDeepResearchChartDataMap | null;
    report_expires_at: Date | null;
    report_expired_at: Date | null;
    budget_snapshot: AiDeepResearchBudget;
    execution_context_snapshot: AiDeepResearchExecutionContextSnapshot;
    input_tokens: number | null;
    output_tokens: number | null;
    cache_read_tokens: number | null;
    cache_write_tokens: number | null;
    reasoning_tokens: number | null;
    total_tokens: number | null;
    token_usage_complete: boolean | null;
    duration_ms: number | null;
    tool_call_count: number | null;
    tool_error_count: number | null;
    warehouse_query_count: number | null;
    findings_count: number | null;
    chart_count: number | null;
    error_message: string | null;
    cancellation_requested_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiDeepResearchRunsTable = Knex.CompositeTableType<
    DbAiDeepResearchRun,
    Pick<
        DbAiDeepResearchRun,
        | 'organization_uuid'
        | 'project_uuid'
        | 'created_by_user_uuid'
        | 'agent_uuid'
        | 'ai_thread_uuid'
        | 'prompt_uuid'
        | 'tool_call_id'
        | 'prompt'
        | 'entry_point'
        | 'budget_snapshot'
        | 'execution_context_snapshot'
    >,
    Partial<
        Pick<
            DbAiDeepResearchRun,
            | 'status'
            | 'result_markdown'
            | 'result_chart_data'
            | 'report_expires_at'
            | 'report_expired_at'
            | 'error_message'
            | 'cancellation_requested_at'
            | 'started_at'
            | 'completed_at'
            | 'updated_at'
            | 'execution_context_snapshot'
            | 'input_tokens'
            | 'output_tokens'
            | 'cache_read_tokens'
            | 'cache_write_tokens'
            | 'reasoning_tokens'
            | 'total_tokens'
            | 'token_usage_complete'
            | 'duration_ms'
            | 'tool_call_count'
            | 'tool_error_count'
            | 'warehouse_query_count'
            | 'findings_count'
            | 'chart_count'
        >
    >
>;

export const AiDeepResearchEventsTableName = 'ai_deep_research_events';

export type DbAiDeepResearchEvent = {
    ai_deep_research_event_uuid: string;
    ai_deep_research_run_uuid: string;
    event_type: AiDeepResearchEventType;
    payload: AiDeepResearchEventPayload;
    created_at: Date;
};

export type AiDeepResearchEventsTable = Knex.CompositeTableType<
    DbAiDeepResearchEvent,
    Pick<
        DbAiDeepResearchEvent,
        'ai_deep_research_run_uuid' | 'event_type' | 'payload'
    > &
        Partial<Pick<DbAiDeepResearchEvent, 'created_at'>>
>;

export const AiDeepResearchAnalyticsOutboxTableName =
    'ai_deep_research_analytics_outbox';

export type AiDeepResearchAnalyticsEventType = 'run_started' | 'run_completed';

export type DbAiDeepResearchAnalyticsOutbox = {
    ai_deep_research_analytics_event_uuid: string;
    ai_deep_research_run_uuid: string;
    event_type: AiDeepResearchAnalyticsEventType;
    terminal_reason: AiDeepResearchTerminalReason | null;
    delivered_at: Date | null;
    created_at: Date;
};

export type AiDeepResearchAnalyticsOutboxTable = Knex.CompositeTableType<
    DbAiDeepResearchAnalyticsOutbox,
    Pick<
        DbAiDeepResearchAnalyticsOutbox,
        'ai_deep_research_run_uuid' | 'event_type' | 'terminal_reason'
    >,
    Pick<DbAiDeepResearchAnalyticsOutbox, 'delivered_at'>
>;
