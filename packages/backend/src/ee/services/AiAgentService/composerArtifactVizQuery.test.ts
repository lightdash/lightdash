import {
    ForbiddenError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    type AiArtifact,
    type AiComposerChartArtifactConfig,
    type ComposerStoredChartVizConfig,
    type QueryHistory,
    type SessionUser,
    type SourceQuery,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const user = {
    userUuid: 'user-uuid',
    organizationUuid: 'org-uuid',
    userId: 1,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => ({ inverted: false })),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;

const semanticNode: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
} as unknown as SourceQuery;

const warehouseSqlNode: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'targets',
    title: 'Targets',
    sql: 'select status, target from targets',
} as SourceQuery;

const transformationNode: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'orders_vs_target',
    title: 'Orders vs target',
    sql: 'select * from orders',
    references: ['orders'],
} as SourceQuery;

const runCreatedAt = new Date('2026-10-13T10:00:00Z');
const earlierRunAt = new Date('2026-10-13T09:00:00Z');

const settledRow = (
    queryUuid: string,
    { servedFromCache }: { servedFromCache: boolean },
) =>
    ({
        queryUuid,
        status: QueryHistoryStatus.READY,
        createdAt: runCreatedAt,
        resultsCreatedAt: servedFromCache ? earlierRunAt : runCreatedAt,
    }) as QueryHistory;

/** Each node row settles when the test resolves it, as the worker would at run time. */
const createNodeRuns = () => {
    const runs = new Map<
        string,
        {
            resolve: (row: QueryHistory) => void;
            reject: (error: Error) => void;
        }
    >();
    const pollForQueryCompletion = vi.fn(
        ({ queryUuid }: { queryUuid: string }) =>
            new Promise<QueryHistory>((resolve, reject) => {
                runs.set(queryUuid, { resolve, reject });
            }),
    );
    const settle = (queryUuid: string, servedFromCache: boolean) =>
        runs
            .get(queryUuid)!
            .resolve(settledRow(queryUuid, { servedFromCache }));
    const timeOut = (queryUuid: string) =>
        runs.get(queryUuid)!.reject(new Error('Query polling timed out'));
    return { pollForQueryCompletion, settle, timeOut };
};

const setup = ({
    queries,
    chartConfig = {
        source: 'composer',
        schemaVersion: 1,
        queries,
        terminalNodeId: 'orders_vs_target',
        vizConfig: null,
    },
}: {
    queries: SourceQuery[];
    chartConfig?: AiComposerChartArtifactConfig;
}) => {
    const artifact: AiArtifact = {
        artifactUuid: 'artifact-uuid',
        threadUuid: 'thread-uuid',
        artifactType: 'chart',
        savedQueryUuid: null,
        savedSqlUuid: null,
        savedDashboardUuid: null,
        createdAt: new Date(),
        versionNumber: 2,
        versionUuid: 'version-uuid',
        title: 'Orders vs target',
        description: null,
        chartConfig,
        dashboardConfig: null,
        promptUuid: 'prompt-uuid',
        versionCreatedAt: new Date(),
        verifiedByUserUuid: null,
        verifiedAt: null,
    } as AiArtifact;
    const querySourceService = {
        submitQueries: vi.fn(async ({ queries: submitted }) => ({
            queries: (submitted as SourceQuery[]).map((query) => ({
                nodeId: query.nodeId,
                sourceType: query.sourceType,
                queryUuid: `run-${query.nodeId}`,
                // Only a semantic node knows at submit time; the others learn when they run.
                cacheHit: false,
            })),
        })),
    };
    const analytics = { track: vi.fn() };
    const nodeRuns = createNodeRuns();
    const aiAgentModel = {
        findSlackPrompt: vi.fn().mockResolvedValue(undefined),
        findWebAppPrompt: vi
            .fn()
            .mockResolvedValue({ threadCreatedFrom: 'web_app' }),
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent-uuid',
            name: 'Agent',
            projectUuid: 'project-uuid',
        }),
        updateArtifactVersionChartConfig: vi.fn(),
    };
    const service = new AiAgentService({
        aiAgentModel,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: false }),
        },
        querySourceService,
        queryHistoryModel: {
            pollForQueryCompletion: nodeRuns.pollForQueryCompletion,
        },
        analytics,
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.spyOn(
        service as unknown as {
            getIsCopilotEnabled: () => Promise<boolean>;
        },
        'getIsCopilotEnabled',
    ).mockResolvedValue(true);
    vi.spyOn(service, 'getAgent').mockResolvedValue({
        uuid: 'agent-uuid',
        name: 'Agent',
        projectUuid: 'project-uuid',
    } as never);
    vi.spyOn(service, 'getArtifact').mockResolvedValue(artifact);
    vi.spyOn(
        service as unknown as {
            assertEmbedThreadInSpace: () => Promise<void>;
        },
        'assertEmbedThreadInSpace',
    ).mockResolvedValue(undefined);
    return { service, querySourceService, analytics, aiAgentModel, nodeRuns };
};

const options = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
};

afterEach(() => vi.restoreAllMocks());

describe('AiAgentService composer artifact visualization query', () => {
    it('opening a composer artifact runs its whole pipeline as the viewer and returns every node result', async () => {
        const { service, querySourceService, aiAgentModel } = setup({
            queries: [semanticNode, transformationNode],
        });

        const result = await service.getArtifactVizQuery(user, options);

        expect(result).toEqual({
            source: 'composer',
            terminalNodeId: 'orders_vs_target',
            nodeQueryUuids: {
                orders: 'run-orders',
                orders_vs_target: 'run-orders_vs_target',
            },
            metadata: { title: 'Orders vs target', description: null },
            chartStage: null,
        });
        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({
                account: expect.objectContaining({
                    user: expect.objectContaining({ id: 'user-uuid' }),
                }),
                queries: [semanticNode, transformationNode],
                context: QueryExecutionContext.AI,
                userAttributeOverrides: {},
            }),
        );
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('tracks the run once every node settles, counting a DuckDB node served from cache at run time', async () => {
        const { service, analytics, nodeRuns } = setup({
            queries: [semanticNode, transformationNode],
        });

        await service.getArtifactVizQuery(user, options);
        nodeRuns.settle('run-orders', false);

        expect(analytics.track).not.toHaveBeenCalled();

        nodeRuns.settle('run-orders_vs_target', true);

        await vi.waitFor(() =>
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'ai_agent.artifact_viz_query',
                    userId: 'user-uuid',
                    properties: expect.objectContaining({
                        source: 'composer',
                        artifactVersionId: 'version-uuid',
                        promptId: 'prompt-uuid',
                        queryId: 'run-orders_vs_target',
                        nodeCount: 2,
                        settledNodeCount: 2,
                        cachedNodeCount: 1,
                        durationMs: expect.any(Number),
                    }),
                }),
            ),
        );
    });

    it('tracks the run with the settled nodes when a node outlasts the wait', async () => {
        const { service, analytics, nodeRuns } = setup({
            queries: [semanticNode, transformationNode],
        });

        await service.getArtifactVizQuery(user, options);
        nodeRuns.settle('run-orders', true);
        nodeRuns.timeOut('run-orders_vs_target');

        await vi.waitFor(() =>
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        nodeCount: 2,
                        settledNodeCount: 1,
                        cachedNodeCount: 1,
                    }),
                }),
            ),
        );
    });

    it('runs an embedded composer artifact with the embed user attributes', async () => {
        const { service, querySourceService } = setup({
            queries: [semanticNode, transformationNode],
        });

        const result = await service.getArtifactVizQuery(user, {
            ...options,
            runtimeOptions: {
                userAttributeOverrides: { region: ['emea'] },
            } as never,
        });

        expect(result).toMatchObject({
            source: 'composer',
            nodeQueryUuids: {
                orders: 'run-orders',
                orders_vs_target: 'run-orders_vs_target',
            },
        });
        expect(querySourceService.submitQueries).toHaveBeenCalledWith(
            expect.objectContaining({
                userAttributeOverrides: { region: ['emea'] },
            }),
        );
    });

    it('refuses an embedded composer artifact whose pipeline has a warehouse SQL node', async () => {
        const { service, querySourceService } = setup({
            queries: [semanticNode, warehouseSqlNode, transformationNode],
        });

        const run = service.getArtifactVizQuery(user, {
            ...options,
            runtimeOptions: { userAttributeOverrides: {} } as never,
        });

        await expect(run).rejects.toBeInstanceOf(ForbiddenError);
        await expect(run).rejects.not.toThrow(/Lightdash/);
        expect(querySourceService.submitQueries).not.toHaveBeenCalled();
    });

    it('runs a composer artifact with a warehouse SQL node outside embeds', async () => {
        const { service } = setup({
            queries: [semanticNode, warehouseSqlNode, transformationNode],
        });

        const result = await service.getArtifactVizQuery(user, options);

        expect(result).toMatchObject({
            source: 'composer',
            nodeQueryUuids: {
                orders: 'run-orders',
                targets: 'run-targets',
                orders_vs_target: 'run-orders_vs_target',
            },
        });
    });
});

describe('AiAgentService composer v2 artifact chart stage', () => {
    const lineViz = (
        config: Partial<ComposerStoredChartVizConfig>,
    ): ComposerStoredChartVizConfig => ({
        type: 'line',
        x: 'order_month',
        y: ['order_count'],
        groupBy: null,
        stack: null,
        horizontal: null,
        y2: null,
        labels: null,
        customChartTypeSlug: null,
        fieldMapping: null,
        options: null,
        dataAppVizUuid: null,
        dataAppVizVersion: null,
        ...config,
    });
    const v2Setup = (vizConfig: ComposerStoredChartVizConfig) =>
        setup({
            queries: [semanticNode, transformationNode],
            chartConfig: {
                source: 'composer',
                schemaVersion: 2,
                queries: [semanticNode, transformationNode],
                terminalNodeId: 'orders_vs_target',
                vizConfig,
            },
        });

    it('appends the series split stage to the run and returns its query beside the node results', async () => {
        const { service, querySourceService } = v2Setup(
            lineViz({ groupBy: ['status'] }),
        );

        const result = await service.getArtifactVizQuery(user, options);

        const submitted = querySourceService.submitQueries.mock.calls[0][0]
            .queries as SourceQuery[];
        expect(submitted.slice(0, 2)).toEqual([
            semanticNode,
            transformationNode,
        ]);
        expect(submitted[2]).toMatchObject({
            sourceType: QuerySourceType.DUCKDB,
            sql: 'SELECT "order_month" AS "composer_result_order_month", "status" AS "composer_result_status", "order_count" AS "composer_result_order_count" FROM "node_result"',
            references: { node_result: 'orders_vs_target' },
            pivotConfiguration: {
                indexColumn: [{ reference: 'composer_result_order_month' }],
                groupByColumns: [{ reference: 'composer_result_status' }],
                valuesColumns: [{ reference: 'composer_result_order_count' }],
            },
        });
        expect(result).toMatchObject({
            source: 'composer',
            nodeQueryUuids: {
                orders: 'run-orders',
                orders_vs_target: 'run-orders_vs_target',
            },
            chartStage: {
                status: 'ok',
                queryUuid: `run-${submitted[2].nodeId}`,
            },
        });
        expect(result.source === 'composer' && result.nodeQueryUuids).toEqual({
            orders: 'run-orders',
            orders_vs_target: 'run-orders_vs_target',
        });
    });

    it('runs no stage without a series split', async () => {
        const { service, querySourceService } = v2Setup(lineViz({}));

        const result = await service.getArtifactVizQuery(user, options);

        expect(
            querySourceService.submitQueries.mock.calls[0][0].queries,
        ).toEqual([semanticNode, transformationNode]);
        expect(result).toMatchObject({ chartStage: null });
    });

    it('returns the chart error and still runs the pipeline when a split lacks explicit x', async () => {
        const { service, querySourceService } = v2Setup(
            lineViz({ x: null, groupBy: ['status'] }),
        );

        const result = await service.getArtifactVizQuery(user, options);

        expect(
            querySourceService.submitQueries.mock.calls[0][0].queries,
        ).toEqual([semanticNode, transformationNode]);
        expect(result).toMatchObject({
            chartStage: {
                status: 'error',
                message: 'A series split needs explicit x and y columns',
            },
        });
    });
});
