import { QueryExecutionContext, QueryHistoryStatus } from '@lightdash/common';
import * as runQueryTool from '../ai/tools/runQuery';
import { McpService, McpToolName } from './McpService';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<unknown>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();

jest.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
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

const account = {
    isRegisteredUser: () => true,
    isServiceAccount: () => false,
    user: { id: userUuid },
};

const user = {
    userUuid,
    organizationUuid,
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

const makeQueryHistory = (
    status: QueryHistoryStatus,
    context: QueryExecutionContext = QueryExecutionContext.MCP_RUN_SQL,
    error: string | null = null,
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
        metrics: ['orders_count'],
        sorts: [],
        filters: {},
        limit: 10,
        tableCalculations: [],
        additionalMetrics: [],
    },
});

const makeMcpService = () => {
    const asyncQueryService = {
        executeAsyncSqlQuery: jest.fn(),
        executeAsyncMetricQuery: jest.fn(),
        getAsyncQueryHistory: jest.fn(),
        getAsyncQueryResults: jest.fn(),
        getRawAsyncQueryResults: jest.fn(),
        pollQueryHistoryUntilDeadline: jest.fn(),
    };

    const mcpContextModel = {
        getContext: jest.fn().mockResolvedValue({
            context: {
                projectUuid,
                projectName: 'Project',
                agentUuid: null,
                agentName: null,
                tags: null,
            },
        }),
    };

    const shareService = {
        createShareUrl: jest.fn().mockResolvedValue({ nanoid: 'share-id' }),
    };

    const service = new McpService({
        aiAgentService: {},
        aiOrganizationSettingsService: {},
        aiWritebackService: {},
        analytics: { track: jest.fn() },
        asyncQueryService,
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
        projectService: {},
        searchModel: {},
        shareService,
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

    return { asyncQueryService, mcpContextModel, service, shareService };
};

const getToolCallback = (toolName: McpToolName) => {
    const callback = mockRegisteredMcpTools.get(toolName);
    if (!callback) {
        throw new Error(`Tool ${toolName} was not registered`);
    }
    return callback;
};

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
        jest.spyOn(
            McpService.prototype as unknown as {
                getRunMetricQueryDependencies: () => Promise<unknown>;
            },
            'getRunMetricQueryDependencies',
        ).mockResolvedValue({
            agentContext: {
                getExplore: jest.fn().mockReturnValue({
                    name: 'orders',
                }),
            },
            userAttributeOverrides: {},
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
        jest.spyOn(
            McpService.prototype as unknown as {
                getRunMetricQueryDependencies: () => Promise<unknown>;
            },
            'getRunMetricQueryDependencies',
        ).mockResolvedValue({
            agentContext: {
                getExplore: jest.fn().mockReturnValue({
                    name: 'orders',
                }),
            },
            userAttributeOverrides: {},
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
        jest.spyOn(
            McpService.prototype as unknown as {
                getRunMetricQueryDependencies: () => Promise<unknown>;
            },
            'getRunMetricQueryDependencies',
        ).mockResolvedValue({
            agentContext: {
                getExplore: jest.fn().mockReturnValue({
                    name: 'orders',
                }),
            },
            userAttributeOverrides: {},
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
