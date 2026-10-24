import { subject } from '@casl/ability';
import { ForbiddenError } from '@lightdash/common';
import type { AiAgentWithContext } from '@lightdash/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<unknown>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();

vi.mock('@sentry/node', () => ({
    startSpan: (_options: unknown, callback: () => unknown) => callback(),
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
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
                server: {
                    registerCapabilities: vi.fn(),
                    setRequestHandler: vi.fn(),
                },
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
const allowedSpaceUuid = 'allowed-space-uuid';
const blockedSpaceUuid = 'blocked-space-uuid';

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
    ...defaultSessionUser,
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

const selectedAgent: AiAgentWithContext = {
    uuid: 'agent-uuid',
    projectUuid,
    organizationUuid,
    name: 'Finance',
    description: 'Finance specialist',
    imageUrl: null,
    imageUrlSource: null,
    tags: ['finance'],
    integrations: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    instruction: 'Prioritize revenue metrics.',
    groupAccess: [],
    userAccess: [],
    userAccessDetails: [],
    spaceAccess: [allowedSpaceUuid],
    enableDataAccess: true,
    enableSelfImprovement: true,
    enableContentTools: true,
    enableUserContext: false,
    enableSqlMode: true,
    enableSqlAutoApproval: false,
    enableComposerQueries: false,
    adminOnly: false,
    modelConfig: null,
    providerCredentialUuid: null,
    version: 1,
    threadRetentionHours: null,
    context: {
        uuid: 'agent-uuid',
        projectUuid,
        name: 'Finance',
        description: 'Finance specialist',
        explores: ['orders'],
        verifiedQuestions: ['What is monthly revenue?'],
        instruction: 'Prioritize revenue metrics.',
    },
};

const routeCandidates = [
    selectedAgent,
    {
        ...selectedAgent,
        uuid: 'agent-2',
        name: 'General',
        context: {
            ...selectedAgent.context,
            uuid: 'agent-2',
            name: 'General',
        },
    },
];

const makeMcpService = () => {
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
        getAgent: vi.fn().mockResolvedValue(selectedAgent),
        listAgents: vi.fn().mockResolvedValue(routeCandidates),
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
    };

    const aiAgentToolsService = {
        createRuntime: vi.fn(({ spaceAccess, agentUuid }) => ({
            listContent: vi.fn(async ({ spaceSlug }: { spaceSlug: null }) => {
                const visibleSpaceUuids =
                    spaceAccess?.length === 0 || !spaceAccess
                        ? [allowedSpaceUuid, blockedSpaceUuid]
                        : [allowedSpaceUuid, blockedSpaceUuid].filter((uuid) =>
                              spaceAccess.includes(uuid),
                          );

                return {
                    spaceSlug,
                    items: visibleSpaceUuids.map((uuid) => ({
                        contentType: 'space',
                        name:
                            uuid === allowedSpaceUuid
                                ? 'Allowed Space'
                                : 'Blocked Space',
                        slug:
                            uuid === allowedSpaceUuid
                                ? 'allowed-space'
                                : 'blocked-space',
                        chartCount: 0,
                        dashboardCount: 0,
                        childSpaceCount: 0,
                        appCount: 0,
                        directAccess: true,
                        agentUuid,
                    })),
                    pagination: {
                        page: 1,
                        pageSize: 25,
                        totalResults: visibleSpaceUuids.length,
                        totalPageCount: 1,
                    },
                };
            }),
        })),
    };

    const aiRouterService = {
        routePromptToAgent: vi.fn().mockResolvedValue({
            candidates: routeCandidates,
            suggestedAgent: selectedAgent,
            routerUuid: 'router-uuid',
            confidence: 'low',
            reasoning: 'Finance agent is the closest fit.',
            shouldSkipForwardingQuery: false,
            nextAction: 'create_thread',
        }),
    };

    const aiOrganizationSettingsService = {
        isMcpAgentsEnabled: vi.fn().mockResolvedValue(true),
    };
    const mcpToolCallModel = {
        createToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const service = new McpService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
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
        mcpToolCallModel,
        projectModel: {
            getAllByOrganizationUuid: vi
                .fn()
                .mockResolvedValue([{ projectUuid, name: 'Project' }]),
        },
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
        mcpToolCallModel,
        aiOrganizationSettingsService,
    };
};

describe('McpService route_agent', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.clear();
    });

    it('writes the routed agent into context', async () => {
        const { aiRouterService, mcpContextModel } = makeMcpService();

        const routeAgentTool = mockRegisteredMcpTools.get(
            McpToolName.ROUTE_AGENT,
        );

        expect(routeAgentTool).toBeDefined();

        const routeResult = (await routeAgentTool!(
            { prompt: 'show revenue by month', projectUuid },
            extra,
        )) as {
            content: Array<{ text: string }>;
            structuredContent: Record<string, unknown>;
        };

        expect(aiRouterService.routePromptToAgent).toHaveBeenCalledWith(
            account,
            {
                prompt: 'show revenue by month',
                projectUuid,
                mode: 'mcp',
            },
        );
        expect(mcpContextModel.setContext).toHaveBeenCalledWith(
            expect.objectContaining({
                context: expect.objectContaining({
                    projectUuid,
                    projectName: 'Project',
                    tags: ['finance-only'],
                    agentUuid: 'agent-uuid',
                    agentName: 'Finance',
                }),
            }),
        );
        expect(routeResult.structuredContent).toEqual(
            expect.objectContaining({
                agentUuid: 'agent-uuid',
                agentName: 'Finance',
                confidence: 'low',
                reasoning: 'Finance agent is the closest fit.',
            }),
        );
    });

    it('applies an explicitly routed agent to later tool calls', async () => {
        const { aiAgentToolsService } = makeMcpService();

        const routeAgentTool = mockRegisteredMcpTools.get(
            McpToolName.ROUTE_AGENT,
        );
        const listContentTool = mockRegisteredMcpTools.get(
            McpToolName.LIST_CONTENT,
        );

        await routeAgentTool!(
            { prompt: 'show revenue by month', projectUuid },
            extra,
        );

        const listContentResult = (await listContentTool!(
            {
                projectUuid,
                agentUuid: 'agent-uuid',
                spaceSlug: null,
                page: 1,
                pageSize: 25,
            },
            extra,
        )) as {
            content: Array<{ text: string }>;
        };
        const rendered = listContentResult.content[0].text;

        expect(aiAgentToolsService.createRuntime).toHaveBeenLastCalledWith(
            expect.objectContaining({
                agentUuid: 'agent-uuid',
                tags: ['finance'],
                spaceAccess: [allowedSpaceUuid],
            }),
        );
        expect(rendered).toContain('slug="allowed-space"');
        expect(rendered).not.toContain('slug="blocked-space"');
    });

    it('rejects a project argument that differs from the pinned project', async () => {
        const { aiRouterService } = makeMcpService();
        const routeAgentTool = mockRegisteredMcpTools.get(
            McpToolName.ROUTE_AGENT,
        );
        const pinnedExtra = {
            ...extra,
            authInfo: {
                extra: {
                    ...extra.authInfo.extra,
                    headerProjectUuid: projectUuid,
                },
            },
        };

        await expect(
            routeAgentTool!(
                {
                    prompt: 'show revenue by month',
                    projectUuid: 'another-project-uuid',
                },
                pinnedExtra,
            ),
        ).rejects.toThrow(
            'The requested project does not match the pinned MCP project',
        );
        expect(aiRouterService.routePromptToAgent).not.toHaveBeenCalled();
    });
});

describe('McpService pinned agent', () => {
    const pinnedExtra = {
        ...extra,
        authInfo: {
            extra: {
                ...extra.authInfo.extra,
                headerProjectUuid: projectUuid,
                headerAgentUuid: selectedAgent.uuid,
            },
        },
    };
    const call = async (
        name: string,
        args: Record<string, unknown>,
        context = pinnedExtra,
    ) => {
        const callback = mockRegisteredMcpTools.get(name);
        if (!callback) throw new Error('Missing tool');
        return callback(args, context);
    };

    it('authorizes the pinned agent and refuses disabled MCP agents', async () => {
        const { service, aiAgentService, aiOrganizationSettingsService } =
            makeMcpService();
        await expect(
            service.getPinnedAgent(
                { ...defaultSessionUser, userUuid, organizationUuid },
                {
                    agentUuid: selectedAgent.uuid,
                    projectUuid,
                },
            ),
        ).resolves.toEqual({
            uuid: selectedAgent.uuid,
            projectUuid,
            name: selectedAgent.name,
            instruction: selectedAgent.instruction,
        });
        expect(aiAgentService.getAgent).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid, organizationUuid }),
            selectedAgent.uuid,
            projectUuid,
        );
        aiAgentService.getAgent.mockClear();
        aiOrganizationSettingsService.isMcpAgentsEnabled.mockResolvedValue(
            false,
        );
        await expect(
            service.getPinnedAgent(
                { ...defaultSessionUser, userUuid, organizationUuid },
                {
                    agentUuid: selectedAgent.uuid,
                    projectUuid,
                },
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(aiAgentService.getAgent).not.toHaveBeenCalled();
    });

    it('rejects a pinned agent when its project is not viewable', async () => {
        const { service, aiAgentService } = makeMcpService();
        const relevantRuleFor = vi
            .spyOn(defaultSessionUser.ability, 'relevantRuleFor')
            .mockReturnValueOnce(null);
        try {
            const result = service.getPinnedAgent(
                { ...defaultSessionUser, userUuid, organizationUuid },
                { agentUuid: selectedAgent.uuid, projectUuid: undefined },
            );
            await expect(result).rejects.toThrow(ForbiddenError);
            await expect(result).rejects.toThrow(
                'You do not have access to this project',
            );
            expect(aiAgentService.getAgent).toHaveResolvedWith(selectedAgent);
            expect(relevantRuleFor).toHaveBeenCalledWith(
                'view',
                subject('Project', {
                    projectUuid: selectedAgent.projectUuid,
                    organizationUuid: selectedAgent.organizationUuid,
                }),
            );
        } finally {
            relevantRuleFor.mockRestore();
        }
    });

    it.each([undefined, selectedAgent.uuid])(
        'injects the pin into runtime for agentUuid=%s',
        async (agentUuid) => {
            const { aiAgentToolsService, mcpToolCallModel } = makeMcpService();
            await call(McpToolName.LIST_CONTENT, {
                projectUuid,
                agentUuid,
                spaceSlug: null,
                page: 1,
                pageSize: 25,
            });
            expect(aiAgentToolsService.createRuntime).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentUuid: selectedAgent.uuid,
                    tags: selectedAgent.tags,
                    spaceAccess: selectedAgent.spaceAccess,
                }),
            );
        },
    );

    it('refuses a different agent before runtime creation', async () => {
        const { aiAgentToolsService } = makeMcpService();
        await expect(
            call(McpToolName.LIST_CONTENT, { projectUuid, agentUuid: 'other' }),
        ).rejects.toThrow(
            'The requested agent does not match the pinned MCP agent',
        );
        expect(aiAgentToolsService.createRuntime).not.toHaveBeenCalled();
    });

    it('does not scope project-independent tools', async () => {
        const { aiAgentService } = makeMcpService();
        await expect(call('get_lightdash_version', {})).resolves.toBeDefined();
        expect(aiAgentService.getAgent).not.toHaveBeenCalled();
    });

    it('returns the pinned route without routing or writing stored context', async () => {
        const { aiRouterService, mcpContextModel } = makeMcpService();
        const result = await call(McpToolName.ROUTE_AGENT, {
            projectUuid,
            prompt: 'revenue',
        });
        expect(result).toMatchObject({
            structuredContent: {
                agentUuid: selectedAgent.uuid,
                agentName: selectedAgent.name,
                confidence: 'high',
                reasoning: 'This MCP connection is pinned to this agent.',
                candidates: [
                    {
                        agentUuid: selectedAgent.uuid,
                        name: selectedAgent.name,
                        description: selectedAgent.description,
                    },
                ],
            },
        });
        expect(aiRouterService.routePromptToAgent).not.toHaveBeenCalled();
        expect(mcpContextModel.setContext).not.toHaveBeenCalled();
    });

    it('lists only the pinned agent', async () => {
        makeMcpService();
        const result = await call(McpToolName.LIST_AGENTS, { projectUuid });
        expect(result).toMatchObject({
            content: [{ text: expect.stringContaining('"Finance"') }],
        });
        expect(result).toMatchObject({
            content: [{ text: expect.not.stringContaining('"General"') }],
        });
    });

    it('uses the pinned agent instead of stored context', async () => {
        const { storedContext } = makeMcpService();
        storedContext.agentUuid = 'agent-2';
        const result = await call('get_context', {});
        expect(result).toMatchObject({
            structuredContent: {
                activeAgent: {
                    projectUuid,
                    agentUuid: selectedAgent.uuid,
                    agentName: selectedAgent.name,
                },
            },
        });
    });

    it('uses the pin for legacy scope', async () => {
        const { service, storedContext } = makeMcpService();
        storedContext.agentUuid = 'agent-2';
        await expect(
            service.getLegacyToolScope(
                { ...defaultSessionUser, userUuid, organizationUuid },
                projectUuid,
                selectedAgent.uuid,
            ),
        ).resolves.toEqual({ projectUuid, agentUuid: selectedAgent.uuid });
    });

    it('appends instructions only to pinned servers', async () => {
        const { service } = makeMcpService();
        const options = makeMcpServerOptions();
        await service.createServer(options);
        const unpinnedCall = vi.mocked(McpServer).mock.calls.at(-1);
        options.req.pinnedAgent = selectedAgent;
        await service.createServer(options);
        const pinnedCall = vi.mocked(McpServer).mock.calls.at(-1);
        expect(unpinnedCall?.[1]?.instructions).not.toContain(
            '## Pinned agent',
        );
        expect(pinnedCall?.[1]?.instructions).toContain(
            unpinnedCall?.[1]?.instructions,
        );
        expect(pinnedCall?.[1]?.instructions).toContain(
            selectedAgent.instruction,
        );
        expect(pinnedCall?.[1]?.instructions).toContain(selectedAgent.uuid);
    });

    it('audits a pinned tool call with the effective agent', async () => {
        const { mcpToolCallModel } = makeMcpService();
        await call(McpToolName.LIST_CONTENT, {
            projectUuid,
            spaceSlug: null,
            page: 1,
            pageSize: 25,
        });
        await vi.waitFor(() =>
            expect(mcpToolCallModel.createToolCall).toHaveBeenCalledWith(
                expect.objectContaining({ agent_uuid: selectedAgent.uuid }),
            ),
        );
    });
});
