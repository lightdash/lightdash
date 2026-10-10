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
        .mockResolvedValue(linked ? { userUuid: 'requester' } : null);
    const findSessionUserAndOrgByUuid = vi
        .fn()
        .mockImplementation(async (userUuid: string) => ({
            ...defaultSessionUser,
            userUuid,
            organizationUuid: 'org',
        }));
    const postMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'reply' });
    const postEphemeral = vi.fn().mockResolvedValue({ ok: true });
    const client = {
        chat: { postMessage, postEphemeral },
        conversations: {
            history: vi
                .fn()
                .mockResolvedValue({ messages: [{ text: 'question' }] }),
        },
    } as unknown as WebClient;
    const settings = {
        aiRequireOAuth: requireOAuth,
        teamId: 'team',
        appId: 'app',
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
            findIdentityByUserUuid: vi.fn().mockResolvedValue({
                subject: 'sender',
                userUuid: 'requester',
            }),
        },
        userModel: { findSessionUserAndOrgByUuid },
        slackClient: { getWebClient: vi.fn().mockResolvedValue(client) },
        aiAgentModel: {
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
        findSessionUserAndOrgByUuid,
    };
};

test.each([undefined, 'thread'])(
    'unlinked managed Slack asks for sign-in before storing a prompt (%s)',
    async (threadTs) => {
        const h = setup();
        const createPrompt = vi.spyOn(h.service, 'createSlackPrompt');
        await expect(h.auth(threadTs)).resolves.toBeNull();
        expect(createPrompt).not.toHaveBeenCalled();
        expect(h.postEphemeral).not.toHaveBeenCalled();
        expect(h.postMessage).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                channel: 'channel',
                thread_ts: threadTs ?? 'message',
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
                                url: `${siteUrl}/api/v1/auth/slack?team=team&channel=channel&message=message&trigger=app_mention${threadTs ? '&thread_ts=thread' : ''}`,
                            },
                        ],
                    },
                ],
            }),
        );
        expect(JSON.stringify(h.postMessage.mock.calls)).not.toMatch(
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
    await expect(h.auth()).rejects.toThrow('not a member');
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
