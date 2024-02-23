import { Knex } from 'knex';

export const DashboardTileCommentsTableName = 'dashboard_tile_comments';

export type DbDashboardTileComments = {
    comment_id: string;
    created_at: Date;
    text: string;
    reply_to: string | null;
    dashboard_tile_uuid: string;
    user_uuid: string;
    resolved: boolean;
};

export type DashboardTileCommentsTable =
    Knex.CompositeTableType<DbDashboardTileComments>;
