import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
} from '@lightdash/common';
import { sendReviewNotification } from './sendReviewNotification';

const makeDeps = ({
    recipients = [{ userUuid: 'user-2', email: 'user-2@example.com' }],
    slackIdentity = { subject: 'U123' },
    settings = { enabled: true, slackChannelId: 'C123' },
}: {
    recipients?: Array<{ userUuid: string; email: string }>;
    slackIdentity?: { subject: string } | null;
    settings?: { enabled: boolean; slackChannelId: string | null };
} = {}) => {
    const deps = {
        siteUrl: 'https://app.lightdash.com',
        model: {
            getSettings: jest.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                ...settings,
            }),
            recordSent: jest.fn().mockResolvedValue('log-1'),
            recordError: jest.fn().mockResolvedValue(undefined),
        },
        service: {
            getRecipients: jest.fn().mockResolvedValue(recipients),
        },
        aiAgentReviewClassifierModel: {
            getReviewItem: jest.fn().mockResolvedValue({
                title: 'Missing metric',
                primaryRootCause: 'semantic_layer',
            }),
        },
        projectModel: {
            get: jest.fn().mockResolvedValue({ name: 'Jaffle' }),
        },
        openIdIdentityModel: {
            findIdentityByUserUuid: jest.fn().mockResolvedValue(slackIdentity),
        },
        slackClient: {
            getWebClient: jest.fn().mockResolvedValue({
                conversations: {
                    open: jest.fn().mockResolvedValue({
                        ok: true,
                        channel: { id: 'D123' },
                    }),
                },
            }),
            postMessage: jest.fn().mockResolvedValue({ ok: true }),
        },
        analytics: {
            track: jest.fn(),
        },
    };

    return deps;
};

const assignedPayload = {
    event: AiReviewNotificationEvent.Assigned,
    assigneeUserUuid: 'user-2',
    fingerprints: ['fingerprint-1'],
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    reviewRunUuid: null,
};

test('assigned DM is skipped when assignee has no linked Slack identity', async () => {
    const deps = makeDeps({ slackIdentity: null });

    await sendReviewNotification(deps as never)(assignedPayload);

    expect(deps.slackClient.postMessage).not.toHaveBeenCalled();
    expect(deps.model.recordSent).not.toHaveBeenCalledWith(
        expect.objectContaining({
            channel: AiReviewNotificationChannel.SlackDm,
        }),
    );
});

test('assigned DM is skipped when assignee lost manage:AiAgent', async () => {
    const deps = makeDeps({ recipients: [] });

    await sendReviewNotification(deps as never)(assignedPayload);

    expect(deps.slackClient.postMessage).not.toHaveBeenCalled();
});

test('needs_review posts to configured channel when enabled', async () => {
    const deps = makeDeps();

    await sendReviewNotification(deps as never)({
        event: AiReviewNotificationEvent.NeedsReview,
        fingerprints: ['fingerprint-1', 'fingerprint-2', 'fingerprint-3'],
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
        reviewRunUuid: 'run-1',
        assigneeUserUuid: null,
    });

    expect(deps.slackClient.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123' }),
    );
    expect(deps.model.recordSent).toHaveBeenCalledWith(
        expect.objectContaining({
            channel: AiReviewNotificationChannel.SlackChannel,
        }),
    );
});
