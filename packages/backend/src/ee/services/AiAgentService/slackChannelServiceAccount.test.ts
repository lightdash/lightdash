import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const CHANNEL_ID = 'C12345';
const SLACK_USER_ID = 'U12345';
const SERVICE_ACCOUNT_USER_UUID = 'sa-user-uuid';

const buildService = ({
    serviceAccount,
    isExpired = false,
    channel = { is_private: false, is_ext_shared: false },
    sender = { team_id: 'T12345' },
}: {
    serviceAccount: boolean;
    isExpired?: boolean;
    channel?: Record<string, unknown>;
    sender?: Record<string, unknown>;
}) => {
    const service = new AiAgentService({
        slackAuthenticationModel: {
            getOrganizationUuidFromTeamId: vi.fn().mockResolvedValue('org'),
            getInstallationFromOrganizationUuid: vi.fn().mockResolvedValue({
                organizationUuid: 'org',
                aiRequireOAuth: true,
                aiMultiAgentChannelId: 'C_MULTI',
            }),
        },
        aiAgentModel: {
            findSlackChannelServiceAccount: vi.fn().mockResolvedValue(
                serviceAccount
                    ? {
                          agentUuid: 'agent',
                          serviceAccountUuid: 'sa-uuid',
                          serviceAccountUserUuid: SERVICE_ACCOUNT_USER_UUID,
                          name: 'slack-analytics-bot',
                          isExpired,
                      }
                    : null,
            ),
            getAgentBySlackChannelId: vi.fn().mockResolvedValue({
                uuid: 'agent',
                name: 'Agent',
                organizationUuid: 'org',
                projectUuid: 'project',
            }),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: { siteUrl: 'https://app.example.com', ai: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handleAiAgentAuth = vi
        .spyOn(service as any, 'handleAiAgentAuth')
        .mockResolvedValue({ userUuid: 'linked-user' });
    const verifyAgentAccess = vi
        .spyOn(service as any, 'verifyAgentAccess')
        .mockResolvedValue(undefined);
    const createSlackPrompt = vi
        .spyOn(service as any, 'createSlackPrompt')
        .mockResolvedValue(['prompt-uuid']);
    vi.spyOn(service as any, 'setThinkingStatusAndSchedule').mockResolvedValue(
        undefined,
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const client = {
        conversations: { info: vi.fn().mockResolvedValue({ channel }) },
        users: { info: vi.fn().mockResolvedValue({ user: sender }) },
        chat: { postEphemeral: vi.fn().mockResolvedValue({}) },
    };
    const mention = () =>
        service.handleAppMention({
            event: {
                user: SLACK_USER_ID,
                text: '<@BOT> refund rate by market?',
                channel: CHANNEL_ID,
                ts: '1700000000.000100',
            },
            context: { teamId: 'T12345', botUserId: 'BOT' },
            say: vi.fn(),
            client,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

    return {
        mention,
        client,
        handleAiAgentAuth,
        verifyAgentAccess,
        createSlackPrompt,
    };
};

describe('Slack channel service account', () => {
    it('answers as the service account without OAuth in a public channel', async () => {
        const {
            mention,
            handleAiAgentAuth,
            verifyAgentAccess,
            createSlackPrompt,
        } = buildService({ serviceAccount: true });

        await mention();

        expect(handleAiAgentAuth).not.toHaveBeenCalled();
        expect(verifyAgentAccess).not.toHaveBeenCalled();
        expect(createSlackPrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                userUuid: SERVICE_ACCOUNT_USER_UUID,
                slackUserId: SLACK_USER_ID,
            }),
        );
    });

    it('answers as the service account in a private channel', async () => {
        const { mention, createSlackPrompt } = buildService({
            serviceAccount: true,
            channel: { is_private: true },
        });

        await mention();

        expect(createSlackPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: SERVICE_ACCOUNT_USER_UUID }),
        );
    });

    it('refuses a channel shared with another organization', async () => {
        const { mention, client, handleAiAgentAuth, createSlackPrompt } =
            buildService({
                serviceAccount: true,
                channel: { is_private: false, is_ext_shared: true },
            });

        await mention();

        expect(client.chat.postEphemeral).toHaveBeenCalledWith(
            expect.objectContaining({
                channel: CHANNEL_ID,
                user: SLACK_USER_ID,
                text: expect.stringContaining(
                    'shared with another organization',
                ),
            }),
        );
        expect(handleAiAgentAuth).not.toHaveBeenCalled();
        expect(createSlackPrompt).not.toHaveBeenCalled();
    });

    it('refuses instead of falling back when the service account expired', async () => {
        const { mention, client, handleAiAgentAuth, createSlackPrompt } =
            buildService({ serviceAccount: true, isExpired: true });

        await mention();

        expect(client.conversations.info).not.toHaveBeenCalled();
        expect(client.chat.postEphemeral).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('has expired'),
            }),
        );
        expect(handleAiAgentAuth).not.toHaveBeenCalled();
        expect(createSlackPrompt).not.toHaveBeenCalled();
    });

    it('refuses guests', async () => {
        const { mention, createSlackPrompt } = buildService({
            serviceAccount: true,
            sender: { team_id: 'T12345', is_restricted: true },
        });

        await mention();

        expect(createSlackPrompt).not.toHaveBeenCalled();
    });

    it('uses normal Slack auth when the channel has no service account', async () => {
        const { mention, client, handleAiAgentAuth, createSlackPrompt } =
            buildService({ serviceAccount: false });

        await mention();

        expect(client.conversations.info).not.toHaveBeenCalled();
        expect(handleAiAgentAuth).toHaveBeenCalled();
        expect(createSlackPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: 'linked-user' }),
        );
    });
});

describe('agent lookup for Slack prompts', () => {
    const restrictedAgent = {
        uuid: 'agent',
        organizationUuid: 'org',
        projectUuid: 'project',
        adminOnly: true,
    };
    const prompt = {
        organizationUuid: 'org',
        projectUuid: 'project',
        slackChannelId: CHANNEL_ID,
        createdByUserUuid: SERVICE_ACCOUNT_USER_UUID,
    };
    const build = (mappedAgentUuid: string | null) => {
        const service = new AiAgentService({
            aiAgentModel: {
                findSlackChannelServiceAccount: vi.fn().mockResolvedValue(
                    mappedAgentUuid
                        ? {
                              agentUuid: mappedAgentUuid,
                              serviceAccountUuid: 'sa-uuid',
                              serviceAccountUserUuid: SERVICE_ACCOUNT_USER_UUID,
                              name: 'slack-analytics-bot',
                              isExpired: false,
                          }
                        : null,
                ),
                getAgent: vi.fn().mockResolvedValue(restrictedAgent),
            },
            analytics: { track: vi.fn() },
            lightdashConfig: { siteUrl: 'https://app.example.com', ai: {} },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        /* eslint-disable @typescript-eslint/no-explicit-any */
        vi.spyOn(service as any, 'getIsCopilotEnabled').mockResolvedValue(true);
        const getAgent = vi
            .spyOn(service, 'getAgent')
            .mockRejectedValue(new Error('Forbidden'));
        const lookup = () =>
            (service as any).getAgentForSlackPrompt(
                { userUuid: SERVICE_ACCOUNT_USER_UUID },
                prompt,
                'agent',
                undefined,
            );
        /* eslint-enable @typescript-eslint/no-explicit-any */
        return { lookup, getAgent };
    };

    it("skips the agent's access lists for the channel's service account", async () => {
        const { lookup, getAgent } = build('agent');
        await expect(lookup()).resolves.toEqual(restrictedAgent);
        expect(getAgent).not.toHaveBeenCalled();
    });

    it('keeps the access check for another agent or a regular prompt', async () => {
        await expect(build('other-agent').lookup()).rejects.toThrow(
            'Forbidden',
        );
        await expect(build(null).lookup()).rejects.toThrow('Forbidden');
    });
});
