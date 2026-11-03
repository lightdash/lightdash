import { Knex } from 'knex';

export const AnalyticsContentSyncTableName = 'analytics_content_sync';

export type DbAnalyticsContentSync = {
    project_uuid: string;
    system_user_uuid: string | null;
    applied_hash: string | null;
    applied_version: string | null;
    last_synced_at: Date | null;
};

export type AnalyticsContentSyncTable =
    Knex.CompositeTableType<DbAnalyticsContentSync>;
