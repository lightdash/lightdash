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
            getSettings: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                ...settings,
            }),
            recordSent: vi.fn().mockResolvedValue('log-1'),
            recordError: vi.fn().mockResolvedValue(undefined),
        },
        service: {
            getRecipients: vi.fn().mockResolvedValue(recipients),
        },
        aiAgentReviewClassifierModel: {
            getReviewItem: vi.fn().mockResolvedValue({
                title: 'Missing metric',
                primaryRootCause: 'semantic_layer',
            }),
        },
        projectModel: {
            get: vi.fn().mockResolvedValue({ name: 'Jaffle' }),
        },
        openIdIdentityModel: {
            findIdentityByUserUuid: vi.fn().mockResolvedValue(slackIdentity),
        },
        slackClient: {
            getWebClient: vi.fn().mockResolvedValue({
                conversations: {
                    open: vi.fn().mockResolvedValue({
                        ok: true,
                        channel: { id: 'D123' },
                    }),
                },
            }),
            joinChannels: vi.fn().mockResolvedValue(undefined),
            postMessage: vi.fn().mockResolvedValue({ ok: true }),
        },
        analytics: {
            track: vi.fn(),
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

const needsReviewPayload = {
    event: AiReviewNotificationEvent.NeedsReview,
    fingerprints: ['fingerprint-1'],
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    reviewRunUuid: 'run-1',
    assigneeUserUuid: null,
};

test('needs_review joins the configured channel before posting', async () => {
    const deps = makeDeps();

    await sendReviewNotification(deps as never)(needsReviewPayload);

    expect(deps.slackClient.joinChannels).toHaveBeenCalledWith('org-1', [
        'C123',
    ]);
    expect(
        deps.slackClient.joinChannels.mock.invocationCallOrder[0],
    ).toBeLessThan(deps.slackClient.postMessage.mock.invocationCallOrder[0]);
});

test('needs_review still posts when joining the channel fails', async () => {
    const deps = makeDeps();
    deps.slackClient.joinChannels.mockRejectedValue(
        new Error('missing channels:join scope'),
    );

    await sendReviewNotification(deps as never)(needsReviewPayload);

    expect(deps.slackClient.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123' }),
    );
    expect(deps.model.recordSent).toHaveBeenCalled();
});
