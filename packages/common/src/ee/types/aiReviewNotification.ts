import { type ApiSuccess } from '../../types/api/success';

export enum AiReviewNotificationEvent {
    NeedsReview = 'needs_review',
    Assigned = 'assigned',
}

export enum AiReviewNotificationChannel {
    Bell = 'bell',
    SlackChannel = 'slack_channel',
    SlackDm = 'slack_dm',
}

export enum AiReviewNotificationStatus {
    Sent = 'sent',
    Errored = 'errored',
    Clicked = 'clicked',
    Dismissed = 'dismissed',
}

export type AiReviewNotificationSettings = {
    organizationUuid: string;
    enabled: boolean;
    slackChannelId: string | null;
};

export type UpdateAiReviewNotificationSettings = Pick<
    AiReviewNotificationSettings,
    'enabled' | 'slackChannelId'
>;

export type ApiAiReviewNotificationSettingsResponse =
    ApiSuccess<AiReviewNotificationSettings>;

export type AiReviewNotificationRecipient = {
    userUuid: string;
    email: string;
};
