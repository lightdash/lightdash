import {
    type AgentOnboardingHandoff,
    type AgentOnboardingRunEvent,
    type AgentOnboardingRunStatus,
    type AgentOnboardingStage,
    type AgentOnboardingUsage,
} from '@lightdash/common';
import { Knex } from 'knex';

export const AgentOnboardingRunsTableName = 'agent_onboarding_runs';

export type DbAgentOnboardingFile = {
    path: string;
    s3Key: string;
    sizeBytes: number;
    updatedAt: string;
};

export type DbAgentOnboardingRun = {
    agent_onboarding_run_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string;
    status: AgentOnboardingRunStatus;
    stage: AgentOnboardingStage | null;
    events: AgentOnboardingRunEvent[];
    handoff: AgentOnboardingHandoff | null;
    usage: AgentOnboardingUsage | null;
    files: DbAgentOnboardingFile[];
    pat_uuid: string | null;
    sandbox_uuid: string | null;
    error_message: string | null;
    cancellation_requested_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

type DbAgentOnboardingRunUpdate = Partial<
    Pick<
        DbAgentOnboardingRun,
        | 'status'
        | 'stage'
        | 'events'
        | 'handoff'
        | 'usage'
        | 'pat_uuid'
        | 'sandbox_uuid'
        | 'error_message'
        | 'cancellation_requested_at'
        | 'started_at'
        | 'completed_at'
        | 'updated_at'
    > & { files: string }
>;

export type AgentOnboardingRunsTable = Knex.CompositeTableType<
    DbAgentOnboardingRun,
    Pick<
        DbAgentOnboardingRun,
        'organization_uuid' | 'project_uuid' | 'created_by_user_uuid'
    >,
    DbAgentOnboardingRunUpdate
>;
