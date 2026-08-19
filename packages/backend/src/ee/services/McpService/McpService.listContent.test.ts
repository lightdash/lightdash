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
    startSpan: (_options: unknown, callback: CallableFunction) =>
        callback({ spanContext: () => ({ spanId: 'span-id' }) }),
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
const allowedSpaceUuid = 'allowed-space-uuid';
const blockedSpaceUuid = 'blocked-space-uuid';

const account = {
    isRegisteredUser: () => true,
    isServiceAccount: () => false,
    user: { id: userUuid },
};

const user = {
    userUuid,
    organizationUuid,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => ({ inverted: false })),
        rules: [],
    },
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

type TestSpace = {
    uuid: string;
    name: string;
    path: string;
    parentSpaceUuid: string | null;
    chartCount: number;
    dashboardCount: number;
    childSpaceCount: number;
    appCount: number;
    userAccess?: { hasDirectAccess: boolean };
    access?: string[];
};

type TestContentItem =
    | {
          contentType: 'chart' | 'dashboard' | 'data_app';
          uuid: string;
          name: string;
          slug: string;
      }
    | {
          contentType: 'space';
          uuid: string;
          name: string;
          path: string;
          chartCount: number;
          dashboardCount: number;
          childSpaceCount: number;
          appCount: number;
          access: string[];
      };

type TestRuntimeContext = {
    spaceAccess: string[] | null;
};

const makeMcpService = ({
    context = {
        projectUuid,
        projectName: 'Project',
        agentUuid: null,
        agentName: null,
        tags: null,
    },
    agent = null,
    availableAgents = [],
    spaces = [],
    contentResults = { data: [], pagination: undefined },
}: {
    context?: {
        projectUuid: string;
        projectName: string;
        agentUuid: string | null;
        agentName: string | null;
        tags: string[] | null;
    };
    agent?: {
        uuid: string;
        name: string;
        tags: string[] | null;
        spaceAccess: string[];
    } | null;
    availableAgents?: Array<{
        uuid: string;
        name: string;
        description: string | null;
        tags: string[] | null;
        projectUuid: string;
    }>;
    spaces?: TestSpace[];
    contentResults?: {
        data: TestContentItem[];
        pagination:
            | {
                  page: number;
                  pageSize: number;
                  totalResults: number;
                  totalPageCount: number;
              }
            | undefined;
    };
} = {}) => {
    const aiAgentService = {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        listAgents: vi.fn().mockResolvedValue(availableAgents),
        getAgent: vi.fn().mockImplementation(async () => {
            if (!agent) throw new Error('Agent not mocked');
            return {
                description: null,
                projectUuid,
                context: {
                    explores: [],
                    verifiedQuestions: [],
                    instruction: null,
                },
                ...agent,
            };
        }),
    };

    const toSpaceSlug = (path: string) =>
        path.replace(/\./g, '/').replace(/_/g, '-');
    const getContentHref = (
        item: Extract<
            TestContentItem,
            { contentType: 'chart' | 'dashboard' | 'data_app' }
        >,
    ) => {
        switch (item.contentType) {
            case 'dashboard':
                return `/projects/${projectUuid}/dashboards/${item.uuid}/view#dashboard-link`;
            case 'chart':
                return `/projects/${projectUuid}/saved/${item.uuid}/view#chart-link`;
            case 'data_app':
                return `/projects/${projectUuid}/apps/${item.uuid}`;
            default:
                throw new Error(`Unsupported content type`);
        }
    };
    const aiAgentToolsService = {
        createRuntime: vi.fn((runtimeContext: TestRuntimeContext) => ({
            listContent: vi.fn(async ({ spaceSlug, page }) => {
                if (spaceSlug === null) {
                    const visibleSpaces = spaces.filter(
                        (space) =>
                            !runtimeContext.spaceAccess?.length ||
                            runtimeContext.spaceAccess.includes(space.uuid),
                    );
                    return {
                        spaceSlug,
                        items: visibleSpaces.map((space) => ({
                            contentType: 'space',
                            name: space.name,
                            slug: toSpaceSlug(space.path),
                            href: `/projects/${projectUuid}/spaces/${space.uuid}`,
                            chartCount: space.chartCount,
                            dashboardCount: space.dashboardCount,
                            childSpaceCount: space.childSpaceCount,
                            appCount: space.appCount,
                            directAccess:
                                space.userAccess?.hasDirectAccess === true,
                        })),
                        pagination: {
                            page,
                            pageSize: 25,
                            totalResults: visibleSpaces.length,
                            totalPageCount: 1,
                        },
                    };
                }

                return {
                    spaceSlug,
                    items: contentResults.data.map((item) =>
                        item.contentType === 'space'
                            ? {
                                  contentType: 'space',
                                  name: item.name,
                                  slug: toSpaceSlug(item.path),
                                  href: `/projects/${projectUuid}/spaces/${item.uuid}`,
                                  chartCount: item.chartCount,
                                  dashboardCount: item.dashboardCount,
                                  childSpaceCount: item.childSpaceCount,
                                  appCount: item.appCount,
                                  directAccess:
                                      item.access?.includes(userUuid) === true,
                              }
                            : {
                                  ...item,
                                  href: getContentHref(item),
                              },
                    ),
                    pagination: contentResults.pagination,
                };
            }),
        })),
    };

    const projectService = {
        getProject: vi.fn().mockResolvedValue({ organizationUuid }),
        getSpaces: vi.fn().mockResolvedValue(spaces),
    };

    const service = new McpService({
        aiAgentService,
        aiAgentToolsService,
        aiOrganizationSettingsService: {
            isAiAgentsVisible: vi.fn().mockResolvedValue(true),
        },
        aiRouterService: {},
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
        mcpContextModel: {
            getContext: vi.fn().mockResolvedValue({ context }),
        },
        projectModel: {
            getAllByOrganizationUuid: vi.fn().mockResolvedValue([
                {
                    projectUuid,
                    name: 'Project',
                    type: 'DEFAULT',
                    expiresAt: null,
                },
            ]),
        },
        projectService,
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

    return {
        aiAgentService,
        aiAgentToolsService,
        projectService,
        service,
    };
};

const getToolCallback = (toolName: McpToolName) => {
    const callback = mockRegisteredMcpTools.get(toolName);
    if (!callback) {
        throw new Error(`Tool ${toolName} was not registered`);
    }
    return callback;
};

const getTextResult = (result: unknown) => {
    const response = result as { content?: Array<{ text?: string }> };
    return response.content?.[0]?.text ?? '';
};

describe('MCP list_content', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.clear();
    });

    it('returns bootstrap context without changing it', async () => {
        makeMcpService();

        const result = (await getToolCallback(McpToolName.GET_CONTEXT)(
            {},
            extra,
        )) as {
            structuredContent: Record<string, unknown>;
        };

        expect(result.structuredContent).toEqual({
            activeProject: {
                projectUuid,
                projectName: 'Project',
                selectedTags: null,
            },
            activeAgent: null,
            availableProjects: [
                {
                    projectUuid,
                    name: 'Project',
                    type: 'DEFAULT',
                    expiresAt: null,
                    availableAgents: [],
                },
            ],
        });
    });

    it('omits an active agent that is no longer accessible', async () => {
        makeMcpService({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: 'blocked-agent-uuid',
                agentName: 'Blocked agent',
                tags: ['blocked'],
            },
        });

        const result = (await getToolCallback(McpToolName.GET_CONTEXT)(
            {},
            extra,
        )) as {
            structuredContent: Record<string, unknown>;
        };

        expect(result.structuredContent).toMatchObject({
            activeAgent: null,
            availableProjects: [{ availableAgents: [] }],
        });
    });

    it('lists only accessible agents within accessible projects', async () => {
        const { aiAgentService } = makeMcpService({
            availableAgents: [
                {
                    uuid: 'available-agent-uuid',
                    name: 'Available agent',
                    description: 'Accessible to the current user',
                    tags: ['finance'],
                    projectUuid,
                },
            ],
        });

        const result = (await getToolCallback(McpToolName.GET_CONTEXT)(
            {},
            extra,
        )) as {
            structuredContent: Record<string, unknown>;
        };

        expect(aiAgentService.listAgents).toHaveBeenCalledWith(user);
        expect(result.structuredContent).toMatchObject({
            availableProjects: [
                {
                    projectUuid,
                    availableAgents: [
                        {
                            agentUuid: 'available-agent-uuid',
                            name: 'Available agent',
                            description: 'Accessible to the current user',
                            tags: ['finance'],
                        },
                    ],
                },
            ],
        });
    });

    it('lists root content spaces with active agent space access', async () => {
        makeMcpService({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: 'agent-uuid',
                agentName: 'Agent',
                tags: null,
            },
            agent: {
                uuid: 'agent-uuid',
                name: 'Agent',
                tags: [],
                spaceAccess: [allowedSpaceUuid],
            },
            spaces: [
                {
                    uuid: allowedSpaceUuid,
                    name: 'Allowed Space',
                    path: 'allowed_space',
                    parentSpaceUuid: null,
                    chartCount: 2,
                    dashboardCount: 1,
                    childSpaceCount: 0,
                    appCount: 0,
                    userAccess: { hasDirectAccess: true },
                },
                {
                    uuid: blockedSpaceUuid,
                    name: 'Blocked Space',
                    path: 'blocked_space',
                    parentSpaceUuid: null,
                    chartCount: 1,
                    dashboardCount: 0,
                    childSpaceCount: 0,
                    appCount: 0,
                    userAccess: { hasDirectAccess: true },
                },
            ],
        });

        const result = await getToolCallback(McpToolName.LIST_CONTENT)(
            {
                projectUuid,
                agentUuid: 'agent-uuid',
                spaceSlug: null,
                page: 1,
            },
            extra,
        );
        const text = getTextResult(result);

        expect(text).toContain('contentType="space"');
        expect(text).toContain('name="Allowed Space"');
        expect(text).toContain('slug="allowed-space"');
        expect(text).toContain(
            `href="/projects/${projectUuid}/spaces/${allowedSpaceUuid}"`,
        );
        expect(text).toContain('chartCount="2"');
        expect(text).not.toContain('Blocked Space');
    });

    it('uses the explicit project instead of stored context', async () => {
        const explicitProjectUuid = 'explicit-project-uuid';
        const { aiAgentToolsService, projectService } = makeMcpService();

        await getToolCallback(McpToolName.LIST_CONTENT)(
            {
                projectUuid: explicitProjectUuid,
                spaceSlug: null,
                page: 1,
            },
            extra,
        );

        expect(projectService.getProject).toHaveBeenCalledWith(
            explicitProjectUuid,
            account,
        );
        expect(aiAgentToolsService.createRuntime).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: explicitProjectUuid,
                agentUuid: undefined,
                tags: null,
                spaceAccess: null,
            }),
        );
    });

    it('lists direct content inside a space slug', async () => {
        makeMcpService({
            spaces: [
                {
                    uuid: allowedSpaceUuid,
                    name: 'Allowed Space',
                    path: 'allowed_space',
                    parentSpaceUuid: null,
                    chartCount: 2,
                    dashboardCount: 1,
                    childSpaceCount: 1,
                    appCount: 0,
                    userAccess: { hasDirectAccess: true },
                },
            ],
            contentResults: {
                data: [
                    {
                        contentType: 'chart',
                        uuid: 'revenue-chart-uuid',
                        name: 'Revenue Chart',
                        slug: 'revenue-chart',
                    },
                    {
                        contentType: 'space',
                        uuid: 'child-space-uuid',
                        name: 'Child Space',
                        path: 'allowed_space.child_space',
                        chartCount: 0,
                        dashboardCount: 0,
                        childSpaceCount: 0,
                        appCount: 0,
                        access: [userUuid],
                    },
                ],
                pagination: {
                    page: 1,
                    pageSize: 25,
                    totalResults: 2,
                    totalPageCount: 1,
                },
            },
        });

        const result = await getToolCallback(McpToolName.LIST_CONTENT)(
            { projectUuid, spaceSlug: 'allowed-space', page: 1 },
            extra,
        );
        const text = getTextResult(result);

        expect(text).toContain('spaceSlug="allowed-space"');
        expect(text).toContain('name="Revenue Chart"');
        expect(text).toContain('slug="revenue-chart"');
        expect(text).toContain(
            `href="/projects/${projectUuid}/saved/revenue-chart-uuid/view#chart-link"`,
        );
        expect(text).toContain('name="Child Space"');
        expect(text).toContain('slug="allowed-space/child-space"');
        expect(text).toContain(
            `href="/projects/${projectUuid}/spaces/child-space-uuid"`,
        );
    });
});
