import { type AiReviewNotificationEvent } from '../../ee/types/aiReviewNotification';

export enum ApiNotificationResourceType {
    DashboardComments = 'dashboardComments',
    AiReview = 'aiReview',
}

interface NotificationDashboardTileCommentMetadata {
    dashboardUuid: string;
    dashboardName: string;
    dashboardTileUuid: string;
    dashboardTileName: string;
}

export type NotificationBase = {
    notificationId: string;
    createdAt: Date;
    viewed: boolean;
    resourceUuid: string | undefined;
    message: string | undefined;
    url: string | undefined;
};

export type NotificationDashboardComment = NotificationBase & {
    resourceType: ApiNotificationResourceType.DashboardComments;
    metadata: NotificationDashboardTileCommentMetadata | undefined;
};

export type NotificationAiReview = NotificationBase & {
    resourceType: ApiNotificationResourceType.AiReview;
    metadata: {
        fingerprint: string;
        event: AiReviewNotificationEvent;
        title: string;
        rootCause: string;
        projectUuid: string;
        count: number;
        searchParams: string;
    };
};

export type Notification = NotificationDashboardComment | NotificationAiReview;

export type ApiNotificationUpdateParams = Pick<Notification, 'viewed'>;
export type ApiNotificationsResults = Notification[];

export type ApiGetNotifications = {
    status: 'ok';
    results: ApiNotificationsResults;
};
