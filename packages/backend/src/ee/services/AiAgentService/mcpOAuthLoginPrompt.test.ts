import { AiAgentService } from './AiAgentService';

// Avoid constructing the real MCP runtime client (and its transitive deps) when
// we new up the service with mostly-empty mocks below.
vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
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
            postEphemeral: vi.fn().mockResolvedValue(undefined),
        },
    };
    const slackClient = {
        getWebClient: vi.fn().mockResolvedValue(webClient),
    };
    const aiAgentModel = {
        findSlackPrompt: vi.fn().mockResolvedValue(buildSlackPrompt()),
        getCredential: vi.fn().mockResolvedValue(undefined),
        upsertCredential: vi.fn().mockResolvedValue(undefined),
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

describe('AiAgentService MCP OAuth login prompts', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('posts one MCP OAuth login ephemeral per unavailable OAuth server', async () => {
        const { service, slackClient, webClient } = buildService();
        const startOAuth = vi
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

    it('records the prompted timestamp after posting so it only fires once', async () => {
        const { service, aiAgentModel, webClient } = buildService();
        vi.spyOn(service, 'startMcpOAuthConnection').mockResolvedValue(
            'https://oauth.example/mcp-1',
        );
        aiAgentModel.getCredential.mockResolvedValue({
            credentials: { type: 'oauth', connectionStatus: 'not_connected' },
        });

        await postMcpOAuthLoginMessages(service);

        expect(webClient.chat.postEphemeral).toHaveBeenCalledTimes(1);
        expect(aiAgentModel.upsertCredential).toHaveBeenCalledWith(
            expect.objectContaining({
                serverUuid: 'mcp-1',
                scope: 'user',
                userUuid: 'user-1',
                credentials: expect.objectContaining({
                    type: 'oauth',
                    slackLoginPromptedAt: expect.any(String),
                }),
            }),
        );
    });

    it('does not re-post when the user was already prompted for the server', async () => {
        const { service, aiAgentModel, webClient } = buildService();
        const startOAuth = vi.spyOn(service, 'startMcpOAuthConnection');
        aiAgentModel.getCredential.mockResolvedValue({
            credentials: {
                type: 'oauth',
                connectionStatus: 'not_connected',
                slackLoginPromptedAt: '2026-01-01T00:00:00.000Z',
            },
        });

        await postMcpOAuthLoginMessages(service);

        expect(startOAuth).not.toHaveBeenCalled();
        expect(webClient.chat.postEphemeral).not.toHaveBeenCalled();
        expect(aiAgentModel.upsertCredential).not.toHaveBeenCalled();
    });
});
