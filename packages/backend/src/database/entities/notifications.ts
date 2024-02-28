import { NotificationResourceType } from '@lightdash/common';
import { Knex } from 'knex';

export const NotificationsTableName = 'notifications';

interface NotificationDashboardTileCommentMetadata {
    dashboard_uuid: string;
    dashboard_name: string;
    dashboard_tile_uuid: string;
    dashboard_tile_name: string;
}

type NotificationMetadataTypes = {
    [NotificationResourceType.DashboardComments]: NotificationDashboardTileCommentMetadata;
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
    DbNotifications<NotificationResourceType.DashboardComments>,
    'user_uuid' | 'resource_uuid' | 'resource_type' | 'message' | 'url'
> & {
    metadata: string; // JSON string
};

type DbNotificationsUpdate = Pick<
    DbNotifications<NotificationResourceType>,
    'viewed'
>;

export type NotificationsTable = Knex.CompositeTableType<
    DbNotifications<NotificationResourceType>,
    DbNotificationsInsertComment,
    DbNotificationsUpdate
>;
