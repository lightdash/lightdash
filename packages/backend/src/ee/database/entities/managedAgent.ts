import { type Knex } from 'knex';

export const ManagedAgentSettingsTableName = 'managed_agent_settings';
export const ManagedAgentActionsTableName = 'managed_agent_actions';

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
>;

export type DbManagedAgentActionUpdate = Partial<
    Pick<DbManagedAgentAction, 'reversed_at' | 'reversed_by_user_uuid'>
>;

export type ManagedAgentActionsTable = Knex.CompositeTableType<
    DbManagedAgentAction,
    DbManagedAgentActionCreate,
    DbManagedAgentActionUpdate
>;
