import {
    ApiNotificationResourceType,
    ApiNotificationUpdateParams,
    assertUnreachable,
    Notification,
} from '@lightdash/common';
import { NotificationsModel } from '../../models/NotificationsModel/NotificationsModel';
import { BaseService } from '../BaseService';

type NotificationsServiceArguments = {
    notificationsModel: NotificationsModel;
};

export class NotificationsService extends BaseService {
    notificationsModel: NotificationsModel;

    constructor({ notificationsModel }: NotificationsServiceArguments) {
        super();
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
