import {
    CatalogType,
    MetricType,
    QueryExecutionContext,
    QueryHistoryStatus,
} from '@lightdash/common';
import * as runQueryTool from '../ai/tools/runQuery';
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
const queryUuid = '11111111-1111-4111-8111-111111111111';
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

const makeExplore = ({
    tags = [],
    metricTags,
    dimensionTags,
}: {
    tags?: string[];
    metricTags?: string[];
    dimensionTags?: string[];
} = {}) => ({
    name: 'orders',
    tags,
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            requiredAttributes: {},
            anyAttributes: {},
            dimensions: dimensionTags
                ? {
                      status: {
                          name: 'status',
                          table: 'orders',
                          tags: dimensionTags,
                      },
                  }
                : {},
            metrics: {
                orders_count: {
                    name: 'orders_count',
                    table: 'orders',
                    tags: metricTags,
                    tablesReferences: ['orders'],
                },
            },
        },
    },
});

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
    dashboardSearchResults?: Record<string, unknown>[];
    chartSearchResults?: Record<string, unknown>[];
    verifiedContent?: Record<string, unknown>[];
} = {}) => {
    const asyncQueryService = {
        executeAsyncSqlQuery: jest.fn(),
        executeAsyncMetricQuery: jest.fn(),
        getAsyncQueryHistory: jest.fn(),
        getAsyncQueryResults: jest.fn(),
        getRawAsyncQueryResults: jest.fn(),
        pollQueryHistoryUntilDeadline: jest.fn(),
    };

    const mcpContextModel = {
        getContext: jest.fn().mockResolvedValue({ context }),
    };

    const shareService = {
        createShareUrl: jest.fn().mockResolvedValue({ nanoid: 'share-id' }),
    };

    const projectModel = {
        findExploresFromCache: jest.fn(
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
        getProject: jest.fn().mockResolvedValue({ organizationUuid }),
        searchFieldUniqueValues: jest.fn().mockResolvedValue({ results: [] }),
    };

    const catalogService = {
        searchCatalog: jest.fn(async ({ catalogSearch }) => ({
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

    const contentVerificationService = {
        listVerifiedContent: jest.fn().mockResolvedValue(verifiedContent),
    };

    const searchModel = {
        searchDashboards: jest.fn().mockResolvedValue(dashboardSearchResults),
        searchAllCharts: jest.fn().mockResolvedValue(chartSearchResults),
    };

    const spaceService = {
        filterBySpaceAccess: jest.fn(async (_user, content) => content),
    };

    const userAttributesModel = {
        getAttributeValuesForOrgMember: jest.fn().mockResolvedValue({}),
    };

    const service = new McpService({
        aiAgentService,
        aiOrganizationSettingsService: {
            getSettings: jest.fn().mockResolvedValue({ aiAgentsVisible: true }),
        },
        aiWritebackService: {},
        analytics: { track: jest.fn() },
        asyncQueryService,
        catalogService,
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
        projectModel,
        projectService,
        searchModel,
        shareService,
        spaceService,
        userAttributesModel,
    } as unknown as ConstructorParameters<typeof McpService>[0]);

    return {
        aiAgentService,
        asyncQueryService,
        catalogService,
        contentVerificationService,
        mcpContextModel,
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
    return callback;
};

const getTextResult = (result: unknown) => {
    const response = result as { content?: Array<{ text?: string }> };
    return response.content?.[0]?.text ?? '';
};

const parseTextResult = (result: unknown) =>
    JSON.parse(getTextResult(result) || '{}') as Record<string, unknown>;

describe('MCP async query polling', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.clear();
        jest.spyOn(
            McpService as unknown as { getMcpQueryWaitMs: () => number },
            'getMcpQueryWaitMs',
        ).mockReturnValue(0);
        jest.spyOn(runQueryTool, 'validateRunQueryTool').mockImplementation(
            () => {},
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
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
                cannot: jest.fn(() => true),
            },
        };
        const headerProjectUuid = '22222222-2222-4222-8222-222222222222';

        await expect(
            getToolCallback(McpToolName.RUN_SQL)(
                { sql: 'select 1', limit: 10 },
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

    it('memoizes active agent scope within a tool request', async () => {
        const { aiAgentService } = makeMcpService({
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
            explores: { orders: makeExplore({ tags: ['ai'] }) },
        });

        await getToolCallback(McpToolName.LIST_EXPLORES)({}, extra);

        expect(aiAgentService.getAgent).toHaveBeenCalledTimes(1);
    });

    it('filters content by active agent space access', async () => {
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
            { searchQueries: [{ label: 'chart' }] },
            extra,
        );
        const contentText = getTextResult(contentResult);

        expect(contentText).toContain('Allowed Chart');
        expect(contentText).not.toContain('Blocked Chart');

        const verifiedResult = await getToolCallback(
            McpToolName.LIST_VERIFIED_CONTENT,
        )({}, extra);
        const verifiedContentResult = JSON.parse(getTextResult(verifiedResult));

        expect(verifiedContentResult).toEqual([allowedVerifiedContent]);
    });

    it('uses active agent tags for run_metric_query', async () => {
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
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                },
                customMetrics: null,
                tableCalculations: null,
                chartConfig: null,
                filters: null,
            },
            extra,
        );

        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalled();
    });

    it('uses filtered explores instead of catalog tag UUID filters for find_explores', async () => {
        const { catalogService } = makeMcpService({
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
            explores: { orders: makeExplore({ tags: ['ai'] }) },
        });

        await getToolCallback(McpToolName.FIND_EXPLORES)(
            { searchQuery: 'orders' },
            extra,
        );

        expect(catalogService.searchCatalog).toHaveBeenCalledTimes(2);
        catalogService.searchCatalog.mock.calls.forEach(([call]) => {
            expect(call.catalogSearch.catalogTags).toBeUndefined();
            expect(call.filteredExplores).toEqual([
                expect.objectContaining({ name: 'orders' }),
            ]);
        });
    });

    it('does not fall back to manual tags with an active agent', async () => {
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
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 10,
                },
                customMetrics: null,
                tableCalculations: null,
                chartConfig: null,
                filters: null,
            },
            extra,
        );

        expect(result).toMatchObject({
            isError: true,
            content: [
                {
                    type: 'text',
                    text: "Error running metric query: Explore 'orders' not found",
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
                },
                customMetrics: null,
                tableCalculations: null,
                chartConfig: null,
                filters: null,
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
                },
                customMetrics: null,
                tableCalculations: null,
                chartConfig: null,
                filters: null,
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
                },
                customMetrics: null,
                tableCalculations: null,
                chartConfig: null,
                filters: null,
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
    });

    it('returns final SQL rows when get_query_result sees readiness during its wait', async () => {
        const { asyncQueryService, shareService } = makeMcpService();
        asyncQueryService.getAsyncQueryHistory.mockResolvedValueOnce(
            makeQueryHistory(QueryHistoryStatus.QUEUED),
        );
        asyncQueryService.pollQueryHistoryUntilDeadline.mockResolvedValue(
            makeQueryHistory(QueryHistoryStatus.READY),
        );
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
                pageSize: undefined,
            }),
        );
        expect(shareService.createShareUrl).toHaveBeenCalledWith(
            user,
            '/projects/project-uuid/sql-runner',
            expect.stringContaining('"sql":"select 1"'),
        );
    });

    it('does not return metric results outside the active agent scope', async () => {
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
            { queryUuid },
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

    it('does not render metric results outside the active agent scope', async () => {
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
            { queryUuid },
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
            { queryUuid },
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
            { queryUuid },
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

    it('does not search field values outside the active agent scope', async () => {
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
        expect(asyncQueryService.getAsyncQueryHistory).toHaveBeenCalledTimes(1);
        expect(
            asyncQueryService.pollQueryHistoryUntilDeadline,
        ).not.toHaveBeenCalled();
        expect(asyncQueryService.getAsyncQueryResults).not.toHaveBeenCalled();
    });
});
