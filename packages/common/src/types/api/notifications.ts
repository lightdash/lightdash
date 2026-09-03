import { type AiReviewNotificationEvent } from '../../ee/types/aiReviewNotification';
import {
    type ContentReviewContentType,
    type ContentReviewNotificationEvent,
} from '../contentReviewRequests';

export enum ApiNotificationResourceType {
    DashboardComments = 'dashboardComments',
    AiReview = 'aiReview',
    ContentReview = 'contentReview',
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

export type NotificationContentReview = NotificationBase & {
    resourceType: ApiNotificationResourceType.ContentReview;
    metadata: {
        requestUuid: string;
        projectUuid: string;
        contentType: ContentReviewContentType;
        contentUuid: string;
        contentName: string;
        targetSpaceName: string;
        requesterName: string;
        event: ContentReviewNotificationEvent;
    };
};

export type Notification =
    | NotificationDashboardComment
    | NotificationAiReview
    | NotificationContentReview;

export type ApiNotificationUpdateParams = Pick<Notification, 'viewed'>;
export type ApiNotificationsResults = Notification[];

export type ApiGetNotifications = {
    status: 'ok';
    results: ApiNotificationsResults;
};
