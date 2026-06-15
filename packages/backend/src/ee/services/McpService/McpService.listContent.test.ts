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
    isRegisteredUser: () => true,
    isServiceAccount: () => false,
    user: { id: userUuid },
};

const user = {
    userUuid,
    organizationUuid,
    ability: {
        can: jest.fn(() => true),
        cannot: jest.fn(() => false),
        relevantRuleFor: jest.fn(() => undefined),
        rules: [],
    },
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
        getAgent: jest.fn().mockImplementation(async () => {
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
    const aiAgentToolsService = {
        createRuntime: jest.fn((runtimeContext: TestRuntimeContext) => ({
            listContent: jest.fn(async ({ spaceSlug, page }) => {
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
                                  chartCount: item.chartCount,
                                  dashboardCount: item.dashboardCount,
                                  childSpaceCount: item.childSpaceCount,
                                  appCount: item.appCount,
                                  directAccess:
                                      item.access?.includes(userUuid) === true,
                              }
                            : item,
                    ),
                    pagination: contentResults.pagination,
                };
            }),
        })),
    };

    const projectService = {
        getProject: jest.fn().mockResolvedValue({ organizationUuid }),
        getSpaces: jest.fn().mockResolvedValue(spaces),
    };

    const service = new McpService({
        aiAgentService,
        aiAgentToolsService,
        aiOrganizationSettingsService: {
            getSettings: jest.fn().mockResolvedValue({ aiAgentsVisible: true }),
        },
        aiRouterService: {},
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
        mcpContextModel: {
            getContext: jest.fn().mockResolvedValue({ context }),
        },
        projectModel: {},
        projectService,
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

    return {
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
            { spaceSlug: null, page: 1 },
            extra,
        );
        const text = getTextResult(result);

        expect(text).toContain('contentType="space"');
        expect(text).toContain('name="Allowed Space"');
        expect(text).toContain('slug="allowed-space"');
        expect(text).toContain('chartCount="2"');
        expect(text).not.toContain('Blocked Space');
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
            { spaceSlug: 'allowed-space', page: 1 },
            extra,
        );
        const text = getTextResult(result);

        expect(text).toContain('spaceSlug="allowed-space"');
        expect(text).toContain('name="Revenue Chart"');
        expect(text).toContain('slug="revenue-chart"');
        expect(text).toContain('name="Child Space"');
        expect(text).toContain('slug="allowed-space/child-space"');
    });
});
