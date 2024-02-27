import { Knex } from 'knex';

export const NotificationsTableName = 'notifications';

export type DbNotifications = {
    notification_id: string;
    created_at: Date;
    viewed: boolean;
    user_uuid: string;
    // Dashboard tile comment-related fields
    comment_id: string | null;
    dashboard_uuid: string | null;
    dashboard_tile_uuid: string | null;
    comment_author_uuid: string | null;
};

type DbNotificationsInsert = Pick<
    DbNotifications,
    | 'user_uuid'
    | 'comment_id'
    | 'dashboard_uuid'
    | 'dashboard_tile_uuid'
    | 'comment_author_uuid'
>;

type DbNotificationsUpdate = Pick<DbNotifications, 'viewed'>;

export type NotificationsTable = Knex.CompositeTableType<
    DbNotifications,
    DbNotificationsInsert,
    DbNotificationsUpdate
>;
