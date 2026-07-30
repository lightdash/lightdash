import {
    type AiDeepResearchBudget,
    type AiDeepResearchChartDataMap,
    type AiDeepResearchEffort,
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
    selected_mcp_server_uuids: string[];
    entry_point: AiDeepResearchEntryPoint;
    effort: AiDeepResearchEffort;
    result_markdown: string | null;
    result_chart_data: AiDeepResearchChartDataMap | null;
    /** Rows persisted before hypothesis fan-out lack `maxHypotheses`. */
    budget_snapshot: Omit<AiDeepResearchBudget, 'maxHypotheses'> &
        Partial<Pick<AiDeepResearchBudget, 'maxHypotheses'>>;
    execution_context_snapshot: AiDeepResearchExecutionContextSnapshot;
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
        | 'selected_mcp_server_uuids'
        | 'entry_point'
        | 'effort'
        | 'budget_snapshot'
        | 'execution_context_snapshot'
    >,
    Partial<
        Pick<
            DbAiDeepResearchRun,
            | 'status'
            | 'result_markdown'
            | 'result_chart_data'
            | 'error_message'
            | 'cancellation_requested_at'
            | 'started_at'
            | 'completed_at'
            | 'updated_at'
            | 'execution_context_snapshot'
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
