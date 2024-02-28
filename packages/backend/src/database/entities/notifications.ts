import { Knex } from 'knex';

export const NotificationsTableName = 'notifications';

enum NotificationResourceType {
    Comment = 'comment',
}

interface NotificationDashboardTileCommentMetadata {
    dashboard_uuid: string;
    dashboard_name: string;
    dashboard_tile_uuid: string;
    dashboard_tile_name: string;
}

type NotificationMetadataTypes = {
    [NotificationResourceType.Comment]: NotificationDashboardTileCommentMetadata;
};

type DbNotifications<T extends NotificationResourceType> = {
    notification_id: string;
    created_at: Date;
    viewed: boolean;
    user_uuid: string;
    resource_uuid: string | null;
    message: string | null;
    url: string | null;
    resource_type: T;
    metadata: NotificationMetadataTypes[T] | null;
};

type DbNotificationsInsertComment = Pick<
    DbNotifications<NotificationResourceType.Comment>,
    'user_uuid' | 'metadata' | 'resource_uuid' | 'message' | 'url'
>;

type DbNotificationsUpdate = Pick<
    DbNotifications<NotificationResourceType>,
    'viewed'
>;

export type NotificationsTable = Knex.CompositeTableType<
    DbNotifications<NotificationResourceType>,
    DbNotificationsInsertComment,
    DbNotificationsUpdate
>;
