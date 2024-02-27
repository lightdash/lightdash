export type Notification = {
    notificationId: string;
    user: {
        name: string;
    };
    author: {
        name: string;
    };
    dashboard?: {
        uuid: string | null;
        name: string;
        tileUuid: string | null;
    };
    viewed: boolean;
    createdAt: Date;
};

export type ApiNotificationsResults = Notification[];

export enum NotificationType {
    DASHBOARD_COMMENTS = 'dashboardComments',
}

export type ApiGetNotifications = {
    status: 'ok';
    results: ApiNotificationsResults;
};

export type ApiCreateNotification = {
    status: 'ok';
};
