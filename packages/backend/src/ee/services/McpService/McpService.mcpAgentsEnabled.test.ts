import { McpService, McpToolName } from './McpService';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<unknown>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    getActiveSpan: () => undefined,
    isEnabled: () => false,
    startSpanManual: (_options: unknown, callback: CallableFunction) =>
        callback({ spanContext: () => ({ spanId: 'span-id' }) }, vi.fn()),
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer() {
            return {
                registerResource: vi.fn(),
                registerPrompt: vi.fn(),
                registerTool: vi.fn(
                    (
                        name: string,
                        _config: Record<string, unknown>,
                        callback: RegisteredToolCallback,
                    ) => {
                        mockRegisteredMcpTools.set(name, callback);
                        return {};
                    },
                ),
            };
        },
    ),
}));

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';

const account = {
    user: {
        userUuid,
        ability: {
            can: vi.fn(() => true),
            cannot: vi.fn(() => false),
            relevantRuleFor: vi.fn(() => ({ inverted: false })),
            rules: [],
        },
    },
    organization: { organizationUuid },
    authentication: { type: 'pat' },
};

const user = {
    userUuid,
    organizationUuid,
    ability: account.user.ability,
};

const extra = {
    signal: new AbortController().signal,
    requestId: 'request-id',
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
    authInfo: {
        extra: {
            user,
            account,
        },
    },
};

const disabledError =
    'Agent access over MCP is disabled for this organization. Ask an admin to enable it, or use Ask AI in Lightdash.';

const makeMcpService = ({
    mcpAgentsEnabled,
}: {
    mcpAgentsEnabled: boolean;
}) => {
    const storedContext = {
        projectUuid,
        projectName: 'Project',
        agentUuid: null as string | null,
        agentName: null as string | null,
        tags: ['finance-only'],
    };

    const mcpContextModel = {
        getContext: vi.fn().mockImplementation(async () => ({
            context: { ...storedContext },
        })),
        setContext: vi.fn().mockImplementation(async ({ context }) => {
            Object.assign(storedContext, context);
            return { context: { ...storedContext } };
        }),
    };

    const aiAgentService = {
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent-uuid',
            projectUuid,
            name: 'Finance',
            tags: ['finance'],
            spaceAccess: [],
        }),
        listAgents: vi.fn().mockResolvedValue([]),
    };

    const aiAgentToolsService = {
        createRuntime: vi.fn(({ agentUuid }) => ({
            listContent: vi.fn(async () => ({
                items: [],
                agentUuid,
                pagination: {
                    page: 1,
                    pageSize: 25,
                    totalResults: 0,
                    totalPageCount: 0,
                },
            })),
        })),
    };

    const aiRouterService = {
        routePromptToAgent: vi.fn(),
    };

    const aiOrganizationSettingsService = {
        isMcpAgentsEnabled: vi.fn().mockResolvedValue(mcpAgentsEnabled),
    };

    const service = new McpService({
        aiAgentService,
        aiAgentToolsService,
        aiOrganizationSettingsService,
        aiRouterService,
        aiWritebackService: {},
        analytics: { track: vi.fn() },
        asyncQueryService: {},
        catalogService: {},
        contentVerificationService: {},
        featureFlagService: {},
        lightdashConfig: {
            ai: {
                copilot: {
                    maxQueryLimit: 500,
                },
            },
            mcp: {
                enabled: true,
                runSqlMaxLimit: 500,
            },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel,
        projectModel: {},
        projectService: {
            getProject: vi
                .fn()
                .mockResolvedValue({ organizationUuid, name: 'Project' }),
            getSpaces: vi.fn().mockResolvedValue([]),
        },
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

    return {
        service,
        aiAgentService,
        aiAgentToolsService,
        aiRouterService,
        mcpContextModel,
        storedContext,
    };
};

describe('McpService with MCP agent access disabled', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.clear();
    });

    it.each([
        [McpToolName.LIST_AGENTS, { projectUuid }],
        [McpToolName.ROUTE_AGENT, { prompt: 'show revenue', projectUuid }],
        [McpToolName.SET_AGENT, { agentUuid: 'agent-uuid', projectUuid }],
        [McpToolName.GET_CURRENT_AGENT, { projectUuid }],
    ])('blocks %s', async (toolName, args) => {
        const { aiAgentService, aiRouterService, mcpContextModel } =
            makeMcpService({ mcpAgentsEnabled: false });

        const tool = mockRegisteredMcpTools.get(toolName);
        expect(tool).toBeDefined();

        await expect(tool!(args, extra)).rejects.toThrow(disabledError);
        expect(aiAgentService.listAgents).not.toHaveBeenCalled();
        expect(aiRouterService.routePromptToAgent).not.toHaveBeenCalled();
        expect(mcpContextModel.setContext).not.toHaveBeenCalled();
    });

    it('still allows clear_agent so users can un-stick their context', async () => {
        const { mcpContextModel, storedContext } = makeMcpService({
            mcpAgentsEnabled: false,
        });
        storedContext.agentUuid = 'agent-uuid';
        storedContext.agentName = 'Finance';

        const tool = mockRegisteredMcpTools.get(McpToolName.CLEAR_AGENT);
        const result = (await tool!({ projectUuid }, extra)) as {
            content: Array<{ text: string }>;
        };

        expect(result.content[0].text).toContain(
            'Agent context cleared successfully',
        );
        expect(mcpContextModel.setContext).toHaveBeenCalledWith(
            expect.objectContaining({
                context: expect.objectContaining({
                    agentUuid: null,
                    agentName: null,
                }),
            }),
        );
    });

    it('rejects a data tool called with an explicit agentUuid', async () => {
        const { aiAgentService, aiAgentToolsService } = makeMcpService({
            mcpAgentsEnabled: false,
        });

        const tool = mockRegisteredMcpTools.get(McpToolName.LIST_CONTENT);
        await expect(
            tool!(
                {
                    projectUuid,
                    agentUuid: 'agent-uuid',
                    spaceSlug: null,
                    page: 1,
                    pageSize: 25,
                },
                extra,
            ),
        ).rejects.toThrow(disabledError);
        expect(aiAgentService.getAgent).not.toHaveBeenCalled();
        expect(aiAgentToolsService.createRuntime).not.toHaveBeenCalled();
    });

    it('still serves the same data tool without an agentUuid', async () => {
        const { aiAgentToolsService } = makeMcpService({
            mcpAgentsEnabled: false,
        });

        const tool = mockRegisteredMcpTools.get(McpToolName.LIST_CONTENT);
        await tool!(
            { projectUuid, spaceSlug: null, page: 1, pageSize: 25 },
            extra,
        );

        expect(aiAgentToolsService.createRuntime).toHaveBeenCalledWith(
            expect.objectContaining({ agentUuid: undefined }),
        );
    });

    it('withholds the stored agent from legacy scope injection but preserves the context', async () => {
        const { service, storedContext, mcpContextModel } = makeMcpService({
            mcpAgentsEnabled: false,
        });
        storedContext.agentUuid = 'agent-uuid';
        storedContext.agentName = 'Finance';

        const scope = await service.getLegacyToolScope(
            user as unknown as Parameters<McpService['getLegacyToolScope']>[0],
        );

        expect(scope).toEqual({ projectUuid, agentUuid: null });
        expect(mcpContextModel.setContext).not.toHaveBeenCalled();
        expect(storedContext.agentUuid).toBe('agent-uuid');
    });

    it('injects the stored agent into legacy scope when enabled', async () => {
        const { service, storedContext } = makeMcpService({
            mcpAgentsEnabled: true,
        });
        storedContext.agentUuid = 'agent-uuid';

        const scope = await service.getLegacyToolScope(
            user as unknown as Parameters<McpService['getLegacyToolScope']>[0],
        );

        expect(scope).toEqual({ projectUuid, agentUuid: 'agent-uuid' });
    });
});
