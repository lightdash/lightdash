import { Notification } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardTileCommentsTableName } from '../../database/entities/comments';
import { DashboardsTableName } from '../../database/entities/dashboards';
import {
    DbNotifications,
    NotificationsTableName,
} from '../../database/entities/notifications';
import { UserTableName } from '../../database/entities/users';

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
        })[] = await this.database(NotificationsTableName)
            .join(
                UserTableName,
                `${NotificationsTableName}.user_uuid`,
                '=',
                `${UserTableName}.user_uuid`,
            )
            .join(
                `${UserTableName} as comment_authors`,
                `${NotificationsTableName}.comment_author_uuid`,
                '=',
                'comment_authors.user_uuid',
            )
            .join(
                `${DashboardsTableName}`,
                `${NotificationsTableName}.dashboard_uuid`,
                '=',
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .join(
                DashboardTileCommentsTableName,
                `${NotificationsTableName}.comment_id`,
                '=',
                `${DashboardTileCommentsTableName}.comment_id`,
            )
            .select(
                `${NotificationsTableName}.notification_id`,
                `${NotificationsTableName}.viewed`,
                `${NotificationsTableName}.created_at`,
                `${NotificationsTableName}.dashboard_uuid`,
                `${NotificationsTableName}.dashboard_tile_uuid`,
                `${UserTableName}.first_name as user_first_name`,
                `${UserTableName}.last_name as user_last_name`,
                `${DashboardsTableName}.name as dashboard_name`,
                'comment_authors.first_name as author_first_name',
                'comment_authors.last_name as author_last_name',
            )
            .where(`${NotificationsTableName}.user_uuid`, userUuid)
            .orderBy(`${NotificationsTableName}.created_at`, 'desc');

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
    ) {
        const comment = await this.database(DashboardTileCommentsTableName)
            .where({ comment_id: commentId })
            .first();

        if (!comment) {
            throw new Error('Comment not found');
        }

        if (comment.mentions.length > 0) {
            await Promise.all(
                comment.mentions.map((mentionUserUuid) =>
                    this.database.transaction(async (trx) => {
                        if (mentionUserUuid !== userUuid) {
                            await trx(NotificationsTableName).insert({
                                user_uuid: mentionUserUuid,
                                comment_id: comment.comment_id,
                                comment_author_uuid: comment.user_uuid,
                                dashboard_tile_uuid:
                                    comment.dashboard_tile_uuid,
                                dashboard_uuid: dashboardUuid,
                            });
                        }
                    }),
                ),
            );
        }
    }
}
