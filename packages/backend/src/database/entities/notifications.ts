import { Knex } from 'knex';

export enum DbNotificationResourceType {
    DashboardComments = 'dashboard_comments',
}

export const NotificationsTableName = 'notifications';

interface NotificationDashboardTileCommentMetadata {
    dashboard_uuid: string;
    dashboard_name: string;
    dashboard_tile_uuid: string;
    dashboard_tile_name: string;
}

type DbNotifications = {
    notification_id: string;
    created_at: Date;
    viewed: boolean;
    user_uuid: string;
    resource_uuid: string | null;
    message: string | null;
    url: string | null;
    resource_type: DbNotificationResourceType;
    metadata: NotificationDashboardTileCommentMetadata | null;
};

type DbNotificationsInsertComment = Pick<
    DbNotifications,
    'user_uuid' | 'resource_uuid' | 'resource_type' | 'message' | 'url'
> & {
    metadata: string; // JSON string
};

type DbNotificationsUpdate = Pick<DbNotifications, 'viewed'>;

export type NotificationsTable = Knex.CompositeTableType<
    DbNotifications,
    DbNotificationsInsertComment,
    DbNotificationsUpdate
>;
