import {
    ContentReviewContentType,
    ContentReviewNotificationEvent,
    ContentReviewRequestStatus,
    type ContentReviewRequest,
    type SendContentReviewNotificationPayload,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import type EmailClient from '../../../clients/EmailClient/EmailClient';
import { type SlackClient } from '../../../clients/Slack/SlackClient';
import { type ContentReviewRequestModel } from '../../../models/ContentReviewRequestModel';
import { type ContentReviewSettingsModel } from '../../../models/ContentReviewSettingsModel';
import { type OpenIdIdentityModel } from '../../../models/OpenIdIdentitiesModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type UserModel } from '../../../models/UserModel';
import { sendContentReviewNotification } from './sendContentReviewNotification';

const request: ContentReviewRequest = {
    uuid: 'request-uuid',
    projectUuid: 'project-uuid',
    contentType: ContentReviewContentType.CHART,
    contentUuid: 'chart-uuid',
    sourceSpaceUuid: 'personal-space',
    targetSpaceUuid: 'shared-space',
    requestedBy: { userUuid: 'requester', firstName: 'Ada', lastName: 'L' },
    requestNote: 'Please review',
    similarContent: [],
    status: ContentReviewRequestStatus.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    verifiedOnApprove: null,
    movedContent: [],
    grantedPrincipals: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const basePayload: SendContentReviewNotificationPayload = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    requestUuid: 'request-uuid',
    event: ContentReviewNotificationEvent.SUBMITTED,
    recipientUserUuids: ['editor', 'admin'],
    userUuid: 'requester',
};

const buildDeps = () => {
    const postMessage = vi.fn().mockResolvedValue(undefined);
    const conversationsOpen = vi
        .fn()
        .mockResolvedValue({ ok: true, channel: { id: 'D123' } });
    const deps = {
        siteUrl: 'https://app.test',
        contentReviewRequestModel: {
            findByUuid: vi.fn().mockResolvedValue(request),
            findChartLocations: vi.fn().mockResolvedValue([
                {
                    uuid: 'chart-uuid',
                    name: 'Weekly revenue',
                    slug: 'weekly-revenue',
                    spaceUuid: 'personal-space',
                    dashboardUuid: null,
                    deleted: false,
                },
            ]),
            findDashboardLocations: vi.fn().mockResolvedValue([]),
            findSpaceInfo: vi.fn().mockResolvedValue(
                new Map([
                    ['personal-space', { name: 'Personal' }],
                    ['shared-space', { name: 'Finance' }],
                ]),
            ),
        },
        contentReviewSettingsModel: {
            get: vi.fn().mockResolvedValue({ slackChannelId: null }),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ name: 'Jaffle' }),
        },
        userModel: {
            getUserDetailsByUuid: vi
                .fn()
                .mockImplementation(async (uuid: string) => ({
                    email: `${uuid}@test.com`,
                })),
        },
        openIdIdentityModel: {
            findIdentityByUserUuid: vi
                .fn()
                .mockResolvedValue({ subject: 'U999' }),
        },
        emailClient: {
            sendGenericNotificationEmail: vi.fn().mockResolvedValue(undefined),
        },
        slackClient: {
            getNotificationChannel: vi.fn().mockResolvedValue('C123'),
            postMessage,
            getWebClient: vi.fn().mockResolvedValue({
                conversations: { open: conversationsOpen },
            }),
        },
        analytics: { track: vi.fn() },
    };
    return {
        deps,
        run: sendContentReviewNotification({
            ...deps,
            contentReviewRequestModel:
                deps.contentReviewRequestModel as unknown as ContentReviewRequestModel,
            contentReviewSettingsModel:
                deps.contentReviewSettingsModel as unknown as ContentReviewSettingsModel,
            projectModel: deps.projectModel as unknown as ProjectModel,
            userModel: deps.userModel as unknown as UserModel,
            openIdIdentityModel:
                deps.openIdIdentityModel as unknown as OpenIdIdentityModel,
            emailClient: deps.emailClient as unknown as EmailClient,
            slackClient: deps.slackClient as unknown as SlackClient,
            analytics: deps.analytics as unknown as LightdashAnalytics,
        }),
    };
};

describe('sendContentReviewNotification', () => {
    test('submitted emails reviewers and posts to the notification channel', async () => {
        const { deps, run } = buildDeps();

        await run(basePayload);

        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).toHaveBeenCalledWith(
            ['editor@test.com', 'admin@test.com'],
            'Content review requested',
            'Content review requested',
            expect.stringContaining(
                'https://app.test/projects/project-uuid/review-requests/request-uuid',
            ),
        );
        expect(deps.slackClient.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationUuid: 'org-uuid',
                channel: 'C123',
                text: 'Ada L asked for "Weekly revenue" to be reviewed for Finance',
            }),
        );
        expect(deps.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_review_notification.sent',
                properties: expect.objectContaining({ channel: 'email' }),
            }),
        );
    });

    test('a project Slack channel wins over the org channel', async () => {
        const { deps, run } = buildDeps();
        deps.contentReviewSettingsModel.get.mockResolvedValue({
            slackChannelId: 'CPROJ',
        });

        await run(basePayload);

        expect(deps.slackClient.getNotificationChannel).not.toHaveBeenCalled();
        expect(deps.slackClient.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'CPROJ' }),
        );
    });

    test('decisions DM the requester when a Slack identity exists', async () => {
        const { deps, run } = buildDeps();

        await run({
            ...basePayload,
            event: ContentReviewNotificationEvent.REJECTED,
            recipientUserUuids: ['requester'],
            userUuid: 'admin',
        });

        expect(deps.slackClient.getNotificationChannel).not.toHaveBeenCalled();
        expect(deps.slackClient.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: 'D123',
                text: '"Weekly revenue" was not approved for Finance',
            }),
        );
    });

    test('Slack failures are recorded and do not break email', async () => {
        const { deps, run } = buildDeps();
        deps.slackClient.postMessage.mockRejectedValue(new Error('slack down'));

        await run(basePayload);

        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).toHaveBeenCalled();
        expect(deps.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_review_notification.errored',
                properties: expect.objectContaining({
                    channel: 'slack_channel',
                    error: 'slack down',
                }),
            }),
        );
    });

    test('does nothing when the request is gone', async () => {
        const { deps, run } = buildDeps();
        deps.contentReviewRequestModel.findByUuid.mockResolvedValue(null);

        await run(basePayload);

        expect(
            deps.emailClient.sendGenericNotificationEmail,
        ).not.toHaveBeenCalled();
        expect(deps.slackClient.postMessage).not.toHaveBeenCalled();
    });
});
