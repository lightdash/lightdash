import { type Knex } from 'knex';

export const ManagedAgentSettingsTableName = 'managed_agent_settings';
export const ManagedAgentActionsTableName = 'managed_agent_actions';

export type DbManagedAgentSettings = {
    project_uuid: string;
    enabled: boolean;
    schedule_cron: string;
    enabled_by_user_uuid: string | null;
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
            'enabled' | 'schedule_cron' | 'enabled_by_user_uuid'
        >
    >;

export type DbManagedAgentSettingsUpdate = Partial<
    Pick<
        DbManagedAgentSettings,
        'enabled' | 'schedule_cron' | 'enabled_by_user_uuid' | 'updated_at'
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

export type DbManagedAgentActionCreate = Omit<
    DbManagedAgentAction,
    'action_uuid' | 'reversed_at' | 'reversed_by_user_uuid' | 'created_at'
>;

export type ManagedAgentActionsTable = Knex.CompositeTableType<
    DbManagedAgentAction,
    DbManagedAgentActionCreate
>;
