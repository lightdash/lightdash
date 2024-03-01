import {
    ApiNotificationResourceType,
    ApiNotificationUpdateParams,
    assertUnreachable,
    Notification,
} from '@lightdash/common';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';

type NotificationsServiceArguments = {
    notificationsModel: NotificationsModel;
};

export class NotificationsService {
    notificationsModel: NotificationsModel;

    constructor({ notificationsModel }: NotificationsServiceArguments) {
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
                return assertUnreachable(
                    type,
                    `Unknown notification resource type ${type}`,
                );
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
