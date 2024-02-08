import { Notification } from '@lightdash/common';
import { Knex } from 'knex';
import { DbNotifications } from '../../database/entities/notifications';

type NotificationsModelDependencies = {
    database: Knex;
};

export class NotificationsModel {
    private readonly database: Knex;

    constructor(deps: NotificationsModelDependencies) {
        this.database = deps.database;
    }

    async getDashboardCommentNotifications(
        userUuid: string,
    ): Promise<Notification[]> {
        const notificationsWithUserAndDashboardAndAuthor: (DbNotifications & {
            user_first_name: string;
            user_last_name: string;
            dashboard_name: string;
            author_first_name: string;
            author_last_name: string;
        })[] = await this.database('notifications')
            .join('users', 'notifications.user_uuid', '=', 'users.user_uuid')
            .join(
                'dashboards',
                'notifications.dashboard_uuid',
                '=',
                'dashboards.dashboard_uuid',
            )
            .join(
                'dashboard_tile_comments',
                'notifications.comment_id',
                '=',
                'dashboard_tile_comments.comment_id',
            )
            .join(
                'users as comment_authors',
                'dashboard_tile_comments.user_uuid',
                '=',
                'comment_authors.user_uuid',
            )
            .select(
                'notifications.*',
                'users.first_name as user_first_name',
                'users.last_name as user_last_name',
                'dashboards.name as dashboard_name',
                'comment_authors.first_name as author_first_name',
                'comment_authors.last_name as author_last_name',
            )
            .where('notifications.user_uuid', userUuid)
            .orderBy('notifications.created_at', 'desc');

        return notificationsWithUserAndDashboardAndAuthor.map((notif) => ({
            notificationId: notif.notification_id,
            user: {
                name: `${notif.user_first_name} ${notif.user_last_name}`,
            },
            author: {
                name: `${notif.author_first_name} ${notif.author_last_name}`,
            },
            dashboard: {
                uuid: notif.dashboard_uuid,
                name: notif.dashboard_name,
                tileUuid: notif.dashboard_tile_uuid,
            },
            viewed: notif.viewed,
            createdAt: notif.created_at,
        }));
    }

    async markNotificationAsRead(notificationUuid: string) {
        return this.database('notifications')
            .where({ notification_id: notificationUuid })
            .update({ viewed: true });
    }

    async createDashboardCommentNotification(
        userUuid: string,
        commentId: string,
        dashboardUuid: string,
        dashboardTileUuid: string,
    ) {
        // Get all users that have commented on the same tile, including the user who just commented
        const users = await this.database('dashboard_tile_comments')
            .where({ dashboard_tile_uuid: dashboardTileUuid })
            .distinct('user_uuid');

        await Promise.all(
            users.map((user) =>
                this.database.transaction(async (trx) => {
                    if (user.user_uuid === userUuid) {
                        // Only remove old notifications for the commenting user
                        await trx('notifications')
                            .where({
                                user_uuid: user.user_uuid,
                                dashboard_tile_uuid: dashboardTileUuid,
                            })
                            .delete();
                    } else {
                        await trx('notifications')
                            .where({
                                user_uuid: user.user_uuid,
                                dashboard_tile_uuid: dashboardTileUuid,
                            })
                            .delete();

                        await trx('notifications').insert({
                            user_uuid: user.user_uuid,
                            comment_id: commentId,
                            dashboard_tile_uuid: dashboardTileUuid,
                            dashboard_uuid: dashboardUuid,
                        });
                    }
                }),
            ),
        );
    }
}
