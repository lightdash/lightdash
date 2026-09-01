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

export type AiReviewLinearRouting = {
    organizationUuid: string;
    applyToAllProjects: boolean;
    projectUuids: string[];
    enabled: boolean;
    linearTeamId: string | null;
    linearProjectId: string | null;
};

export type UpdateAiReviewLinearRouting = {
    applyToAllProjects: boolean;
    projectUuids: string[];
    enabled: boolean;
    linearTeamId: string | null;
    linearProjectId: string | null;
};

export type ApiAiReviewLinearRoutingResponse =
    ApiSuccess<AiReviewLinearRouting>;

export type AiReviewLinearBackfillResult = {
    queuedCount: number;
};

export type ApiAiReviewLinearBackfillResponse =
    ApiSuccess<AiReviewLinearBackfillResult>;

export const resolveAiReviewLinearDestination = ({
    organizationUuid,
    projectUuid,
    applyToAllProjects,
    settings,
    destination,
    hasProjectDestinations,
}: {
    organizationUuid: string;
    projectUuid: string;
    applyToAllProjects: boolean;
    settings: Pick<
        AiReviewNotificationSettings,
        'linearEnabled' | 'linearTeamId' | 'linearProjectId'
    >;
    destination: AiReviewLinearDestination | null;
    hasProjectDestinations: boolean;
}): AiReviewLinearDestination => {
    if (applyToAllProjects) {
        return {
            organizationUuid,
            projectUuid,
            enabled: settings.linearEnabled,
            linearTeamId: settings.linearTeamId,
            linearProjectId: settings.linearProjectId,
        };
    }

    if (destination) {
        return destination;
    }

    // Preserve routing configured before destinations became project-scoped.
    if (!hasProjectDestinations && settings.linearTeamId) {
        return {
            organizationUuid,
            projectUuid,
            enabled: settings.linearEnabled,
            linearTeamId: settings.linearTeamId,
            linearProjectId: settings.linearProjectId,
        };
    }

    return {
        organizationUuid,
        projectUuid,
        enabled: false,
        linearTeamId: null,
        linearProjectId: null,
    };
};

export type AiReviewNotificationRecipient = {
    userUuid: string;
    email: string;
};
