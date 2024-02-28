import {
    ApiNotificationResourceType,
    ApiNotificationUpdateParams,
    Notification,
} from '@lightdash/common';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';

type Dependencies = {
    notificationsModel: NotificationsModel;
};

export class NotificationsService {
    notificationsModel: NotificationsModel;

    constructor({ notificationsModel }: Dependencies) {
        this.notificationsModel = notificationsModel;
    }

    async getNotifications(
        userUuid: string,
        type: ApiNotificationResourceType,
    ): Promise<Notification[]> {
        switch (type) {
            case ApiNotificationResourceType.DashboardComments:
                return this.notificationsModel.getDashboardCommentNotifications(
                    userUuid,
                );
            default:
                return [];
        }
    }

    async updateNotification(
        notificationId: string,
        updateData: ApiNotificationUpdateParams,
    ): Promise<number> {
        return this.notificationsModel.updateNotification(
            notificationId,
            updateData,
        );
    }
}
