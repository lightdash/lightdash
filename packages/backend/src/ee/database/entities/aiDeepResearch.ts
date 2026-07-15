import {
    type AiDeepResearchArtifact,
    type AiDeepResearchBudget,
    type AiDeepResearchCheckpoint,
    type AiDeepResearchEventPayload,
    type AiDeepResearchEventType,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchPolicy,
    type AiDeepResearchRunStatus,
    type AiDeepResearchTimings,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

export type DbAiDeepResearchRun = {
    ai_deep_research_run_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string;
    agent_uuid: string | null;
    ai_thread_uuid: string | null;
    prompt_uuid: string | null;
    tool_call_id: string | null;
    prompt: string;
    status: AiDeepResearchRunStatus;
    claude_session_id: string | null;
    result: AiDeepResearchArtifact | null;
    budget_snapshot: AiDeepResearchBudget;
    policy_snapshot: AiDeepResearchPolicy;
    execution_context_snapshot: AiDeepResearchExecutionContextSnapshot | null;
    checkpoint: AiDeepResearchCheckpoint | null;
    timings: AiDeepResearchTimings | null;
    execution_attempts: number;
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
        | 'budget_snapshot'
        | 'policy_snapshot'
    >,
    Partial<
        Pick<
            DbAiDeepResearchRun,
            | 'status'
            | 'claude_session_id'
            | 'result'
            | 'execution_context_snapshot'
            | 'checkpoint'
            | 'timings'
            | 'execution_attempts'
            | 'error_message'
            | 'cancellation_requested_at'
            | 'started_at'
            | 'completed_at'
            | 'updated_at'
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
