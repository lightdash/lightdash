import {
    assertUnreachable,
    ContentReviewContentType,
    ContentReviewNotificationEvent,
    getContentReviewRequestPath,
    getErrorMessage,
    OpenIdIdentityIssuerType,
    type ContentReviewRequest,
    type SendContentReviewNotificationPayload,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import type EmailClient from '../../../clients/EmailClient/EmailClient';
import { type SlackClient } from '../../../clients/Slack/SlackClient';
import { buildContentReviewBlocks } from '../../../clients/Slack/SlackContentReviewMessageBlocks';
import Logger from '../../../logging/logger';
import { type ContentReviewRequestModel } from '../../../models/ContentReviewRequestModel';
import { type ContentReviewSettingsModel } from '../../../models/ContentReviewSettingsModel';
import { type OpenIdIdentityModel } from '../../../models/OpenIdIdentitiesModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../../models/UserModel';
import { buildContentReviewNotificationMessage } from '../../services/ContentReviewNotificationService/ContentReviewNotificationService';

type SendContentReviewNotificationDeps = {
    siteUrl: string;
    contentReviewRequestModel: ContentReviewRequestModel;
    contentReviewSettingsModel: ContentReviewSettingsModel;
    projectModel: ProjectModel;
    userModel: UserModel;
    openIdIdentityModel: OpenIdIdentityModel;
    emailClient: EmailClient;
    slackClient: SlackClient;
    analytics: LightdashAnalytics;
};

type NotificationChannel = 'email' | 'slack_channel' | 'slack_dm';

type NotificationCopy = {
    header: string;
    body: string;
    note: string | null;
    projectName: string;
    requestUrl: string;
    buttonLabel: string;
};

const getHeader = (event: ContentReviewNotificationEvent): string => {
    switch (event) {
        case ContentReviewNotificationEvent.SUBMITTED:
            return 'Content review requested';
        case ContentReviewNotificationEvent.APPROVED:
            return 'Review request approved';
        case ContentReviewNotificationEvent.REJECTED:
            return 'Review request rejected';
        default:
            return assertUnreachable(event, 'Unknown notification event');
    }
};

const findRequestLocations = (
    deps: SendContentReviewNotificationDeps,
    request: ContentReviewRequest,
) => {
    const uuids = [request.contentUuid];
    switch (request.contentType) {
        case ContentReviewContentType.CHART:
            return deps.contentReviewRequestModel.findChartLocations(uuids);
        case ContentReviewContentType.SQL_CHART:
            return deps.contentReviewRequestModel.findSqlChartLocations(uuids);
        case ContentReviewContentType.DASHBOARD:
            return deps.contentReviewRequestModel.findDashboardLocations(uuids);
        default:
            return assertUnreachable(
                request.contentType,
                'Unknown review content type',
            );
    }
};

const getCopy = async (
    deps: SendContentReviewNotificationDeps,
    payload: SendContentReviewNotificationPayload,
    request: ContentReviewRequest,
): Promise<NotificationCopy> => {
    const [locations, spaces, project] = await Promise.all([
        findRequestLocations(deps, request),
        deps.contentReviewRequestModel.findSpaceInfo(
            request.targetSpaceUuid === null
                ? [request.sourceSpaceUuid]
                : [request.sourceSpaceUuid, request.targetSpaceUuid],
        ),
        deps.projectModel.getSummary(payload.projectUuid),
    ]);
    const location = locations[0];
    const item = {
        ...request,
        content:
            location === undefined || location.deleted
                ? null
                : { name: location.name, slug: location.slug },
        sourceSpaceName: spaces.get(request.sourceSpaceUuid)?.name ?? null,
        targetSpaceName:
            request.targetSpaceUuid === null
                ? null
                : (spaces.get(request.targetSpaceUuid)?.name ?? null),
    };
    const body = buildContentReviewNotificationMessage(item, payload.event);
    const header = getHeader(payload.event);
    return {
        header,
        body,
        note:
            payload.event === ContentReviewNotificationEvent.SUBMITTED
                ? request.requestNote
                : request.reviewNote,
        projectName: project.name,
        requestUrl: `${deps.siteUrl}${getContentReviewRequestPath(
            payload.projectUuid,
            payload.requestUuid,
        )}`,
        buttonLabel:
            payload.event === ContentReviewNotificationEvent.SUBMITTED
                ? 'Review request'
                : 'Open request',
    };
};

const track = (
    deps: SendContentReviewNotificationDeps,
    payload: SendContentReviewNotificationPayload,
    channel: NotificationChannel,
    outcome: { sent: number } | { error: string },
) =>
    deps.analytics.track({
        event:
            'error' in outcome
                ? 'content_review_notification.errored'
                : 'content_review_notification.sent',
        userId: payload.userUuid,
        properties: {
            organizationId: payload.organizationUuid,
            projectId: payload.projectUuid,
            channel,
            notificationEvent: payload.event,
            recipientCount: 'sent' in outcome ? outcome.sent : 0,
            error: 'error' in outcome ? outcome.error : undefined,
        },
    });

const sendEmails = async (
    deps: SendContentReviewNotificationDeps,
    payload: SendContentReviewNotificationPayload,
    copy: NotificationCopy,
): Promise<void> => {
    const users = await Promise.all(
        payload.recipientUserUuids.map((uuid) =>
            deps.userModel.getUserDetailsByUuid(uuid),
        ),
    );
    const emails = users.flatMap((user) => (user.email ? [user.email] : []));
    if (emails.length === 0) return;
    try {
        const note = copy.note ? `\n\n> ${copy.note}` : '';
        await deps.emailClient.sendGenericNotificationEmail(
            emails,
            copy.header,
            copy.header,
            `${copy.body}${note}\n\n[${copy.buttonLabel}](${copy.requestUrl})`,
        );
        track(deps, payload, 'email', { sent: emails.length });
    } catch (error) {
        const message = getErrorMessage(error);
        Logger.error(
            `Unable to email content review notification for request ${payload.requestUuid}: ${message}`,
        );
        track(deps, payload, 'email', { error: message });
    }
};

const postToSlackChannel = async (
    deps: SendContentReviewNotificationDeps,
    payload: SendContentReviewNotificationPayload,
    copy: NotificationCopy,
): Promise<void> => {
    const settings = await deps.contentReviewSettingsModel.get(
        payload.projectUuid,
    );
    try {
        const channel =
            settings.slackChannelId ??
            (await deps.slackClient.getNotificationChannel(
                payload.organizationUuid,
            ));
        if (!channel) return;
        await deps.slackClient.postMessage({
            organizationUuid: payload.organizationUuid,
            channel,
            text: copy.body,
            blocks: buildContentReviewBlocks(copy),
        });
        track(deps, payload, 'slack_channel', { sent: 1 });
    } catch (error) {
        const message = getErrorMessage(error);
        Logger.warn(
            `Unable to post content review notification to Slack for request ${payload.requestUuid}: ${message}`,
        );
        track(deps, payload, 'slack_channel', { error: message });
    }
};

const sendSlackDm = async (
    deps: SendContentReviewNotificationDeps,
    payload: SendContentReviewNotificationPayload,
    copy: NotificationCopy,
    recipientUserUuid: string,
): Promise<void> => {
    const identity = await deps.openIdIdentityModel.findIdentityByUserUuid(
        recipientUserUuid,
        OpenIdIdentityIssuerType.SLACK,
    );
    if (!identity) return;
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
            text: copy.body,
            blocks: buildContentReviewBlocks(copy),
        });
        track(deps, payload, 'slack_dm', { sent: 1 });
    } catch (error) {
        const message = getErrorMessage(error);
        Logger.warn(
            `Unable to send content review DM for request ${payload.requestUuid}: ${message}`,
        );
        track(deps, payload, 'slack_dm', { error: message });
    }
};

export const sendContentReviewNotification =
    (deps: SendContentReviewNotificationDeps) =>
    async (payload: SendContentReviewNotificationPayload): Promise<void> => {
        const request = await deps.contentReviewRequestModel.findByUuid(
            payload.requestUuid,
        );
        if (request === null) return;
        const copy = await getCopy(deps, payload, request);

        await sendEmails(deps, payload, copy);
        if (payload.event === ContentReviewNotificationEvent.SUBMITTED) {
            await postToSlackChannel(deps, payload, copy);
            return;
        }
        for (const recipientUserUuid of payload.recipientUserUuids) {
            // eslint-disable-next-line no-await-in-loop
            await sendSlackDm(deps, payload, copy, recipientUserUuid);
        }
    };
