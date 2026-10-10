import {
    AiAccessRefusalReason,
    InvalidUser,
    type AgentCapabilityPolicy,
} from '@lightdash/common';
import type { WebClient } from '@slack/web-api';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    AgentPermissionService,
    agentSystemRoleMatrix,
} from '../../../services/AgentPermissionService/AgentPermissionService';
import { AiAgentService } from './AiAgentService';

const siteUrl = 'https://example.com';
const setup = ({
    enabled = true,
    managed = true,
    requireOAuth = false,
    linked = false,
    multiAgent = false,
} = {}) => {
    const policy: AgentCapabilityPolicy = {
        mode: managed ? 'managed' : 'legacy',
        version: 1,
        allowedProjectUuids: null,
        allowedUserUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([]),
    };
    const insert = vi.fn().mockResolvedValue(undefined);
    const permissions = new AgentPermissionService({
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
        agentCapabilityPolicyModel: { get: vi.fn().mockResolvedValue(policy) },
        agentActionLogModel: { insert },
    } as unknown as ConstructorParameters<typeof AgentPermissionService>[0]);
    const findIdentityByOpenId = vi
        .fn()
        .mockResolvedValue(
            linked ? { userUuid: 'requester', teamId: 'team' } : null,
        );
    const findSessionUserAndOrgByUuid = vi
        .fn()
        .mockImplementation(async (userUuid: string) => ({
            ...defaultSessionUser,
            userUuid,
            organizationUuid: 'org',
        }));
    const postMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'reply' });
    const postEphemeral = vi.fn().mockResolvedValue({ ok: true });
    const history = vi.fn().mockResolvedValue({
        messages: [
            { text: 'question', ts: 'message', user: 'sender', team: 'team' },
        ],
    });
    const replies = vi.fn().mockResolvedValue({
        messages: [
            { text: 'question', ts: 'message', user: 'sender', team: 'team' },
        ],
    });
    const findIdentityByUserUuid = vi.fn().mockResolvedValue({
        subject: 'sender',
        userUuid: 'requester',
        teamId: 'team',
    });
    const findThreadUuidBySlackChannelIdAndThreadTs = vi
        .fn()
        .mockResolvedValue(null);
    const getAgent = vi.fn().mockResolvedValue({
        uuid: 'bound-agent',
        organizationUuid: 'org',
        projectUuid: 'second-project',
    });
    const client = {
        chat: { postMessage, postEphemeral },
        conversations: { history, replies },
    } as unknown as WebClient;
    const settings = {
        aiRequireOAuth: requireOAuth,
        teamId: 'team',
        appId: 'app',
        aiMultiAgentChannelId: multiAgent ? 'channel' : undefined,
    };
    const service = new AiAgentService({
        lightdashConfig: { siteUrl, ai: {} },
        agentPermissionService: permissions,
        slackAuthenticationModel: {
            getUserUuid: vi.fn().mockResolvedValue('installer'),
            getOrganizationUuidFromTeamId: vi.fn().mockResolvedValue('org'),
            getInstallationFromOrganizationUuid: vi
                .fn()
                .mockResolvedValue(settings),
        },
        openIdIdentityModel: {
            findIdentityByOpenId,
            findIdentityByUserUuid,
        },
        userModel: { findSessionUserAndOrgByUuid },
        slackClient: { getWebClient: vi.fn().mockResolvedValue(client) },
        aiAgentModel: {
            findThreadUuidBySlackChannelIdAndThreadTs,
            findThread: vi.fn().mockResolvedValue({ agentUuid: 'bound-agent' }),
            getAgent,
            getAgentBySlackChannelId: vi.fn().mockResolvedValue({
                uuid: 'agent',
                organizationUuid: 'org',
                projectUuid: 'project',
            }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const auth = (threadTs?: string) =>
        (
            service as unknown as {
                handleAiAgentAuth: (
                    slackSettings: typeof settings,
                    context: {
                        userId: string;
                        teamId: string;
                        threadTs: string | undefined;
                        channelId: string;
                        messageId: string;
                        organizationUuid: string;
                    },
                    client: WebClient,
                ) => Promise<{ userUuid: string } | null>;
            }
        ).handleAiAgentAuth(
            settings,
            {
                userId: 'sender',
                teamId: 'team',
                threadTs,
                channelId: 'channel',
                messageId: 'message',
                organizationUuid: 'org',
            },
            client,
        );
    const mention = () =>
        service.handleAppMention({
            event: {
                user: 'sender',
                channel: 'channel',
                ts: 'message',
                text: 'question',
            },
            context: { teamId: 'team' },
            client,
            say: vi.fn(),
        } as unknown as Parameters<AiAgentService['handleAppMention']>[0]);
    return {
        service,
        auth,
        mention,
        insert,
        postMessage,
        postEphemeral,
        findIdentityByOpenId,
        findIdentityByUserUuid,
        history,
        replies,
        getAgent,
        findThreadUuidBySlackChannelIdAndThreadTs,
        findSessionUserAndOrgByUuid,
    };
};

test.each([undefined, 'message', 'thread'])(
    'unlinked managed Slack asks for sign-in before storing a prompt (%s)',
    async (threadTs) => {
        const h = setup();
        const createPrompt = vi.spyOn(h.service, 'createSlackPrompt');
        await expect(h.auth(threadTs)).resolves.toBeNull();
        expect(createPrompt).not.toHaveBeenCalled();
        expect(h.postMessage).not.toHaveBeenCalled();
        expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                channel: 'channel',
                user: 'sender',
                ...(threadTs === 'thread' ? { thread_ts: threadTs } : {}),
                text: expect.stringContaining('Needs your sign-in'),
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: 'Needs your sign-in',
                        },
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'plain_text',
                            text: 'Connect your Slack account so agents can run as you.',
                        },
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                action_id: 'ai_access_connect',
                                text: {
                                    type: 'plain_text',
                                    text: 'Connect your Slack account',
                                },
                                url: `${siteUrl}/api/v1/auth/slack?team=team&channel=channel&message=message&trigger=app_mention${threadTs ? `&thread_ts=${threadTs}` : ''}`,
                            },
                        ],
                    },
                ],
            }),
        );
        if (threadTs !== 'thread') {
            expect(h.postEphemeral.mock.calls[0][0]).not.toHaveProperty(
                'thread_ts',
            );
        }
        expect(JSON.stringify(h.postEphemeral.mock.calls)).not.toMatch(
            /🔴|failed|Reference:|Please try again/,
        );
        expect(h.insert).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                object_type: 'agent_operation',
                action: 'agent_tool',
                outcome: 'denied',
                policy_layer: 'organization_setting',
                reason_code: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
            }),
        );
    },
);

test('managed linked Slack resolves the requester and checks organization membership', async () => {
    const h = setup({ linked: true });
    await expect(h.auth()).resolves.toEqual({ userUuid: 'requester' });
    expect(h.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
        'requester',
        'org',
    );
    expect(h.postMessage).not.toHaveBeenCalled();
});

test('managed linked Slack rejects a requester outside the organization', async () => {
    const h = setup({ linked: true });
    h.findSessionUserAndOrgByUuid.mockRejectedValue(
        new InvalidUser('not a member'),
    );
    const createPrompt = vi.spyOn(h.service, 'createSlackPrompt');
    await expect(h.mention()).resolves.toBeUndefined();
    expect(createPrompt).not.toHaveBeenCalled();
    expect(h.postMessage).not.toHaveBeenCalled();
    expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
        channel: 'channel',
        user: 'sender',
        text: 'Your account is not a member of this organization. Ask an admin for access.',
    });
});

test.each([{ enabled: false }, { managed: false }])(
    'keeps installer resolution without managed limits: %j',
    async (options) => {
        const h = setup({ ...options, linked: true });
        await expect(h.auth()).resolves.toEqual({ userUuid: 'installer' });
        expect(h.findIdentityByOpenId).not.toHaveBeenCalled();
    },
);

test('OAuth-required unlinked requests still receive the ephemeral link', async () => {
    const h = setup({ requireOAuth: true });
    await expect(h.auth()).resolves.toBeNull();
    expect(h.postEphemeral).toHaveBeenCalledOnce();
    expect(h.postMessage).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
});

test('OAuth-required linked requests still resolve the requester', async () => {
    const h = setup({ requireOAuth: true, linked: true });
    await expect(h.auth()).resolves.toEqual({ userUuid: 'requester' });
});

test('after linking, the pending message creates and schedules a prompt as the requester', async () => {
    const h = setup();
    await h.auth();
    h.findIdentityByOpenId.mockResolvedValue({ userUuid: 'requester' });
    const createPrompt = vi
        .spyOn(h.service, 'createSlackPrompt')
        .mockResolvedValue(['prompt', true]);
    const schedule = vi.fn().mockResolvedValue(undefined);
    Object.assign(h.service, { setThinkingStatusAndSchedule: schedule });
    await h.service.processPendingSlackMessage({
        teamId: 'team',
        channelId: 'channel',
        messageTs: 'message',
        threadTs: 'thread',
        userUuid: 'requester',
    });
    expect(h.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
        'requester',
        'org',
    );
    expect(createPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
            userUuid: 'requester',
            slackUserId: 'sender',
            promptSlackTs: 'message',
        }),
    );
    expect(schedule).toHaveBeenCalledWith(
        expect.objectContaining({
            userUuid: 'requester',
            slackPromptUuid: 'prompt',
        }),
    );
});

test('an unlinked mention does not reserve the message before OAuth replay', async () => {
    const h = setup();
    const createPrompt = vi
        .spyOn(h.service, 'createSlackPrompt')
        .mockResolvedValue(['prompt', true]);
    const schedule = vi.fn().mockResolvedValue(undefined);
    Object.assign(h.service, { setThinkingStatusAndSchedule: schedule });
    await h.mention();
    expect(createPrompt).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    h.findIdentityByOpenId.mockResolvedValue({ userUuid: 'requester' });
    await h.service.processPendingSlackMessage({
        teamId: 'team',
        channelId: 'channel',
        messageTs: 'message',
        userUuid: 'requester',
    });
    expect(createPrompt).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            userUuid: 'requester',
            promptSlackTs: 'message',
        }),
    );
});

const prepareReplay = (options: Parameters<typeof setup>[0] = {}) => {
    const h = setup(options);
    const createPrompt = vi
        .spyOn(h.service, 'createSlackPrompt')
        .mockResolvedValue(['prompt', true]);
    const schedule = vi.fn().mockResolvedValue(undefined);
    const availableAgents = vi.fn().mockResolvedValue([
        {
            uuid: 'first-agent',
            organizationUuid: 'org',
            projectUuid: 'first-project',
        },
        {
            uuid: 'bound-agent',
            organizationUuid: 'org',
            projectUuid: 'second-project',
        },
    ]);
    Object.assign(h.service, {
        setThinkingStatusAndSchedule: schedule,
        getAvailableAgents: availableAgents,
        checkAgentAccess: vi.fn().mockResolvedValue(true),
    });
    const replay = (threadTs?: string) =>
        h.service.processPendingSlackMessage({
            teamId: 'team',
            channelId: 'channel',
            messageTs: 'message',
            userUuid: 'requester',
            threadTs,
        });
    return { ...h, createPrompt, schedule, replay };
};

test.each([
    { requireOAuth: false },
    { requireOAuth: true },
    { enabled: false },
    { managed: false },
])(
    'replay rejects a different clicker before creating a prompt: %j',
    async (options) => {
        const h = prepareReplay(options);
        h.findIdentityByUserUuid.mockResolvedValue({
            subject: 'clicker',
            userUuid: 'requester',
            teamId: 'team',
        });
        await h.replay();
        expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
            channel: 'channel',
            user: 'clicker',
            text: 'You can only resume your own message.',
        });
        expect(h.createPrompt).not.toHaveBeenCalled();
        expect(h.schedule).not.toHaveBeenCalled();
    },
);

test.each([
    { messageTeam: 'other-team', identityTeam: 'team' },
    { messageTeam: undefined, identityTeam: 'team' },
    { messageTeam: 'team', identityTeam: undefined },
    { messageTeam: undefined, identityTeam: undefined },
])(
    'replay asks for a fresh mention when the author workspace cannot be confirmed: %j',
    async ({ messageTeam, identityTeam }) => {
        const h = prepareReplay();
        h.history.mockResolvedValue({
            messages: [
                {
                    text: 'question',
                    ts: 'message',
                    user: 'sender',
                    team: messageTeam,
                },
            ],
        });
        h.findIdentityByUserUuid.mockResolvedValue({
            subject: 'sender',
            userUuid: 'requester',
            teamId: identityTeam,
        });
        await h.replay();
        expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
            channel: 'channel',
            user: 'sender',
            text: "You're connected. Mention me again to continue.",
        });
        expect(h.createPrompt).not.toHaveBeenCalled();
        expect(h.schedule).not.toHaveBeenCalled();
    },
);

test('replay refuses a message without an author', async () => {
    const h = prepareReplay();
    h.history.mockResolvedValue({
        messages: [{ text: 'question', ts: 'message', team: 'team' }],
    });
    await h.replay();
    expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
        channel: 'channel',
        user: 'sender',
        text: 'You can only resume your own message.',
    });
    expect(h.createPrompt).not.toHaveBeenCalled();
    expect(h.schedule).not.toHaveBeenCalled();
});

test('replay resumes the right clicker using the exact original message', async () => {
    const h = prepareReplay();
    h.findIdentityByUserUuid.mockResolvedValue({
        subject: 'sender',
        userUuid: 'requester',
        teamId: 'author-team',
    });
    h.history.mockResolvedValue({
        messages: [
            {
                text: 'another question',
                ts: 'other-message',
                user: 'someone-else',
            },
            {
                text: 'question',
                ts: 'message',
                user: 'sender',
                team: 'author-team',
            },
        ],
    });
    await h.replay();
    expect(h.createPrompt).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            userUuid: 'requester',
            organizationUuid: 'org',
            slackUserId: 'sender',
            prompt: 'question',
            promptSlackTs: 'message',
        }),
    );
    expect(h.schedule).toHaveBeenCalledOnce();
    expect(h.postEphemeral).not.toHaveBeenCalled();
});

test.each([false, true])(
    'replay tells a non-member why it stopped (OAuth %s)',
    async (requireOAuth) => {
        const h = prepareReplay({ requireOAuth });
        h.findSessionUserAndOrgByUuid.mockRejectedValue(
            new InvalidUser('not a member'),
        );
        await expect(h.replay()).resolves.toBeUndefined();
        expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
            channel: 'channel',
            user: 'sender',
            text: 'Your account is not a member of this organization. Ask an admin for access.',
        });
        expect(h.createPrompt).not.toHaveBeenCalled();
        expect(h.schedule).not.toHaveBeenCalled();
    },
);

test('replay finds the exact reply in its thread', async () => {
    const h = prepareReplay();
    h.replies.mockResolvedValue({
        messages: [
            { text: 'root question', ts: 'thread', user: 'another-user' },
            {
                text: 'reply question',
                ts: 'message',
                user: 'sender',
                team: 'team',
            },
        ],
    });
    await h.replay('thread');
    expect(h.history).not.toHaveBeenCalled();
    expect(h.replies).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'channel', ts: 'thread' }),
    );
    expect(h.createPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
            prompt: 'reply question',
            promptSlackTs: 'message',
            slackThreadTs: 'thread',
        }),
    );
    expect(h.schedule).toHaveBeenCalledOnce();
});

test.each([
    { failure: 'missing', threadTs: undefined },
    { failure: 'error', threadTs: undefined },
    { failure: 'missing', threadTs: 'message' },
    { failure: 'error', threadTs: 'message' },
    { failure: 'missing', threadTs: 'thread' },
    { failure: 'error', threadTs: 'thread' },
])(
    'replay gives a visible fallback when the original message cannot be fetched: %j',
    async ({ failure, threadTs }) => {
        const h = prepareReplay();
        if (failure === 'error') {
            h.history.mockRejectedValue(new Error('Slack unavailable'));
            h.replies.mockRejectedValue(new Error('Slack unavailable'));
        } else {
            h.history.mockResolvedValue({ messages: [] });
            h.replies.mockResolvedValue({ messages: [] });
        }
        await h.replay(threadTs);
        expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
            channel: 'channel',
            user: 'sender',
            ...(threadTs === 'thread' ? { thread_ts: threadTs } : {}),
            text: "Couldn't find your message. Ask again.",
        });
        expect(h.createPrompt).not.toHaveBeenCalled();
        expect(h.schedule).not.toHaveBeenCalled();
    },
);

test('multi-agent replay asks for a new mention instead of picking the first project', async () => {
    const h = prepareReplay({ multiAgent: true });
    await h.replay();
    expect(h.postEphemeral).toHaveBeenCalledExactlyOnceWith({
        channel: 'channel',
        user: 'sender',
        text: "You're connected. Mention me again to continue.",
    });
    expect(h.createPrompt).not.toHaveBeenCalled();
    expect(h.schedule).not.toHaveBeenCalled();
});

test('multi-agent replay keeps the existing thread agent and project', async () => {
    const h = prepareReplay({ multiAgent: true });
    h.findThreadUuidBySlackChannelIdAndThreadTs.mockResolvedValue(
        'stored-thread',
    );
    await h.replay('thread');
    expect(h.createPrompt).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            agentUuid: 'bound-agent',
            projectUuid: 'second-project',
            slackThreadTs: 'thread',
        }),
    );
    expect(h.schedule).toHaveBeenCalledOnce();
    expect(h.postEphemeral).not.toHaveBeenCalled();
});
