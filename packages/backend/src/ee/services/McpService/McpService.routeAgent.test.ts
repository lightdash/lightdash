import type { AiAgentWithContext } from '@lightdash/common';
import { McpService, McpToolName } from './McpService';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<unknown>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();

jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
    getActiveSpan: () => undefined,
    isEnabled: () => false,
    startSpanManual: (_options: unknown, callback: CallableFunction) =>
        callback({ spanContext: () => ({ spanId: 'span-id' }) }, jest.fn()),
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: jest.fn().mockImplementation(() => ({
        registerResource: jest.fn(),
        registerPrompt: jest.fn(),
        registerTool: jest.fn(
            (
                name: string,
                _config: Record<string, unknown>,
                callback: RegisteredToolCallback,
            ) => {
                mockRegisteredMcpTools.set(name, callback);
                return {};
            },
        ),
    })),
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
            can: jest.fn(() => true),
            cannot: jest.fn(() => false),
            relevantRuleFor: jest.fn(() => undefined),
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
    sendNotification: jest.fn(),
    sendRequest: jest.fn(),
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
    spaceAccess: [allowedSpaceUuid],
    enableDataAccess: true,
    enableSelfImprovement: true,
    enableContentTools: true,
    version: 1,
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
        getContext: jest.fn().mockImplementation(async () => ({
            context: { ...storedContext },
        })),
        setContext: jest.fn().mockImplementation(async ({ context }) => {
            Object.assign(storedContext, context);
            return { context: { ...storedContext } };
        }),
    };

    const aiAgentService = {
        getAgent: jest.fn().mockResolvedValue(selectedAgent),
    };

    const aiAgentToolsService = {
        createRuntime: jest.fn(({ spaceAccess, agentUuid }) => ({
            listContent: jest.fn(async ({ spaceSlug }: { spaceSlug: null }) => {
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
        routePromptToAgent: jest.fn().mockResolvedValue({
            candidates: routeCandidates,
            suggestedAgent: selectedAgent,
            routerUuid: 'router-uuid',
            confidence: 'low',
            reasoning: 'Finance agent is the closest fit.',
            shouldSkipForwardingQuery: false,
            nextAction: 'create_thread',
        }),
    };

    const service = new McpService({
        aiAgentService,
        aiAgentToolsService,
        aiOrganizationSettingsService: {
            getSettings: jest.fn().mockResolvedValue({ aiAgentsVisible: true }),
        },
        aiRouterService,
        aiWritebackService: {},
        analytics: { track: jest.fn() },
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
            getProject: jest
                .fn()
                .mockResolvedValue({ organizationUuid, name: 'Project' }),
            getSpaces: jest.fn().mockResolvedValue([]),
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

describe('McpService route_agent', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.clear();
    });

    it('writes the routed agent into context and get_current_agent returns it', async () => {
        const { aiRouterService, mcpContextModel } = makeMcpService();

        const routeAgentTool = mockRegisteredMcpTools.get(
            McpToolName.ROUTE_AGENT,
        );
        const getCurrentAgentTool = mockRegisteredMcpTools.get(
            McpToolName.GET_CURRENT_AGENT,
        );

        expect(routeAgentTool).toBeDefined();
        expect(getCurrentAgentTool).toBeDefined();

        const routeResult = (await routeAgentTool!(
            { prompt: 'show revenue by month' },
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

        const currentResult = (await getCurrentAgentTool!({}, extra)) as {
            content: Array<{ text: string }>;
        };
        expect(JSON.parse(currentResult.content[0].text)).toEqual(
            expect.objectContaining({
                agentUuid: 'agent-uuid',
                agentName: 'Finance',
                explores: ['orders'],
            }),
        );
    });

    it('applies routed agent scope to later tool calls', async () => {
        const { aiAgentToolsService } = makeMcpService();

        const routeAgentTool = mockRegisteredMcpTools.get(
            McpToolName.ROUTE_AGENT,
        );
        const listContentTool = mockRegisteredMcpTools.get(
            McpToolName.LIST_CONTENT,
        );

        await routeAgentTool!({ prompt: 'show revenue by month' }, extra);

        const listContentResult = (await listContentTool!(
            { spaceSlug: null, page: 1, pageSize: 25 },
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
});
