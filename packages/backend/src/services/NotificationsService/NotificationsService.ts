import { Notification } from '@lightdash/common';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';

type Dependencies = {
    notificationsModel: NotificationsModel;
};

export class NotificationsService {
    notificationsModel: NotificationsModel;

    constructor({ notificationsModel }: Dependencies) {
        this.notificationsModel = notificationsModel;
    }

    async getDashboardCommentNotifications(
        userUuid: string,
    ): Promise<Notification[]> {
        return this.notificationsModel.getDashboardCommentNotifications(
            userUuid,
        );
    }

    async createDashboardCommentNotification(
        userUuid: string,
        commentId: string,
        dashboardUuid: string,
    ) {
        return this.notificationsModel.createDashboardCommentNotification(
            userUuid,
            commentId,
            dashboardUuid,
        );
    }
}
