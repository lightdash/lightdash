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
    linearEnabled: boolean;
    linearTeamId: string | null;
    linearProjectId: string | null;
};

export type UpdateAiReviewNotificationSettings = {
    enabled: boolean;
    slackChannelId: string | null;
    linearEnabled?: boolean;
    linearTeamId?: string | null;
    linearProjectId?: string | null;
};

export type ApiAiReviewNotificationSettingsResponse =
    ApiSuccess<AiReviewNotificationSettings>;

export type AiReviewLinearDestination = {
    organizationUuid: string;
    projectUuid: string;
    enabled: boolean;
    linearTeamId: string | null;
    linearProjectId: string | null;
};

export type UpdateAiReviewLinearDestination = Pick<
    AiReviewLinearDestination,
    'enabled' | 'linearTeamId' | 'linearProjectId'
>;

export type ApiAiReviewLinearDestinationResponse =
    ApiSuccess<AiReviewLinearDestination>;

export type AiReviewNotificationRecipient = {
    userUuid: string;
    email: string;
};
