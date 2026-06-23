import {
    ApiNotificationResourceType,
    ApiNotificationUpdateParams,
    Comment,
    DashboardDAO,
    DashboardTile,
    LightdashUser,
    NotificationAiReview,
    NotificationDashboardComment,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbNotificationDashboardTileCommentMetadata,
    DbNotificationResourceType,
    NotificationsTableName,
} from '../../database/entities/notifications';

type NotificationsModelArguments = {
    database: Knex;
};

export class NotificationsModel {
    private readonly database: Knex;

    constructor(args: NotificationsModelArguments) {
        this.database = args.database;
    }

    async getDashboardCommentNotifications(
        userUuid: string,
    ): Promise<NotificationDashboardComment[]> {
        const notifications = await this.database(NotificationsTableName)
            .select()
            .where(`${NotificationsTableName}.user_uuid`, userUuid)
            .andWhere(
                `${NotificationsTableName}.resource_type`,
                DbNotificationResourceType.DashboardComments,
            )
            .orderBy(`${NotificationsTableName}.created_at`, 'desc');

        return notifications.map((notif) => {
            const metadata =
                notif.metadata as DbNotificationDashboardTileCommentMetadata | null;

            return {
                notificationId: notif.notification_id,
                resourceType: ApiNotificationResourceType.DashboardComments,
                message: notif.message ?? undefined,
                url: notif.url ?? undefined,
                viewed: notif.viewed,
                createdAt: notif.created_at,
                resourceUuid: notif.resource_uuid ?? undefined,
                metadata: metadata
                    ? {
                          dashboardUuid: metadata.dashboard_uuid,
                          dashboardName: metadata.dashboard_name,
                          dashboardTileUuid: metadata.dashboard_tile_uuid,
                          dashboardTileName: metadata.dashboard_tile_name,
                      }
                    : undefined,
            };
        });
    }

    async getAiReviewNotifications(
        userUuid: string,
    ): Promise<NotificationAiReview[]> {
        const notifications = await this.database(NotificationsTableName)
            .select()
            .where(`${NotificationsTableName}.user_uuid`, userUuid)
            .andWhere(
                `${NotificationsTableName}.resource_type`,
                DbNotificationResourceType.AiReviewItem,
            )
            .orderBy(`${NotificationsTableName}.created_at`, 'desc');

        return notifications.map((notif) => ({
            notificationId: notif.notification_id,
            resourceType: ApiNotificationResourceType.AiReview,
            message: notif.message ?? undefined,
            url: notif.url ?? undefined,
            viewed: notif.viewed,
            createdAt: notif.created_at,
            resourceUuid: notif.resource_uuid ?? undefined,
            metadata: notif.metadata as NotificationAiReview['metadata'],
        }));
    }

    async updateNotification(
        notificationUuid: string,
        updateData: ApiNotificationUpdateParams,
    ) {
        return this.database(NotificationsTableName)
            .where({ notification_id: notificationUuid })
            .update({ viewed: updateData.viewed });
    }

    private static generateDashboardCommentNotificationMessage({
        commentAuthor,
        dashboardName,
        dashboardTileTitle,
        tagged,
    }: {
        commentAuthor: LightdashUser;
        dashboardName: string;
        dashboardTileTitle: string | undefined;
        tagged: boolean;
    }) {
        return `${commentAuthor.firstName} ${commentAuthor.lastName} ${
            tagged ? 'tagged you' : 'commented'
        } in dashboard "${dashboardName}" ${
            dashboardTileTitle ? `in tile "${dashboardTileTitle}"` : ''
        }`;
    }

    async createDashboardCommentNotification({
        userUuid,
        commentAuthor,
        comment,
        usersToNotify,
        dashboard,
        dashboardTile,
    }: {
        userUuid: string;
        commentAuthor: LightdashUser;
        comment: Comment;
        usersToNotify: { userUuid: string; tagged: boolean }[];
        dashboard: DashboardDAO;
        dashboardTile: DashboardTile;
    }) {
        await Promise.all(
            usersToNotify.map(async (mentionUserUuid) => {
                if (mentionUserUuid.userUuid !== userUuid) {
                    await this.database(NotificationsTableName).insert({
                        user_uuid: mentionUserUuid.userUuid,
                        resource_uuid: comment.commentId,
                        resource_type:
                            DbNotificationResourceType.DashboardComments,
                        message:
                            NotificationsModel.generateDashboardCommentNotificationMessage(
                                {
                                    commentAuthor,
                                    dashboardName: dashboard.name,
                                    dashboardTileTitle:
                                        dashboardTile.properties.title ?? '',
                                    tagged: mentionUserUuid.tagged,
                                },
                            ),
                        url: `/dashboards/${dashboard.uuid}`,
                        metadata: JSON.stringify({
                            dashboard_uuid: dashboard.uuid,
                            dashboard_name: dashboard.name,
                            dashboard_tile_uuid: dashboardTile.uuid,
                            dashboard_tile_name:
                                dashboardTile.properties.title ?? '',
                        }),
                    });
                }
            }),
        );
    }

    async createAiReviewNotifications({
        recipients,
        metadata,
        message,
        url,
    }: {
        recipients: { userUuid: string }[];
        metadata: NotificationAiReview['metadata'];
        message: string;
        url: string;
    }): Promise<void> {
        await Promise.all(
            recipients.map(async ({ userUuid }) => {
                await this.database(NotificationsTableName).insert({
                    user_uuid: userUuid,
                    resource_uuid: metadata.fingerprint,
                    resource_type: DbNotificationResourceType.AiReviewItem,
                    message,
                    url,
                    metadata: JSON.stringify(metadata),
                });
            }),
        );
    }
}
