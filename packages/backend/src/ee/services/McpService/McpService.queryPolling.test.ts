import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    CatalogType,
    DimensionType,
    FieldType,
    isAndFilterGroup,
    MetricType,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type Account,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { z, type ZodRawShape } from 'zod';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    agentActionTestCases,
    withAgentActionScope,
} from '../../../services/AiAccessService/agentActionTestUtils.mock';
import {
    agentExecutionContext,
    createAgentExecutionContext,
} from '../../../services/AiAccessService/agentExecutionContext';
import { ShareService } from '../../../services/ShareService/ShareService';
import * as runQueryTool from '../ai/tools/runQuery';
import { McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<unknown>;

type ResourceCallback = (
    uri: URL,
    variables: Record<string, string>,
    extra: Record<string, unknown>,
) => Promise<unknown>;
const mockRegisteredMcpResources = new Map<string, ResourceCallback>();

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();
const mockRegisteredMcpToolInputSchemas = new Map<string, ZodRawShape>();

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: () => undefined,
    isEnabled: () => false,
    startSpanManual: (_options: unknown, callback: CallableFunction) =>
        callback({ spanContext: () => ({ spanId: 'span-id' }) }, vi.fn()),
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@modelcontextprotocol/sdk/server/mcp.js')
    >()),
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer() {
            return {
                server: {
                    registerCapabilities: vi.fn(),
                    setRequestHandler: vi.fn(),
                },
                registerResource: vi.fn(
                    (
                        name: string,
                        _template: unknown,
                        _config: unknown,
                        callback: ResourceCallback,
                    ) => {
                        mockRegisteredMcpResources.set(name, callback);
                        return {};
                    },
                ),
                registerPrompt: vi.fn(),
                registerTool: vi.fn(
                    (
                        name: string,
                        config: { inputSchema?: ZodRawShape },
                        callback: RegisteredToolCallback,
                    ) => {
                        mockRegisteredMcpTools.set(name, callback);
                        if (config.inputSchema) {
                            mockRegisteredMcpToolInputSchemas.set(
                                name,
                                config.inputSchema,
                            );
                        }
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
const queryUuid = '11111111-1111-4111-8111-111111111111';
const allowedSpaceUuid = 'allowed-space-uuid';
const blockedSpaceUuid = 'blocked-space-uuid';

const makeSpaceMetadata = (spaceUuid: string) => ({
    uuid: spaceUuid,
    name: spaceUuid === allowedSpaceUuid ? 'Allowed Space' : 'Blocked Space',
    slug: spaceUuid === allowedSpaceUuid ? 'allowed-space' : 'blocked-space',
    breadcrumbs: [
        {
            uuid: spaceUuid,
            name:
                spaceUuid === allowedSpaceUuid
                    ? 'Allowed Space'
                    : 'Blocked Space',
            slug:
                spaceUuid === allowedSpaceUuid
                    ? 'allowed-space'
                    : 'blocked-space',
        },
    ],
});

const account = {
    ...fromSession({ ...defaultSessionUser, userUuid, organizationUuid }),
    organization: { organizationUuid },
    authentication: { type: 'session' },
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

const makeExplore = ({
    name = 'orders',
    tags = [],
    metricTags,
    dimensionTags,
}: {
    name?: string;
    tags?: string[];
    metricTags?: string[];
    dimensionTags?: string[];
} = {}) => {
    const exploreLabel = name === 'orders' ? 'Orders' : 'Payments';

    return {
        name,
        label: exploreLabel,
        tags,
        aiHint: [name === 'orders' ? 'Order facts' : 'Payment facts'],
        baseTable: name,
        joinedTables: [],
        tables: {
            [name]: {
                name,
                label: exploreLabel,
                description: `${exploreLabel} explore`,
                requiredAttributes: {},
                anyAttributes: {},
                dimensions: dimensionTags
                    ? {
                          status: {
                              fieldType: FieldType.DIMENSION,
                              name: 'status',
                              label: 'Status',
                              table: name,
                              tags: dimensionTags,
                              type: DimensionType.STRING,
                          },
                      }
                    : {},
                metrics: {
                    orders_count: {
                        fieldType: FieldType.METRIC,
                        name: 'orders_count',
                        label: 'Orders Count',
                        table: name,
                        tags: metricTags,
                        tablesReferences: [name],
                        type: MetricType.COUNT,
                    },
                },
            },
        },
    };
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
            getAgentPermissionService: () => ({
                isManaged: vi.fn().mockResolvedValue(false),
                assertOperation: vi.fn(),
            }),
        },
    },
};

const makeChartSearchResult = ({
    name,
    spaceUuid,
}: {
    name: string;
    spaceUuid: string;
}) => ({
    uuid: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-uuid`,
    name,
    description: null,
    spaceUuid,
    projectUuid,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    chartType: 'vertical_bar',
    chartSource: 'saved',
    viewsCount: 0,
    firstViewedAt: null,
    lastModified: null,
    createdBy: null,
    lastUpdatedBy: null,
    verification: null,
    search_rank: 1,
});

const makeQueryHistory = (
    status: QueryHistoryStatus,
    context: QueryExecutionContext = QueryExecutionContext.MCP_RUN_SQL,
    error: string | null = null,
    metricQueryOverrides: Record<string, unknown> = {},
) => ({
    status,
    context,
    error,
    compiledSql: 'select * from (select 1) limit 10',
    requestParameters: {
        sql: 'select 1',
        limit: 10,
    },
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: ['orders_orders_count'],
        sorts: [],
        filters: {},
        limit: 10,
        tableCalculations: [],
        additionalMetrics: [],
        ...metricQueryOverrides,
    },
});

const makeMcpService = ({
    context = {
        projectUuid,
        projectName: 'Project',
        agentUuid: null,
        agentName: null,
        tags: null,
    },
    agent = null,
    explores = { orders: makeExplore() },
    dashboardSearchResults = [],
    chartSearchResults = [],
    verifiedContent = [],
    artifactVerifiedContent = [],
    runtimeErrors = {},
    filterExpressionsEnabled = false,
    agentIdentityEnabled = false,
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
    explores?: Record<string, ReturnType<typeof makeExplore>>;
    dashboardSearchResults?: (Record<string, unknown> & {
        spaceUuid: string;
    })[];
    chartSearchResults?: ReturnType<typeof makeChartSearchResult>[];
    verifiedContent?: Record<string, unknown>[];
    artifactVerifiedContent?: Record<string, unknown>[];
    runtimeErrors?: {
        findExplores?: string;
        findFields?: string;
        findFieldsByQuery?: Record<string, string>;
    };
    filterExpressionsEnabled?: boolean;
    agentIdentityEnabled?: boolean;
} = {}) => {
    const aiAccessService = { getMyAccess: vi.fn() };
    const analytics = { track: vi.fn() };
    const asyncQueryService = {
        executeAsyncSqlQuery: vi.fn(),
        executeAsyncMetricQuery: vi.fn(),
        getAsyncQueryHistory: vi.fn(),
        getAsyncQueryResults: vi.fn(),
        getRawAsyncQueryResults: vi.fn(),
        pollQueryHistoryUntilDeadline: vi.fn(),
    };

    const mcpContextModel = {
        getContext: vi.fn().mockResolvedValue({ context }),
    };
    const mcpToolCallModel = {
        createToolCall: vi.fn().mockResolvedValue(undefined),
        findClientInfo: vi.fn().mockResolvedValue(undefined),
    };

    const shareService = {
        createShareUrl: vi.fn().mockResolvedValue({ nanoid: 'share-id' }),
    };

    const projectModel = {
        findExploresFromCache: vi.fn(
            async (
                _projectUuid: string,
                _sortBy: string,
                exploreNames?: string[],
            ) => {
                if (!exploreNames) return explores;
                return Object.fromEntries(
                    Object.entries(explores).filter(([exploreName]) =>
                        exploreNames.includes(exploreName),
                    ),
                );
            },
        ),
    };

    const projectService = {
        getProject: vi.fn().mockResolvedValue({ organizationUuid }),
        searchFieldUniqueValues: vi.fn().mockResolvedValue({ results: [] }),
    };

    const catalogService = {
        searchCatalog: vi.fn(async ({ catalogSearch }) => ({
            data:
                catalogSearch.type === CatalogType.Table
                    ? [
                          {
                              type: CatalogType.Table,
                              name: 'orders',
                              label: 'Orders',
                              description: null,
                              aiHints: null,
                              searchRank: 1,
                              joinedTables: [],
                          },
                      ]
                    : [
                          {
                              type: CatalogType.Field,
                              name: 'orders_count',
                              label: 'Orders Count',
                              tableName: 'orders',
                              fieldType: 'metric',
                              searchRank: 1,
                              description: null,
                          },
                      ],
            pagination: {},
        })),
    };

    const aiAgentService = {
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
        getRelevantVerifiedAnswerContextForAgent: vi.fn().mockResolvedValue({
            relevantVerifiedAnswers: [],
        }),
        getVerifiedSavedArtifactContent: vi
            .fn()
            .mockResolvedValue(artifactVerifiedContent),
    };

    const contentVerificationService = {
        listVerifiedContent: vi.fn().mockResolvedValue(verifiedContent),
    };

    const searchModel = {
        searchDashboards: vi.fn().mockResolvedValue(dashboardSearchResults),
        searchAllCharts: vi.fn().mockResolvedValue(chartSearchResults),
    };

    const spaceService = {
        filterBySpaceAccess: vi.fn(async (_user, content) => content),
    };

    const userAttributesModel = {
        getAttributeValuesForOrgMember: vi.fn().mockResolvedValue({}),
    };

    const makeToolsRuntime = (runtimeContext: {
        tags: string[] | null;
        spaceAccess: string[] | null;
    }) => {
        const listScopedExplores = async () =>
            Object.values(explores).filter(
                (explore) =>
                    !runtimeContext.tags ||
                    runtimeContext.tags.length === 0 ||
                    runtimeContext.tags.some((tag) =>
                        explore.tags.includes(tag),
                    ),
            );

        const toMcpRuntimeResult = async <TData>(
            getData: () => Promise<TData>,
        ) => {
            try {
                return { status: 'success' as const, data: await getData() };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error,
                };
            }
        };

        const runtime = {
            listExplores: vi.fn(listScopedExplores),
            getProjectParameterDefinitions: vi.fn(async () => ({})),
            getVerifiedFieldUsage: vi.fn(async () => new Map<string, number>()),
            getExplore: vi.fn(async ({ table }: { table: string }) => {
                const scopedExplores = await listScopedExplores();
                const explore = scopedExplores.find(
                    (scopedExplore) => scopedExplore.name === table,
                );
                if (!explore) throw new NotFoundError('Explore not found');
                return explore;
            }),
            findExplores: vi.fn(
                async (_args: {
                    fieldSearchSize: number;
                    searchQuery?: string;
                }) => {
                    const scopedExplores = await listScopedExplores();
                    return {
                        exploreSearchResults: scopedExplores.map((explore) => ({
                            name: explore.name,
                            label:
                                (explore as { label?: string }).label ??
                                explore.name,
                            description: null,
                            aiHints: undefined,
                            searchRank: 1,
                            joinedTables: [],
                        })),
                        topMatchingFields: [
                            {
                                name: 'orders_count',
                                label: 'Orders Count',
                                tableName: 'orders',
                                fieldType: 'metric',
                                searchRank: 1,
                                description: null,
                            },
                        ],
                    };
                },
            ),
            findField: vi.fn(
                async (_args: {
                    table: string;
                    fieldSearchQuery: { label: string };
                    page?: number;
                    pageSize?: number;
                    explore: ReturnType<typeof makeExplore>;
                }) => ({ fields: [], pagination: {} }),
            ),
            findContent: vi.fn(async () => ({
                content: [
                    ...dashboardSearchResults.map((dashboard) => ({
                        ...dashboard,
                        contentType: 'dashboard',
                        space: makeSpaceMetadata(dashboard.spaceUuid),
                    })),
                    ...chartSearchResults.map((chart) => ({
                        ...chart,
                        contentType: 'chart',
                        space: makeSpaceMetadata(chart.spaceUuid),
                    })),
                ].filter(
                    ({ spaceUuid }) =>
                        !runtimeContext.spaceAccess ||
                        runtimeContext.spaceAccess.length === 0 ||
                        runtimeContext.spaceAccess.includes(spaceUuid),
                ),
            })),
            searchFieldValues: vi.fn(async (args) => {
                if (args.fieldId === 'orders_hidden') {
                    throw new NotFoundError(`Field not found: ${args.fieldId}`);
                }
                const dimensionFilters = args.filters?.dimensions;
                const andFilters =
                    dimensionFilters && isAndFilterGroup(dimensionFilters)
                        ? dimensionFilters
                        : undefined;
                const { results } =
                    await projectService.searchFieldUniqueValues(
                        account,
                        projectUuid,
                        args.table,
                        args.fieldId,
                        args.query,
                        100,
                        andFilters,
                    );
                return results;
            }),
        };

        return {
            ...runtime,
            getExplore: vi.fn((args: { table: string }) =>
                toMcpRuntimeResult(() => runtime.getExplore(args)),
            ),
            findExplores: vi.fn(
                (args: { fieldSearchSize: number; searchQuery?: string }) =>
                    toMcpRuntimeResult(() => {
                        if (runtimeErrors.findExplores) {
                            throw new Error(runtimeErrors.findExplores);
                        }
                        return runtime.findExplores(args);
                    }),
            ),
            findFields: vi.fn(
                (args: {
                    table: string;
                    fieldSearchQueries: Array<{ label: string }>;
                    page?: number;
                    pageSize?: number;
                    explore: ReturnType<typeof makeExplore>;
                }) =>
                    toMcpRuntimeResult(async () =>
                        Promise.all(
                            args.fieldSearchQueries.map(
                                async (fieldSearchQuery) => {
                                    const fieldSearchError =
                                        runtimeErrors.findFieldsByQuery?.[
                                            fieldSearchQuery.label
                                        ] ?? runtimeErrors.findFields;
                                    if (fieldSearchError) {
                                        return {
                                            status: 'error' as const,
                                            searchQuery: fieldSearchQuery.label,
                                            error: fieldSearchError,
                                        };
                                    }
                                    const result = await runtime.findField({
                                        table: args.table,
                                        fieldSearchQuery,
                                        page: args.page,
                                        pageSize: args.pageSize,
                                        explore: args.explore,
                                    });
                                    return {
                                        status: 'success' as const,
                                        searchQuery: fieldSearchQuery.label,
                                        ...result,
                                    };
                                },
                            ),
                        ),
                    ),
            ),
        };
    };
    const aiAgentToolsService = {
        createRuntime: vi.fn((runtimeContext) =>
            makeToolsRuntime(runtimeContext),
        ),
    };

    const service = new McpService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiAccessService,
        aiAgentService,
        aiAgentToolsService,
        aiOrganizationSettingsService: {
            isMcpAgentsEnabled: vi.fn().mockResolvedValue(true),
        },
        aiRouterService: {},
        aiWritebackService: {},
        analytics,
        asyncQueryService,
        catalogService,
        contentService: {},
        contentVerificationService,
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
        projectModel,
        projectService,
        searchModel,
        shareService,
        spaceService,
        userAttributesModel,
    } as unknown as ConstructorParameters<typeof McpService>[0]);

    // The constructor registers handlers fail-closed (run_sql off), so
    // re-register here with run_sql enabled — these tests exercise the tool.
    mockRegisteredMcpResources.clear();
    mockRegisteredMcpTools.clear();
    mockRegisteredMcpToolInputSchemas.clear();
    service.setupHandlers(
        makeMcpServerOptions({
            runSqlEnabled: true,
            runMetricQueryEnabled: true,
            filterExpressionsEnabled,
            agentIdentityEnabled,
        }),
    );

    return {
        aiAccessService,
        analytics,
        aiAgentService,
        aiAgentToolsService,
        asyncQueryService,
        catalogService,
        contentVerificationService,
        mcpContextModel,
        mcpToolCallModel,
        projectModel,
        projectService,
        searchModel,
        service,
        shareService,
        spaceService,
    };
};

const getToolCallback = (toolName: McpToolName) => {
    const callback = mockRegisteredMcpTools.get(toolName);
    if (!callback) {
        throw new Error(`Tool ${toolName} was not registered`);
    }
    return (
        args: Record<string, unknown>,
        callbackExtra: Record<string, unknown>,
    ) => {
        const authenticated = (callbackExtra as typeof extra).authInfo.extra
            .account as unknown as Account;
        return agentExecutionContext.getStore()
            ? callback({ projectUuid, ...args }, callbackExtra)
            : agentExecutionContext.run(
                  createAgentExecutionContext({
                      account: authenticated,
                      surface: AgentActorSurface.MCP,
                      clientId: null,
                      agentUuid: null,
                      agentIdentityEnabled: true,
                  }),
                  () => callback({ projectUuid, ...args }, callbackExtra),
              );
    };
};

const getParsedToolCallback = (toolName: McpToolName) => {
    const callback = mockRegisteredMcpTools.get(toolName);
    if (!callback) {
        throw new Error(`Tool ${toolName} was not registered`);
    }
    const inputSchema = mockRegisteredMcpToolInputSchemas.get(toolName);
    if (!inputSchema) {
        throw new Error(`Tool ${toolName} does not have an input schema`);
    }
    const schema = z.object(inputSchema);

    return (
        args: Record<string, unknown>,
        callbackExtra: Record<string, unknown>,
    ) => {
        const parsedArgs = schema.parse({
            projectUuid: queryUuid,
            ...args,
        });
        return callback({ ...parsedArgs, projectUuid }, callbackExtra);
    };
};

const getTextResult = (result: unknown) => {
    const response = result as { content?: Array<{ text?: string }> };
    return response.content?.[0]?.text ?? '';
};

const parseTextResult = (result: unknown) =>
    JSON.parse(getTextResult(result) || '{}') as Record<string, unknown>;

describe('MCP catalogue audit', () => {
    it.each([undefined, projectUuid])(
        'preserves flat catalogue metadata for pinnedProjectUuid=%s',
        async (pinnedProjectUuid) => {
            const { service, mcpToolCallModel } = makeMcpService();
            service.recordToolList({
                catalogue: makeMcpServerOptions(
                    { runSqlEnabled: true, filterExpressionsEnabled: true },
                    pinnedProjectUuid,
                ),
                authInfo: {
                    token: 'test-token',
                    clientId: 'test-client',
                    scopes: [],
                    extra: {
                        ...extra.authInfo.extra,
                        headerProjectUuid: pinnedProjectUuid,
                    },
                },
                durationMs: 1,
            });
            await vi.waitFor(() => {
                expect(mcpToolCallModel.createToolCall).toHaveBeenCalledWith(
                    expect.objectContaining({
                        tool_name: 'tools/list',
                        direction: 'inbound',
                        ai_mcp_server_uuid: null,
                        result_metadata: {
                            catalogue: {
                                projectPinned: pinnedProjectUuid !== undefined,
                                mcpContentWritesEnabled: true,
                                scheduledDeliveryEnabled: true,
                                runSqlEnabled: true,
                                runMetricQueryEnabled: false,
                                filterExpressionsEnabled: true,
                                documentsEnabled: false,
                                dataAppBuildsEnabled: false,
                                agentIdentityEnabled: false,
                            },
                        },
                    }),
                );
            });
        },
    );
});

const expectPollingInstructions = (result: unknown) => {
    const {
        content: [{ text }],
    } = z
        .object({
            content: z.tuple([
                z.object({ type: z.literal('text'), text: z.string() }),
            ]),
        })
        .parse(result);
    expect(text).toContain(
        `Wait 1000 ms, then call get_query_result with queryUuid: ${queryUuid}`,
    );
    expect(text).toContain('Do not resubmit the original query.');
    expect(text).toContain(
        'If a polling request times out or its connection fails, retry get_query_result with the same queryUuid.',
    );
    expect(text).toContain('not the MCP wait window');
};

describe('MCP async query polling', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.clear();
        mockRegisteredMcpToolInputSchemas.clear();
        vi.spyOn(
            McpService as unknown as { getMcpQueryWaitMs: () => number },
            'getMcpQueryWaitMs',
        ).mockReturnValue(0);
        vi.spyOn(runQueryTool, 'validateRunQueryTool').mockImplementation(
            () => {},
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns running with heartbeatAt from run_sql', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.executeAsyncSqlQuery.mockResolvedValue({ queryUuid });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(QueryHistoryStatus.QUEUED),
        );

        const result = await getToolCallback(McpToolName.RUN_SQL)(
            { sql: 'select 1', limit: 10 },
            extra,
        );

        expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                sql: 'select 1',
                limit: 10,
                context: QueryExecutionContext.MCP_RUN_SQL,
            }),
        );
        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'running',
                    queryUuid,
                    nextPollAfterMs: 1000,
                    heartbeatAt: expect.any(String),
                },
            },
        });
        expectPollingInstructions(result);
    });

    it('returns sqlRunnerUrl from a completed run_sql result', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.executeAsyncSqlQuery.mockResolvedValue({ queryUuid });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(QueryHistoryStatus.READY),
        );
        asyncQueryService.getAsyncQueryResults.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [{ one: { value: { raw: 1, formatted: '1' } } }],
            columns: { one: { reference: 'one' } },
        });

        const result = await getToolCallback(McpToolName.RUN_SQL)(
            { sql: 'select 1', limit: 10 },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'done',
                    rows: [{ one: 1 }],
                    columns: ['one'],
                    rowCount: 1,
                    sqlRunnerUrl:
                        'https://lightdash.example/projects/project-uuid/sql-runner?share=share-id',
                },
            },
        });
    });

    it('rejects inaccessible header project overrides', async () => {
        const { projectService } = makeMcpService();
        const deniedUser = {
            ...user,
            ability: {
                ...user.ability,
                relevantRuleFor: vi.fn(() => ({ inverted: true })),
            },
        };
        const headerProjectUuid = '22222222-2222-4222-8222-222222222222';

        await expect(
            getToolCallback(McpToolName.RUN_SQL)(
                { sql: 'select 1', limit: 10, projectUuid: headerProjectUuid },
                {
                    ...extra,
                    authInfo: {
                        extra: {
                            ...extra.authInfo.extra,
                            user: deniedUser,
                            headerProjectUuid,
                        },
                    },
                },
            ),
        ).rejects.toThrow('You do not have access to this project');
        expect(projectService.getProject).toHaveBeenCalledWith(
            headerProjectUuid,
            account,
        );
    });

    it('returns active agent space access in get_current_agent', async () => {
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
                tags: ['ai'],
                spaceAccess: ['space-uuid'],
            },
        });

        const result = await getToolCallback(McpToolName.GET_CURRENT_AGENT)(
            {},
            extra,
        );

        expect(parseTextResult(result)).toMatchObject({
            agentUuid: 'agent-uuid',
            agentTags: ['ai'],
            agentSpaceAccess: ['space-uuid'],
        });
    });

    it('registers grep_fields', async () => {
        makeMcpService();

        const result = await getToolCallback(McpToolName.GREP_FIELDS)(
            {
                patterns: ['orders count'],
                exploreName: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            content: [
                expect.objectContaining({
                    text: expect.stringContaining('"patterns"'),
                }),
            ],
            structuredContent: {
                exploreName: null,
                patterns: [
                    expect.objectContaining({
                        pattern: 'orders count',
                        status: 'matches',
                        resultsByExplore: [
                            expect.objectContaining({
                                exploreName: 'orders',
                            }),
                        ],
                    }),
                ],
            },
        });
    });

    it('returns structured metadata content', async () => {
        makeMcpService();

        const result = await getToolCallback(McpToolName.GET_METADATA)(
            {
                requests: [
                    { type: 'explore', exploreIds: ['orders'] },
                    {
                        type: 'field',
                        fields: [
                            {
                                exploreId: 'orders',
                                fieldId: 'orders_orders_count',
                            },
                        ],
                    },
                ],
            },
            extra,
        );

        expect(result).toMatchObject({
            content: [
                expect.objectContaining({
                    text: expect.stringContaining('"explores"'),
                }),
            ],
            structuredContent: {
                explores: [
                    expect.objectContaining({
                        exploreId: 'orders',
                        status: 'found',
                        baseTable: 'orders',
                    }),
                ],
                fields: [
                    expect.objectContaining({
                        exploreId: 'orders',
                        fieldId: 'orders_orders_count',
                        status: 'found',
                        kind: 'metric',
                    }),
                ],
            },
        });
    });

    it('lists only explores available to the explicit agent in grep_fields', async () => {
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
                tags: ['ai'],
                spaceAccess: [],
            },
            explores: {
                orders: makeExplore({ tags: ['ai'] }),
                payments: makeExplore({ name: 'payments', tags: ['finance'] }),
            },
        });

        const result = await getToolCallback(McpToolName.GREP_FIELDS)(
            {
                patterns: ['orders count'],
                exploreName: null,
                agentUuid: 'agent-uuid',
            },
            extra,
        );

        expect(JSON.stringify(result)).toContain('orders');
        expect(JSON.stringify(result)).not.toContain('payments');
    });

    it('filters content by explicit agent space access', async () => {
        const allowedChart = makeChartSearchResult({
            name: 'Allowed Chart',
            spaceUuid: allowedSpaceUuid,
        });
        const blockedChart = makeChartSearchResult({
            name: 'Blocked Chart',
            spaceUuid: blockedSpaceUuid,
        });
        const allowedVerifiedContent = {
            contentType: 'chart',
            contentUuid: 'allowed-chart-uuid',
            name: 'Allowed Verified Chart',
            spaceUuid: allowedSpaceUuid,
        };
        const blockedVerifiedContent = {
            contentType: 'chart',
            contentUuid: 'blocked-chart-uuid',
            name: 'Blocked Verified Chart',
            spaceUuid: blockedSpaceUuid,
        };

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
            chartSearchResults: [allowedChart, blockedChart],
            verifiedContent: [allowedVerifiedContent, blockedVerifiedContent],
        });

        const contentResult = await getToolCallback(McpToolName.FIND_CONTENT)(
            {
                searchQueries: [{ label: 'chart' }],
                agentUuid: 'agent-uuid',
            },
            extra,
        );
        const contentText = getTextResult(contentResult);

        expect(contentText).toContain('Allowed Chart');
        expect(contentText).not.toContain('Blocked Chart');

        const verifiedResult = await getToolCallback(
            McpToolName.LIST_VERIFIED_CONTENT,
        )({ agentUuid: 'agent-uuid' }, extra);
        const verifiedContentResult = JSON.parse(getTextResult(verifiedResult));

        expect(verifiedContentResult).toEqual([allowedVerifiedContent]);
    });

    it('merges AI-verified saved artifacts into list_verified_content without duplicates', async () => {
        const spaceUuid = 'space-uuid';
        const verifiedChart = {
            contentType: 'chart',
            contentUuid: 'chart-uuid',
            name: 'Verified Chart',
            spaceUuid,
        };
        const artifactOnlyChart = {
            contentType: 'chart',
            contentUuid: 'artifact-chart-uuid',
            name: 'AI Verified Chart',
            spaceUuid,
        };
        const artifactDuplicateOfVerifiedChart = {
            ...verifiedChart,
            name: 'AI duplicate of Verified Chart',
        };

        makeMcpService({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: null,
                agentName: null,
                tags: null,
            },
            verifiedContent: [verifiedChart],
            artifactVerifiedContent: [
                artifactOnlyChart,
                artifactDuplicateOfVerifiedChart,
            ],
        });

        const verifiedResult = await getToolCallback(
            McpToolName.LIST_VERIFIED_CONTENT,
        )({}, extra);
        const verifiedContentResult = JSON.parse(getTextResult(verifiedResult));

        expect(verifiedContentResult).toEqual([
            verifiedChart,
            artifactOnlyChart,
        ]);
    });

    it('resolves run_metric_query filter expressions before execution', async () => {
        const { asyncQueryService, analytics } = makeMcpService({
            filterExpressionsEnabled: true,
        });
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid,
        });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.QUEUED,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );

        const result = await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: {
                        dimensions: null,
                        metrics: 'orders_orders_count greaterThan=1',
                        tableCalculations: null,
                    },
                },
                chartConfig: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: { status: 'running', queryUuid },
            },
        });
        await vi.waitFor(() => {
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'mcp_tool_call',
                    properties: expect.objectContaining({
                        queryId: queryUuid,
                        actorType: 'user',
                        status: 'success',
                    }),
                }),
            );
        });
        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                metricQuery: expect.objectContaining({
                    filters: expect.objectContaining({
                        metrics: expect.objectContaining({
                            and: [
                                expect.objectContaining({
                                    target: expect.objectContaining({
                                        fieldId: 'orders_orders_count',
                                    }),
                                    values: [1],
                                }),
                            ],
                        }),
                    }),
                }),
            }),
        );
    });

    it('tracks located filter-expression failures without executing or capturing Sentry', async () => {
        vi.mocked(Sentry.captureException).mockClear();
        const { asyncQueryService, mcpToolCallModel, analytics } =
            makeMcpService({
                filterExpressionsEnabled: true,
            });

        const result = await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: {
                        dimensions: null,
                        metrics: 'unknown_metric greaterThan=1',
                        tableCalculations: null,
                    },
                },
                chartConfig: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: expect.stringContaining(
                        '[FILTER_EXPRESSION_UNKNOWN_FIELD]',
                    ),
                },
            ],
        });
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).not.toHaveBeenCalled();
        expect(Sentry.captureException).not.toHaveBeenCalled();
        await vi.waitFor(() => {
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'mcp_tool_call',
                    properties: expect.objectContaining({
                        toolCallId: expect.stringMatching(/^[a-f0-9-]{36}$/),
                        actorType: 'user',
                        status: 'error',
                        toolName: McpToolName.RUN_METRIC_QUERY,
                    }),
                }),
            );
            expect(mcpToolCallModel.createToolCall).toHaveBeenCalledWith(
                expect.objectContaining({
                    tool_name: McpToolName.RUN_METRIC_QUERY,
                    status: 'error',
                    error_message: expect.stringContaining(
                        '[FILTER_EXPRESSION_UNKNOWN_FIELD]',
                    ),
                }),
            );
        });
    });

    it('uses explicit agent tags for run_metric_query', async () => {
        const { asyncQueryService } = makeMcpService({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: 'agent-uuid',
                agentName: 'Agent',
                tags: ['manual-tag'],
            },
            agent: {
                uuid: 'agent-uuid',
                name: 'Agent',
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['agent-tag'] }) },
        });
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid,
        });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.QUEUED,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );

        await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                agentUuid: 'agent-uuid',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
            },
            extra,
        );

        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalled();
    });

    it('does not fall back to manual tags with an explicit agent', async () => {
        const { asyncQueryService } = makeMcpService({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: 'agent-uuid',
                agentName: 'Agent',
                tags: ['manual-tag'],
            },
            agent: {
                uuid: 'agent-uuid',
                name: 'Agent',
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['manual-tag'] }) },
        });

        const result = await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                agentUuid: 'agent-uuid',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: 'Error running metric query: Explore not found',
                },
            ],
        });
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).not.toHaveBeenCalled();
    });

    it('ignores stored agent scope for header project overrides', async () => {
        const headerProjectUuid = '22222222-2222-4222-8222-222222222222';
        const { aiAgentService, asyncQueryService } = makeMcpService({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: 'agent-uuid',
                agentName: 'Agent',
                tags: ['manual-tag'],
            },
            agent: {
                uuid: 'agent-uuid',
                name: 'Agent',
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore() },
        });
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid,
        });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.QUEUED,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );

        await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
                projectUuid: headerProjectUuid,
            },
            {
                ...extra,
                authInfo: {
                    extra: {
                        ...extra.authInfo.extra,
                        headerProjectUuid,
                    },
                },
            },
        );

        expect(aiAgentService.getAgent).not.toHaveBeenCalled();
        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({ projectUuid: headerProjectUuid }),
        );
    });

    it('returns running with heartbeatAt from run_metric_query', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid,
        });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.QUEUED,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );
        const result = await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'running',
                    queryUuid,
                    nextPollAfterMs: 1000,
                    heartbeatAt: expect.any(String),
                },
            },
        });
        expectPollingInstructions(result);
    });

    it('returns exploreUrl from a completed run_metric_query result', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.executeAsyncMetricQuery.mockResolvedValue({
            queryUuid,
        });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );
        asyncQueryService.getRawAsyncQueryResults.mockResolvedValue({
            rows: [{ orders_count: 1 }],
            fields: {},
        });
        const result = await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
            {
                title: 'Orders',
                description: 'Orders count',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'done',
                    queryUuid,
                    rows: [{ orders_count: 1 }],
                    fields: {},
                    exploreUrl: 'https://lightdash.example/share/share-id',
                },
            },
        });
    });

    it('renders a chart for completed query results', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );
        asyncQueryService.getRawAsyncQueryResults.mockResolvedValue({
            rows: [{ orders_count: 1 }],
            fields: {},
        });
        const result = await getToolCallback(McpToolName.RENDER_CHART)(
            {
                queryUuid,
                title: 'Orders',
                description: 'Orders count',
                chartConfig: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'done',
                    queryUuid,
                    echartsOption: null,
                    exploreUrl: 'https://lightdash.example/share/share-id',
                },
            },
            _meta: {
                result: {
                    rows: [{ orders_count: 1 }],
                    fields: {},
                    echartsOption: null,
                    exploreUrl: 'https://lightdash.example/share/share-id',
                },
            },
        });
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).not.toHaveBeenCalled();
    });

    it('carries the OAuth client id as the MCP result reader identity', async () => {
        const { asyncQueryService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        const ready = makeQueryHistory(
            QueryHistoryStatus.READY,
            QueryExecutionContext.MCP_RUN_METRIC_QUERY,
        );
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(ready);
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            ready,
        );
        asyncQueryService.getRawAsyncQueryResults.mockResolvedValue({
            rows: [],
            fields: {},
        });
        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid },
            {
                ...extra,
                authInfo: {
                    ...extra.authInfo,
                    extra: {
                        ...extra.authInfo.extra,
                        account: {
                            ...account,
                            authentication: {
                                type: 'oauth',
                                clientId: 'oauth-agent-client',
                            },
                        },
                    },
                },
            },
        );
        expect(result).not.toMatchObject({ isError: true });
        for (const method of [
            'getAsyncQueryHistory',
            'getRawAsyncQueryResults',
        ] as const)
            expect(asyncQueryService[method]).toHaveBeenCalledWith(
                expect.objectContaining({
                    reader: {
                        authMethod: 'oauth',
                        kind: 'agent',
                        claim: expect.objectContaining({
                            subject: { type: 'user', uuid: userUuid },
                            act: {
                                sub: 'mcp:oauth-agent-client',
                                surface: AgentActorSurface.MCP,
                                client_id: 'oauth-agent-client',
                                agent_uuid: null,
                            },
                        }),
                    },
                }),
            );
    });

    it.each(['getAsyncQueryHistory', 'getRawAsyncQueryResults'] as const)(
        'PAT-backed MCP forwards its session identity through %s',
        async (method) => {
            const { asyncQueryService } = makeMcpService({
                agentIdentityEnabled: true,
            });
            const ready = makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            );
            asyncQueryService.getAsyncQueryHistory.mockResolvedValue(ready);
            asyncQueryService.getRawAsyncQueryResults.mockResolvedValue({
                rows: [{ one: 1 }],
                fields: {},
            });
            asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
                ready,
            );
            asyncQueryService[method].mockImplementation(async ({ reader }) => {
                expect(reader).toMatchObject({
                    authMethod: 'pat',
                    kind: 'agent',
                    claim: { act: { client_id: null } },
                });
                return method === 'getAsyncQueryHistory'
                    ? ready
                    : {
                          rows: [{ one: 1 }],
                          fields: {},
                      };
            });
            const patExtra = {
                ...extra,
                authInfo: {
                    ...extra.authInfo,
                    extra: {
                        ...extra.authInfo.extra,
                        account: {
                            ...account,
                            authentication: {
                                type: 'pat',
                                source: 'dummy-pat',
                            },
                        },
                    },
                },
            };
            const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
                { queryUuid },
                patExtra,
            );
            expect(result).not.toMatchObject({ isError: true });
            expect(asyncQueryService[method]).toHaveBeenCalled();
            expect(
                asyncQueryService.getAsyncQueryResults,
            ).not.toHaveBeenCalled();
            expect(
                asyncQueryService.getRawAsyncQueryResults,
            ).toHaveBeenCalled();
        },
    );

    it('keeps get_query_result running without fetching result pages', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.getAsyncQueryHistory.mockResolvedValueOnce(
            makeQueryHistory(QueryHistoryStatus.QUEUED),
        );
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(QueryHistoryStatus.QUEUED),
        );

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'running',
                    queryUuid,
                    nextPollAfterMs: 1000,
                    heartbeatAt: expect.any(String),
                },
            },
        });
        expect(asyncQueryService.getAsyncQueryResults).not.toHaveBeenCalled();
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
        expect(asyncQueryService.executeAsyncSqlQuery).not.toHaveBeenCalled();
        expect(
            asyncQueryService.executeAsyncMetricQuery,
        ).not.toHaveBeenCalled();
        expectPollingInstructions(result);
    });

    it('returns final SQL rows with the original limit when get_query_result sees readiness during its wait', async () => {
        const { asyncQueryService, shareService } = makeMcpService();
        const queryHistory = {
            ...makeQueryHistory(QueryHistoryStatus.QUEUED),
            requestParameters: {
                sql: 'select 1',
                limit: 50_000,
            },
        };
        asyncQueryService.getAsyncQueryHistory.mockResolvedValueOnce(
            queryHistory,
        );
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue({
            ...queryHistory,
            status: QueryHistoryStatus.READY,
        });
        asyncQueryService.getAsyncQueryResults.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [{ one: { value: { raw: 1, formatted: '1' } } }],
            columns: { one: { reference: 'one' } },
        });

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'done',
                    queryUuid,
                    rows: [{ one: 1 }],
                    columns: ['one'],
                    rowCount: 1,
                    sqlRunnerUrl:
                        'https://lightdash.example/projects/project-uuid/sql-runner?share=share-id',
                },
            },
        });
        expect(asyncQueryService.getAsyncQueryResults).toHaveBeenCalledWith(
            expect.objectContaining({
                queryUuid,
                page: 1,
                pageSize: 50_000,
                aiAccessOnly: true,
            }),
        );
        expect(shareService.createShareUrl).toHaveBeenCalledWith(
            user,
            '/projects/project-uuid/sql-runner',
            expect.stringContaining('"sql":"select 1"'),
        );
    });

    it('does not return metric results outside the explicit agent scope', async () => {
        const { asyncQueryService } = makeMcpService({
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
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['other-tag'] }) },
        });
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid, agentUuid: 'agent-uuid' },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: 'Error getting query result: Explore not found',
                },
            ],
        });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
    });

    it('does not render metric results outside the explicit agent scope', async () => {
        const { asyncQueryService } = makeMcpService({
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
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['other-tag'] }) },
        });
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );

        const result = await getToolCallback(McpToolName.RENDER_CHART)(
            {
                queryUuid,
                title: 'Orders',
                description: 'Orders count',
                chartConfig: null,
                agentUuid: 'agent-uuid',
            },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: 'Error rendering chart: Explore not found',
                },
            ],
        });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
    });

    it('does not return metric results sorted by a hidden field', async () => {
        const { asyncQueryService } = makeMcpService({
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
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['agent-tag'] }) },
        });
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                null,
                { sorts: [{ fieldId: 'orders_hidden_sort' }] },
            ),
        );

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid, agentUuid: 'agent-uuid' },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: 'Error getting query result: Field not found: orders_hidden_sort',
                },
            ],
        });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
    });

    it('does not return metric results filtered by a hidden field', async () => {
        const { asyncQueryService } = makeMcpService({
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
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['agent-tag'] }) },
        });
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                null,
                {
                    filters: {
                        dimensions: {
                            and: [
                                {
                                    id: 'filter-1',
                                    target: {
                                        fieldId: 'orders_hidden_filter',
                                    },
                                    operator: 'equals',
                                    values: ['complete'],
                                },
                            ],
                        },
                    },
                },
            ),
        );

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid, agentUuid: 'agent-uuid' },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: 'Error getting query result: Field not found: orders_hidden_filter',
                },
            ],
        });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
    });

    it('allows additional metric refs using dot notation', async () => {
        const { asyncQueryService } = makeMcpService({
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
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: {
                orders: makeExplore({
                    tags: ['agent-tag'],
                    metricTags: ['agent-tag'],
                    dimensionTags: ['agent-tag'],
                }),
            },
        });
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                null,
                {
                    metrics: ['orders_custom_distinct'],
                    additionalMetrics: [
                        {
                            table: 'orders',
                            name: 'custom_distinct',
                            type: MetricType.COUNT_DISTINCT,
                            sql: '${TABLE}.custom_distinct',
                            distinctKeys: ['orders.status'],
                            filters: [
                                {
                                    id: 'filter-1',
                                    target: { fieldRef: 'orders.status' },
                                    operator: 'equals',
                                    values: ['complete'],
                                },
                            ],
                        },
                    ],
                },
            ),
        );
        asyncQueryService.getRawAsyncQueryResults.mockResolvedValue({
            rows: [{ orders_custom_distinct: 1 }],
            fields: {},
        });

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid, agentUuid: 'agent-uuid' },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'done',
                    queryUuid,
                    rows: [{ orders_custom_distinct: 1 }],
                },
            },
        });
        expect(asyncQueryService.getRawAsyncQueryResults).toHaveBeenCalled();
    });

    it('does not search field values outside the explicit agent scope', async () => {
        const { projectService } = makeMcpService({
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
                tags: ['agent-tag'],
                spaceAccess: [],
            },
            explores: { orders: makeExplore({ tags: ['agent-tag'] }) },
        });

        const result = await getToolCallback(McpToolName.SEARCH_FIELD_VALUES)(
            {
                table: 'orders',
                fieldId: 'orders_hidden',
                query: null,
                filters: null,
                agentUuid: 'agent-uuid',
            },
            extra,
        );

        expect(result).toMatchObject({
            content: expect.arrayContaining([
                {
                    type: 'text',
                    text: expect.stringContaining(
                        'Field not found: orders_hidden',
                    ),
                },
            ]),
        });
        expect(projectService.searchFieldUniqueValues).not.toHaveBeenCalled();
    });

    it('normalizes omitted expression search arguments before execution', async () => {
        const { projectService } = makeMcpService({
            explores: {
                orders: makeExplore({ dimensionTags: [] }),
            },
            filterExpressionsEnabled: true,
        });

        const result = await getParsedToolCallback(
            McpToolName.SEARCH_FIELD_VALUES,
        )(
            {
                table: 'orders',
                fieldId: 'orders_status',
            },
            extra,
        );

        expect(getTextResult(result)).toContain('[]');
        expect(projectService.searchFieldUniqueValues).toHaveBeenCalledWith(
            account,
            projectUuid,
            'orders',
            'orders_status',
            '',
            100,
            undefined,
        );
    });

    it('resolves MCP field-value filter expressions before searching', async () => {
        const { projectService } = makeMcpService({
            explores: {
                orders: makeExplore({ dimensionTags: [] }),
            },
            filterExpressionsEnabled: true,
        });

        const result = await getParsedToolCallback(
            McpToolName.SEARCH_FIELD_VALUES,
        )(
            {
                table: 'orders',
                fieldId: 'orders_status',
                query: 'complete',
                filters: 'orders_status equals=completed',
            },
            extra,
        );

        expect(getTextResult(result)).toContain('[]');
        expect(projectService.searchFieldUniqueValues).toHaveBeenCalledWith(
            account,
            projectUuid,
            'orders',
            'orders_status',
            'complete',
            100,
            expect.objectContaining({
                and: [
                    expect.objectContaining({
                        target: expect.objectContaining({
                            fieldId: 'orders_status',
                        }),
                        values: ['completed'],
                    }),
                ],
            }),
        );
    });

    it('returns typed MCP field-value expression errors without searching', async () => {
        const { projectService } = makeMcpService({
            explores: {
                orders: makeExplore({ dimensionTags: [] }),
            },
            filterExpressionsEnabled: true,
        });
        vi.mocked(Sentry.captureException).mockClear();

        const result = await getParsedToolCallback(
            McpToolName.SEARCH_FIELD_VALUES,
        )(
            {
                table: 'orders',
                fieldId: 'orders_status',
                query: 'complete',
                filters:
                    'orders_status equals=completed OR orders_status equals=shipped',
            },
            extra,
        );

        expect(getTextResult(result)).toContain(
            '[FILTER_EXPRESSION_SEARCH_FIELD_VALUES_OR]',
        );
        expect(projectService.searchFieldUniqueValues).not.toHaveBeenCalled();
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('returns final metric rows when get_query_result sees readiness during its wait', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.getAsyncQueryHistory.mockResolvedValueOnce(
            makeQueryHistory(
                QueryHistoryStatus.QUEUED,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );
        asyncQueryService.getRawAsyncQueryResults.mockResolvedValue({
            rows: [{ orders_count: 1 }],
            fields: {},
        });

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid },
            extra,
        );

        expect(result).toMatchObject({
            content: [
                {
                    type: 'text',
                    text: 'orders_count\n1\n',
                },
                {
                    type: 'text',
                    text: `queryUuid: ${queryUuid}`,
                },
            ],
            structuredContent: {
                result: {
                    status: 'done',
                    queryUuid,
                    rows: [{ orders_count: 1 }],
                    fields: {},
                    exploreUrl: 'https://lightdash.example/share/share-id',
                },
            },
        });
        expect(asyncQueryService.getAsyncQueryResults).not.toHaveBeenCalled();
    });

    it('returns terminal errors from get_query_result without waiting', async () => {
        const { asyncQueryService } = makeMcpService();
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.ERROR,
                QueryExecutionContext.MCP_RUN_SQL,
                'Warehouse timed out',
            ),
        );

        const result = await getToolCallback(McpToolName.GET_QUERY_RESULT)(
            { queryUuid },
            extra,
        );

        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    status: 'error',
                    queryUuid,
                    error: 'Warehouse timed out',
                },
            },
        });
        expect(JSON.stringify(result)).not.toContain('retry get_query_result');
        expect(JSON.stringify(result)).not.toContain('Wait 1000 ms');
        expect(asyncQueryService.getAsyncQueryHistory).toHaveBeenCalledTimes(1);
        expect(
            asyncQueryService.pollQueryHistoryUntilDeadline,
        ).not.toHaveBeenCalled();
        expect(asyncQueryService.getAsyncQueryResults).not.toHaveBeenCalled();
    });
});

it('returns an AI access refusal as an MCP tool error', async () => {
    const { asyncQueryService } = makeMcpService();
    const error = new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN);
    vi.mocked(asyncQueryService.executeAsyncMetricQuery).mockRejectedValue(
        error,
    );
    const result = await getToolCallback(McpToolName.RUN_METRIC_QUERY)(
        {
            title: 'Orders',
            description: 'Orders count',
            queryConfig: {
                exploreName: 'orders',
                dimensions: [],
                metrics: ['orders_orders_count'],
                sorts: [],
                limit: 10,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
            chartConfig: null,
        },
        extra,
    );
    expect(result).toMatchObject({
        isError: true,
        content: [
            {
                type: 'text',
                text: 'Error running metric query: Connect your agent to the warehouse once so it can run as you.',
            },
        ],
    });
});

describe('agent connection over MCP', () => {
    describe.each([
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
        AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID,
    ])('admin settings for %s', (reason) => {
        const settingsPath = `/generalSettings/projectManagement/${projectUuid}/agentIdentity`;
        const settingsUrl = `https://lightdash.example${settingsPath}`;
        const identityRefusal = new AiAccessRefusedError(reason);

        it.each([
            McpToolName.RUN_METRIC_QUERY,
            McpToolName.RUN_SQL,
            McpToolName.GET_QUERY_RESULT,
            McpToolName.RENDER_CHART,
            McpToolName.SEARCH_FIELD_VALUES,
        ])(
            'preserves the typed refusal and settings URL in %s',
            async (name) => {
                const { asyncQueryService, projectService } = makeMcpService({
                    agentIdentityEnabled: true,
                });
                asyncQueryService.executeAsyncMetricQuery.mockRejectedValue(
                    identityRefusal,
                );
                asyncQueryService.executeAsyncSqlQuery.mockRejectedValue(
                    identityRefusal,
                );
                asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
                    makeQueryHistory(
                        QueryHistoryStatus.READY,
                        QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                    ),
                );
                asyncQueryService.getRawAsyncQueryResults.mockRejectedValue(
                    identityRefusal,
                );
                projectService.searchFieldUniqueValues.mockRejectedValue(
                    identityRefusal,
                );
                const result = await getToolCallback(name)(
                    {
                        projectUuid,
                        queryUuid,
                        sql: 'select 1',
                        table: 'orders',
                        fieldId: 'orders_status',
                        query: 'complete',
                        filters: null,
                        title: 'Orders',
                        description: 'Orders count',
                        queryConfig: {
                            exploreName: 'orders',
                            dimensions: [],
                            metrics: ['orders_orders_count'],
                            sorts: [],
                            limit: 10,
                            customMetrics: null,
                            tableCalculations: null,
                            filters: null,
                        },
                        chartConfig: null,
                    },
                    extra,
                );
                expect(result).toMatchObject({
                    isError: true,
                    structuredContent: {
                        refusal: { ...identityRefusal.refusal, settingsUrl },
                    },
                    content: [
                        {
                            type: 'text',
                            text: expect.stringContaining(
                                identityRefusal.message,
                            ),
                        },
                    ],
                });
                expect(result).toMatchObject({
                    content: [
                        {
                            type: 'text',
                            text: expect.stringContaining(settingsUrl),
                        },
                    ],
                });
            },
        );

        it.each([null, settingsPath, settingsUrl])(
            'includes the admin link from %s in connect_agent',
            async (url) => {
                const { aiAccessService } = makeMcpService({
                    agentIdentityEnabled: true,
                });
                aiAccessService.getMyAccess.mockResolvedValue({
                    requirementSource: 'organization',
                    identity: 'ai_service_account',
                    refusal: { ...identityRefusal.refusal, settingsUrl: url },
                });
                const result = await getToolCallback(McpToolName.CONNECT_AGENT)(
                    { projectUuid },
                    extra,
                );
                expect(result).toMatchObject({
                    structuredContent: {
                        status: 'unavailable',
                        connectUrl: null,
                        settingsUrl,
                    },
                    content: [
                        {
                            type: 'text',
                            text: expect.stringContaining(settingsUrl),
                        },
                    ],
                });
            },
        );
    });

    const connectUrl =
        'https://lightdash.example/agent/connect?project=project-uuid&redirect=%2Fagent-connected&entryPoint=mcp_connect_link';
    const refusal = new AiAccessRefusedError(
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        { connectUrl },
    );

    it('gates the tool and resource per request', () => {
        for (const enabled of [true, false, true]) {
            makeMcpService({ agentIdentityEnabled: enabled });
            expect(mockRegisteredMcpTools.has(McpToolName.CONNECT_AGENT)).toBe(
                enabled,
            );
            expect(mockRegisteredMcpResources.has('agent-status')).toBe(
                enabled,
            );
        }
    });

    it.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.SIGN_IN_EXPIRED,
    ])(
        'returns %s from the tool and resource, then reports connected with expiry',
        async (reason) => {
            const statusUrl = new URL(connectUrl);
            statusUrl.searchParams.set('entryPoint', 'unknown');
            const signInRefusal = new AiAccessRefusedError(reason, {
                connectUrl: statusUrl.href,
            });
            const { aiAccessService } = makeMcpService({
                agentIdentityEnabled: true,
            });
            aiAccessService.getMyAccess.mockResolvedValue({
                requirementSource: 'organization',
                identity: 'connected_person',
                refusal: signInRefusal.refusal,
            });
            const expected = {
                status: 'needs_sign_in',
                message: signInRefusal.message,
                connectUrl,
                settingsUrl: null,
                expiresAt: null,
            };
            expect(
                await getToolCallback(McpToolName.CONNECT_AGENT)(
                    { projectUuid },
                    extra,
                ),
            ).toMatchObject({
                structuredContent: expected,
                content: [
                    {
                        type: 'text',
                        text: `needs_sign_in: ${signInRefusal.message} ${connectUrl}`,
                    },
                ],
            });
            const uri = new URL(
                `lightdash://projects/${projectUuid}/agent-status`,
            );
            expect(
                await mockRegisteredMcpResources.get('agent-status')!(
                    uri,
                    { projectUuid },
                    extra,
                ),
            ).toEqual({
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(expected),
                    },
                ],
            });
            expect(aiAccessService.getMyAccess).toHaveBeenCalledWith(
                account,
                projectUuid,
                null,
            );
            aiAccessService.getMyAccess.mockResolvedValue({
                requirementSource: 'organization',
                identity: 'connected_person',
                refusal: null,
                expiresAt: new Date('2030-01-01T00:00:00Z'),
            });
            expect(
                await getToolCallback(McpToolName.CONNECT_AGENT)(
                    { projectUuid },
                    extra,
                ),
            ).toMatchObject({
                structuredContent: {
                    status: 'connected',
                    connectUrl: null,
                    expiresAt: '2030-01-01T00:00:00.000Z',
                },
            });
            const connectedResource = await mockRegisteredMcpResources.get(
                'agent-status',
            )!(uri, { projectUuid }, extra);
            expect(connectedResource).toMatchObject({
                contents: [
                    {
                        text: JSON.stringify({
                            status: 'connected',
                            message:
                                'Your agent is connected to the warehouse.',
                            connectUrl: null,
                            settingsUrl: null,
                            expiresAt: '2030-01-01T00:00:00.000Z',
                        }),
                    },
                ],
            });
        },
    );

    it.each([
        {
            access: {
                requirementSource: null,
                identity: 'marked_person',
                refusal: null,
            },
            status: 'not_required',
        },
        {
            access: {
                requirementSource: 'organization',
                identity: 'ai_service_account',
                refusal: null,
            },
            status: 'not_required',
        },
        {
            access: {
                requirementSource: 'organization',
                identity: 'ai_service_account',
                refusal: new AiAccessRefusedError(
                    AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING,
                ).refusal,
            },
            status: 'unavailable',
        },
        {
            access: {
                requirementSource: 'organization',
                identity: 'connected_person',
                refusal: new AiAccessRefusedError(
                    AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED,
                ).refusal,
            },
            status: 'unavailable',
        },
    ])('reports $status without a connect URL', async ({ access, status }) => {
        const { aiAccessService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        aiAccessService.getMyAccess.mockResolvedValue(access);
        expect(
            await getToolCallback(McpToolName.CONNECT_AGENT)(
                { projectUuid },
                extra,
            ),
        ).toMatchObject({ structuredContent: { status, connectUrl: null } });
    });

    it('checks resource project access before reading agent status', async () => {
        const { aiAccessService, projectService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        projectService.getProject.mockRejectedValue(
            new NotFoundError('Project not found'),
        );
        await expect(
            mockRegisteredMcpResources.get('agent-status')!(
                new URL(`lightdash://projects/${projectUuid}/agent-status`),
                { projectUuid },
                extra,
            ),
        ).rejects.toThrow('Project not found');
        expect(aiAccessService.getMyAccess).not.toHaveBeenCalled();
    });

    it('rejects a resource outside the pinned project', async () => {
        const { aiAccessService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        const pinnedExtra = {
            ...extra,
            authInfo: {
                ...extra.authInfo,
                extra: {
                    ...extra.authInfo.extra,
                    headerProjectUuid: 'pinned-project',
                },
            },
        };
        await expect(
            mockRegisteredMcpResources.get('agent-status')!(
                new URL(`lightdash://projects/${projectUuid}/agent-status`),
                { projectUuid },
                pinnedExtra,
            ),
        ).rejects.toThrow();
        expect(aiAccessService.getMyAccess).not.toHaveBeenCalled();
    });

    it.each([
        McpToolName.RUN_METRIC_QUERY,
        McpToolName.GET_QUERY_RESULT,
        McpToolName.RENDER_CHART,
    ])('includes the connect link in %s refusals', async (name) => {
        const { asyncQueryService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        asyncQueryService.executeAsyncMetricQuery.mockRejectedValue(refusal);
        asyncQueryService.getAsyncQueryHistory.mockResolvedValue(
            makeQueryHistory(
                QueryHistoryStatus.READY,
                QueryExecutionContext.MCP_RUN_METRIC_QUERY,
            ),
        );
        asyncQueryService.getRawAsyncQueryResults.mockRejectedValue(refusal);
        const result = await getToolCallback(name)(
            {
                projectUuid,
                queryUuid,
                title: 'Orders',
                description: 'Orders count',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_orders_count'],
                    sorts: [],
                    limit: 10,
                    customMetrics: null,
                    tableCalculations: null,
                    filters: null,
                },
                chartConfig: null,
            },
            extra,
        );
        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: `${refusal.message}\n\nConnect your agent (once per person): ${connectUrl}\nThen run the same call again.`,
                },
            ],
        });
        expect(result).toMatchObject({
            structuredContent: { refusal: refusal.refusal },
        });
    });

    it('includes the connect link in field-value search refusals', async () => {
        const { projectService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        projectService.searchFieldUniqueValues.mockRejectedValue(refusal);
        const result = await getToolCallback(McpToolName.SEARCH_FIELD_VALUES)(
            {
                projectUuid,
                table: 'orders',
                fieldId: 'orders_status',
                query: 'complete',
                filters: null,
            },
            extra,
        );
        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: `${refusal.message}\n\nConnect your agent (once per person): ${connectUrl}\nThen run the same call again.`,
                },
            ],
        });
        expect(result).toMatchObject({
            structuredContent: { refusal: refusal.refusal },
        });
    });

    it('ends a SQL refusal with the connect link', async () => {
        const { asyncQueryService } = makeMcpService({
            agentIdentityEnabled: true,
        });
        asyncQueryService.executeAsyncSqlQuery.mockRejectedValue(refusal);
        expect(
            await getToolCallback(McpToolName.RUN_SQL)(
                { projectUuid, sql: 'select 1' },
                extra,
            ),
        ).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: `${refusal.message}\n\nConnect your agent (once per person): ${connectUrl}\nThen run the same call again.`,
                },
            ],
        });
    });

    it('keeps the plain error text for a refusal without a link', async () => {
        const { asyncQueryService } = makeMcpService({
            agentIdentityEnabled: false,
        });
        const linkless = new AiAccessRefusedError(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        asyncQueryService.executeAsyncSqlQuery.mockRejectedValue(linkless);
        expect(
            await getToolCallback(McpToolName.RUN_SQL)(
                { projectUuid, sql: 'select 1' },
                extra,
            ),
        ).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: `Error running SQL query: ${linkless.message}`,
                },
            ],
        });
    });
});

test.each(agentActionTestCases)(
    'MCP completed SQL tool persists share action through ShareService: %s',
    async (_, surface, enabled, count) => {
        const { service, asyncQueryService } = makeMcpService();
        const insert = vi.fn().mockResolvedValue(undefined);
        const createSharedUrl = vi.fn(async (input: object) => ({
            ...input,
            nanoid: 'saved-share',
        }));
        Object.assign(service, {
            shareService: new ShareService({
                shareModel: { createSharedUrl },
                agentActionLogModel: { insert },
                analytics: { track: vi.fn() },
                lightdashConfig: { siteUrl: 'https://lightdash.example' },
            } as unknown as ConstructorParameters<typeof ShareService>[0]),
        });
        asyncQueryService.executeAsyncSqlQuery.mockResolvedValue({ queryUuid });
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(QueryHistoryStatus.READY),
        );
        asyncQueryService.getAsyncQueryResults.mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows: [],
            columns: {},
        });
        const authenticatedUser = { ...defaultSessionUser, ...user };
        const result = await withAgentActionScope(
            authenticatedUser as unknown as SessionUser,
            surface,
            enabled,
            () =>
                (surface === null
                    ? mockRegisteredMcpTools.get(McpToolName.RUN_SQL)!
                    : getToolCallback(McpToolName.RUN_SQL))(
                    { projectUuid, sql: 'select 1', limit: 10 },
                    {
                        ...extra,
                        authInfo: {
                            extra: {
                                ...extra.authInfo.extra,
                                user: authenticatedUser,
                                account,
                            },
                        },
                    },
                ),
        );
        expect(result).toMatchObject({
            structuredContent: {
                result: {
                    sqlRunnerUrl:
                        'https://lightdash.example/projects/project-uuid/sql-runner?share=saved-share',
                },
            },
        });
        expect(createSharedUrl).toHaveBeenCalledOnce();
        expect(insert).toHaveBeenCalledTimes(count);
        if (count)
            expect(insert).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    object_type: 'share',
                    object_id: 'saved-share',
                    action: 'create',
                    outcome: 'allowed',
                    agent_identity: expect.objectContaining({
                        subject: { type: 'user', uuid: userUuid },
                        act: expect.objectContaining({ surface }),
                    }),
                }),
            );
        expect(JSON.stringify(insert.mock.calls)).not.toContain('select 1');
    },
);
