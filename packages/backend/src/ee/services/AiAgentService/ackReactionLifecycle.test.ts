import { AiAgentService } from './AiAgentService';

// Avoid constructing the real MCP runtime client (and its transitive deps) when
// we new up the service with mostly-empty mocks below.
jest.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: jest.fn().mockImplementation(() => ({})),
}));

const buildSlackPrompt = (overrides: Record<string, unknown> = {}) => ({
    promptUuid: 'prompt-1',
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
    threadUuid: 'thread-1',
    slackChannelId: 'C123',
    slackUserId: 'U123',
    promptSlackTs: '1700000000.000100',
    slackThreadTs: '1700000000.000000',
    createdByUserUuid: 'user-1',
    ...overrides,
});

const buildService = () => {
    const webClient = {
        chat: {
            postEphemeral: jest.fn().mockResolvedValue(undefined),
        },
    };
    const slackClient = {
        addReaction: jest.fn().mockResolvedValue(undefined),
        removeReaction: jest.fn().mockResolvedValue(undefined),
        getWebClient: jest.fn().mockResolvedValue(webClient),
    };
    const aiAgentModel = {
        findSlackPrompt: jest.fn().mockResolvedValue(buildSlackPrompt()),
    };
    const service = new AiAgentService({
        slackClient,
        aiAgentModel,
        lightdashConfig: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, slackClient, aiAgentModel, webClient };
};

const postMcpOAuthLoginMessages = (
    service: AiAgentService,
    overrides: {
        prompt?: Record<string, unknown>;
        mcpServers?: { uuid: string; name: string; authType: string }[];
        unavailableMcpServers?: {
            serverUuid: string;
            serverName: string;
            message: string;
            status: string;
        }[];
    } = {},
) =>
    (
        service as unknown as {
            postSlackMcpOAuthLoginMessages: (
                args: Record<string, unknown>,
            ) => Promise<void>;
        }
    ).postSlackMcpOAuthLoginMessages({
        user: { userUuid: 'user-1', organizationUuid: 'org-1' },
        prompt: buildSlackPrompt(overrides.prompt),
        mcpServers: overrides.mcpServers ?? [
            {
                uuid: 'mcp-1',
                name: 'Linear',
                authType: 'oauth',
            },
        ],
        mcpToolSetup: {
            unavailableMcpServers: overrides.unavailableMcpServers ?? [
                {
                    serverUuid: 'mcp-1',
                    serverName: 'Linear',
                    message: 'Unauthorized',
                    status: 'not_connected',
                },
            ],
        },
    });

describe('AiAgentService :eyes: ack reaction lifecycle', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('adds the :eyes: ack reaction on app_mention', async () => {
        const { service } = buildService();
        const reactionsAdd = jest.fn().mockResolvedValue({});
        await service.handleAppMention({
            event: { channel: 'C123', ts: 'ts-1', text: 'hi', user: 'U1' },
            // No teamId -> handler returns right after the early ack reaction.
            context: {},
            say: jest.fn(),
            client: { reactions: { add: reactionsAdd } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        expect(reactionsAdd).toHaveBeenCalledWith({
            channel: 'C123',
            timestamp: 'ts-1',
            name: 'eyes',
        });
    });

    it('removes the :eyes: reaction after a successful reply', async () => {
        const { service, slackClient } = buildService();
        jest.spyOn(
            service as unknown as {
                generateSlackPromptReply: () => Promise<void>;
            },
            'generateSlackPromptReply',
        ).mockResolvedValue(undefined);

        await service.replyToSlackPrompt('prompt-1');

        expect(slackClient.removeReaction).toHaveBeenCalledWith({
            organizationUuid: 'org-1',
            channel: 'C123',
            timestamp: '1700000000.000100',
            name: 'eyes',
        });
    });

    it('removes the :eyes: reaction after a failed reply', async () => {
        const { service, slackClient } = buildService();
        jest.spyOn(
            service as unknown as {
                generateSlackPromptReply: () => Promise<void>;
            },
            'generateSlackPromptReply',
        ).mockRejectedValue(new Error('boom'));

        await expect(service.replyToSlackPrompt('prompt-1')).rejects.toThrow(
            'boom',
        );
        expect(slackClient.removeReaction).toHaveBeenCalledTimes(1);
    });

    it('does not fail the prompt when reaction cleanup fails', async () => {
        const { service, slackClient } = buildService();
        jest.spyOn(
            service as unknown as {
                generateSlackPromptReply: () => Promise<void>;
            },
            'generateSlackPromptReply',
        ).mockResolvedValue(undefined);
        slackClient.removeReaction.mockRejectedValue(
            new Error('missing_scope'),
        );

        await expect(
            service.replyToSlackPrompt('prompt-1'),
        ).resolves.toBeUndefined();
    });

    it('posts one MCP OAuth login ephemeral per unavailable OAuth server', async () => {
        const { service, slackClient, webClient } = buildService();
        const startOAuth = jest
            .spyOn(service, 'startMcpOAuthConnection')
            .mockImplementation(
                async (_user, _projectUuid, mcpServerUuid) =>
                    `https://oauth.example/${mcpServerUuid}`,
            );

        await postMcpOAuthLoginMessages(service, {
            mcpServers: [
                {
                    uuid: 'mcp-1',
                    name: 'Linear',
                    authType: 'oauth',
                },
                {
                    uuid: 'mcp-2',
                    name: 'GitHub',
                    authType: 'oauth',
                },
                {
                    uuid: 'mcp-3',
                    name: 'Docs',
                    authType: 'bearer',
                },
            ],
            unavailableMcpServers: [
                {
                    serverUuid: 'mcp-1',
                    serverName: 'Linear',
                    message: 'Unauthorized',
                    status: 'not_connected',
                },
                {
                    serverUuid: 'mcp-2',
                    serverName: 'GitHub',
                    message: 'Unauthorized',
                    status: 'not_connected',
                },
                {
                    serverUuid: 'mcp-3',
                    serverName: 'Docs',
                    message: 'Broken',
                    status: 'error',
                },
            ],
        });

        expect(slackClient.getWebClient).toHaveBeenCalledWith('org-1');
        expect(startOAuth).toHaveBeenCalledTimes(2);
        expect(startOAuth).toHaveBeenNthCalledWith(
            1,
            expect.any(Object),
            'proj-1',
            'mcp-1',
            undefined,
            { connectionStatusOnAuthorization: 'not_connected' },
        );
        expect(webClient.chat.postEphemeral).toHaveBeenCalledTimes(2);
        expect(webClient.chat.postEphemeral).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                channel: 'C123',
                user: 'U123',
                thread_ts: '1700000000.000000',
                text: 'Linear MCP needs you to log in before I can use it.',
            }),
        );
        expect(webClient.chat.postEphemeral).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                text: 'GitHub MCP needs you to log in before I can use it.',
            }),
        );
    });
});
