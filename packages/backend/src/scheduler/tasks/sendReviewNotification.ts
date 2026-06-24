import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
    getErrorMessage,
    OpenIdIdentityIssuerType,
    type SendReviewNotificationPayload,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type SlackClient } from '../../clients/Slack/SlackClient';
import {
    buildReviewAssignedBlocks,
    buildReviewNeedsReviewBlocks,
} from '../../clients/Slack/SlackReviewMessageBlocks';
import { type AiAgentReviewClassifierModel } from '../../ee/models/AiAgentReviewClassifierModel';
import { type AiAgentReviewNotificationModel } from '../../ee/models/AiAgentReviewNotificationModel';
import {
    buildReviewDrawerSearchParams,
    REVIEWS_BOARD_PATH,
    type AiAgentReviewNotificationService,
} from '../../ee/services/AiAgentReviewNotificationService';
import { type OpenIdIdentityModel } from '../../models/OpenIdIdentitiesModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';

type SendReviewNotificationDeps = {
    siteUrl: string;
    model: AiAgentReviewNotificationModel;
    service: AiAgentReviewNotificationService;
    aiAgentReviewClassifierModel: AiAgentReviewClassifierModel;
    projectModel: ProjectModel;
    openIdIdentityModel: OpenIdIdentityModel;
    slackClient: SlackClient;
    analytics: LightdashAnalytics;
};

const ACTION_ID = 'ai_review_open';

const getReviewContext = async (
    deps: SendReviewNotificationDeps,
    payload: SendReviewNotificationPayload,
) => {
    const [reviewItem, project] = await Promise.all([
        deps.aiAgentReviewClassifierModel.getReviewItem(
            payload.organizationUuid,
            payload.fingerprints[0],
        ),
        deps.projectModel.get(payload.projectUuid),
    ]);

    return {
        title: reviewItem?.title ?? 'AI review finding',
        rootCause: reviewItem?.primaryRootCause ?? 'unknown',
        projectName: project.name,
        reviewUrl: `${deps.siteUrl}${REVIEWS_BOARD_PATH}?${buildReviewDrawerSearchParams(
            payload.projectUuid,
            payload.fingerprints[0],
            reviewItem,
        )}`,
    };
};

const track = (
    deps: SendReviewNotificationDeps,
    event: 'ai_review_notification.sent' | 'ai_review_notification.errored',
    payload: SendReviewNotificationPayload,
    channel: AiReviewNotificationChannel,
    error?: string,
) =>
    deps.analytics.track({
        event,
        anonymousId: payload.organizationUuid,
        properties: {
            organizationId: payload.organizationUuid,
            projectId: payload.projectUuid,
            channel,
            notificationEvent: payload.event,
            error,
        },
    });

export const sendReviewNotification =
    (deps: SendReviewNotificationDeps) =>
    async (payload: SendReviewNotificationPayload): Promise<void> => {
        if (
            payload.event === AiReviewNotificationEvent.NeedsReview &&
            payload.fingerprints.length > 0
        ) {
            const settings = await deps.model.getSettings(
                payload.organizationUuid,
            );
            if (!settings.enabled || !settings.slackChannelId) {
                return;
            }

            const context = await getReviewContext(deps, payload);
            const notificationLogUuid = randomUUID();
            try {
                await deps.slackClient.postMessage({
                    organizationUuid: payload.organizationUuid,
                    channel: settings.slackChannelId,
                    text: `${payload.fingerprints.length} context fixes need review`,
                    blocks: buildReviewNeedsReviewBlocks({
                        count: payload.fingerprints.length,
                        topTitle: context.title,
                        rootCause: context.rootCause,
                        projectName: context.projectName,
                        reviewUrl: context.reviewUrl,
                        actionId: ACTION_ID,
                        notificationLogUuid,
                    }),
                });
                await deps.model.recordSent({
                    notificationLogUuid,
                    organizationUuid: payload.organizationUuid,
                    fingerprint: payload.fingerprints[0],
                    recipientUserUuid: null,
                    channel: AiReviewNotificationChannel.SlackChannel,
                    event: payload.event,
                });
                track(
                    deps,
                    'ai_review_notification.sent',
                    payload,
                    AiReviewNotificationChannel.SlackChannel,
                );
            } catch (error) {
                const message = getErrorMessage(error);
                await deps.model.recordError({
                    organizationUuid: payload.organizationUuid,
                    fingerprint: payload.fingerprints[0],
                    recipientUserUuid: null,
                    channel: AiReviewNotificationChannel.SlackChannel,
                    event: payload.event,
                    error: message,
                });
                track(
                    deps,
                    'ai_review_notification.errored',
                    payload,
                    AiReviewNotificationChannel.SlackChannel,
                    message,
                );
            }
            return;
        }

        if (
            payload.event !== AiReviewNotificationEvent.Assigned ||
            !payload.assigneeUserUuid ||
            payload.fingerprints.length === 0
        ) {
            return;
        }

        const recipients = await deps.service.getRecipients(
            payload.organizationUuid,
        );
        if (!recipients.some((r) => r.userUuid === payload.assigneeUserUuid)) {
            return;
        }

        const identity = await deps.openIdIdentityModel.findIdentityByUserUuid(
            payload.assigneeUserUuid,
            OpenIdIdentityIssuerType.SLACK,
        );
        if (!identity) {
            return;
        }

        const context = await getReviewContext(deps, payload);
        const notificationLogUuid = randomUUID();
        try {
            const webClient = await deps.slackClient.getWebClient(
                payload.organizationUuid,
            );
            const conversation = await webClient.conversations.open({
                users: identity.subject,
            });
            if (!conversation.ok || !conversation.channel?.id) {
                throw new Error('Failed to open Slack DM');
            }
            await deps.slackClient.postMessage({
                organizationUuid: payload.organizationUuid,
                channel: conversation.channel.id,
                text: `AI review finding assigned: ${context.title}`,
                blocks: buildReviewAssignedBlocks({
                    title: context.title,
                    rootCause: context.rootCause,
                    projectName: context.projectName,
                    reviewUrl: context.reviewUrl,
                    actionId: ACTION_ID,
                    notificationLogUuid,
                }),
            });
            await deps.model.recordSent({
                notificationLogUuid,
                organizationUuid: payload.organizationUuid,
                fingerprint: payload.fingerprints[0],
                recipientUserUuid: payload.assigneeUserUuid,
                channel: AiReviewNotificationChannel.SlackDm,
                event: payload.event,
            });
            track(
                deps,
                'ai_review_notification.sent',
                payload,
                AiReviewNotificationChannel.SlackDm,
            );
        } catch (error) {
            const message = getErrorMessage(error);
            await deps.model.recordError({
                organizationUuid: payload.organizationUuid,
                fingerprint: payload.fingerprints[0],
                recipientUserUuid: payload.assigneeUserUuid,
                channel: AiReviewNotificationChannel.SlackDm,
                event: payload.event,
                error: message,
            });
            track(
                deps,
                'ai_review_notification.errored',
                payload,
                AiReviewNotificationChannel.SlackDm,
                message,
            );
        }
    };
