import { type Knex } from 'knex';

export const ManagedAgentSettingsTableName = 'managed_agent_settings';
export const ManagedAgentActionsTableName = 'managed_agent_actions';
export const ManagedAgentRunsTableName = 'managed_agent_runs';

export type DbManagedAgentSettings = {
    project_uuid: string;
    enabled: boolean;
    schedule_cron: string;
    enabled_by_user_uuid: string | null;
    service_account_token: Buffer | null;
    anthropic_agent_id: string | null;
    anthropic_agent_config_hash: string | null;
    anthropic_agent_version: number | null;
    anthropic_environment_id: string | null;
    anthropic_vault_id: string | null;
    slack_channel_id: string | null;
    tool_settings: Record<string, boolean>;
    created_at: Date;
    updated_at: Date;
};

export type DbManagedAgentSettingsCreate = Pick<
    DbManagedAgentSettings,
    'project_uuid'
> &
    Partial<
        Pick<
            DbManagedAgentSettings,
            | 'enabled'
            | 'schedule_cron'
            | 'enabled_by_user_uuid'
            | 'service_account_token'
            | 'anthropic_agent_id'
            | 'anthropic_agent_config_hash'
            | 'anthropic_agent_version'
            | 'anthropic_environment_id'
            | 'anthropic_vault_id'
            | 'slack_channel_id'
            | 'tool_settings'
            | 'updated_at'
        >
    >;

export type DbManagedAgentSettingsUpdate = Partial<
    Pick<
        DbManagedAgentSettings,
        | 'enabled'
        | 'schedule_cron'
        | 'enabled_by_user_uuid'
        | 'service_account_token'
        | 'anthropic_agent_id'
        | 'anthropic_agent_config_hash'
        | 'anthropic_agent_version'
        | 'anthropic_environment_id'
        | 'anthropic_vault_id'
        | 'slack_channel_id'
        | 'tool_settings'
        | 'updated_at'
    >
>;

export type ManagedAgentSettingsTable = Knex.CompositeTableType<
    DbManagedAgentSettings,
    DbManagedAgentSettingsCreate,
    DbManagedAgentSettingsUpdate
>;

export type DbManagedAgentAction = {
    action_uuid: string;
    project_uuid: string;
    session_id: string;
    managed_agent_run_uuid: string | null;
    action_type: string;
    target_type: string;
    target_uuid: string;
    target_name: string;
    description: string;
    metadata: Record<string, unknown>;
    reversed_at: Date | null;
    reversed_by_user_uuid: string | null;
    created_at: Date;
};

export type DbManagedAgentActionWithReverser = DbManagedAgentAction & {
    reversed_by_first_name: string | null;
    reversed_by_last_name: string | null;
};

export type DbManagedAgentActionCreate = Omit<
    DbManagedAgentAction,
    'action_uuid' | 'reversed_at' | 'reversed_by_user_uuid' | 'created_at'
> & { managed_agent_run_uuid: string | null };

export type DbManagedAgentActionUpdate = Partial<
    Pick<DbManagedAgentAction, 'reversed_at' | 'reversed_by_user_uuid'>
>;

export type ManagedAgentActionsTable = Knex.CompositeTableType<
    DbManagedAgentAction,
    DbManagedAgentActionCreate,
    DbManagedAgentActionUpdate
>;

export type DbManagedAgentRun = {
    managed_agent_run_uuid: string;
    project_uuid: string;
    triggered_by: string;
    status: string;
    session_id: string | null;
    started_at: Date;
    finished_at: Date | null;
    action_count: number;
    summary: string | null;
    error: string | null;
    current_activity: string | null;
    created_at: Date;
};

export type DbManagedAgentRunCreate = Pick<
    DbManagedAgentRun,
    'project_uuid' | 'triggered_by' | 'status'
>;

export type DbManagedAgentRunUpdate = Partial<
    Pick<
        DbManagedAgentRun,
        | 'status'
        | 'session_id'
        | 'finished_at'
        | 'action_count'
        | 'summary'
        | 'error'
        | 'current_activity'
    >
>;

export type ManagedAgentRunsTable = Knex.CompositeTableType<
    DbManagedAgentRun,
    DbManagedAgentRunCreate,
    DbManagedAgentRunUpdate
>;
