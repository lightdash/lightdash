import { Notification } from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';

type Dependencies = {
    dashboardModel: DashboardModel;
    notificationsModel: NotificationsModel;
};

export class NotificationsService {
    dashboardModel: DashboardModel;

    notificationsModel: NotificationsModel;

    constructor({ dashboardModel, notificationsModel }: Dependencies) {
        this.dashboardModel = dashboardModel;
        this.notificationsModel = notificationsModel;
    }

    async getDashboardCommentNotifications(
        userUuid: string,
    ): Promise<Notification[]> {
        return this.notificationsModel.getDashboardCommentNotifications(
            userUuid,
        );
    }

    async markNotificationAsRead(notificationUuid: string) {
        return this.notificationsModel.markNotificationAsRead(notificationUuid);
    }

    async createDashboardCommentNotification(
        userUuid: string,
        commentId: string,
        dashboardUuid: string,
        dashboardTileUuid: string,
    ) {
        return this.notificationsModel.createDashboardCommentNotification(
            userUuid,
            commentId,
            dashboardUuid,
            dashboardTileUuid,
        );
    }
}
