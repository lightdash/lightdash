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
    saved_chart_uuid: string | null;
};

type DbDashboardTileCommentsInsert = Pick<
    DbDashboardTileComments,
    | 'text'
    | 'dashboard_tile_uuid'
    | 'reply_to'
    | 'user_uuid'
    | 'saved_chart_uuid'
>;

type DbDashboardTileCommentsUpdate = Pick<DbDashboardTileComments, 'resolved'>;

export type DashboardTileCommentsTable = Knex.CompositeTableType<
    DbDashboardTileComments,
    DbDashboardTileCommentsInsert,
    DbDashboardTileCommentsUpdate
>;
