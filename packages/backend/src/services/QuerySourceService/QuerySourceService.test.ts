import {
    ForbiddenError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    VizAggregationOptions,
    VizIndexType,
    type PivotConfiguration,
    type SourceQuery,
} from '@lightdash/common';
import type { Mock } from 'vitest';
import { buildAccount } from '../../auth/account/account.mock';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../ProjectService/ProjectService';
import { QuerySourceRegistry } from './QuerySourceRegistry';
import { QuerySourceService } from './QuerySourceService';
import { DuckdbQuerySource } from './sources/DuckdbQuerySource';
import { SemanticLayerQuerySource } from './sources/SemanticLayerQuerySource';
import type {
    QuerySourceClient,
    SourceQueryExecutionContext,
    SubmitSourceQueryArgs,
} from './types';

const account = buildAccount();
const projectUuid = 'test-project-uuid';
const organizationUuid = 'test-org-uuid';
const executionContext: SourceQueryExecutionContext = {
    parameters: {},
    userAttributeOverrides: {},
    invalidateCache: false,
};

const createFakeSource = (
    sourceType: QuerySourceType,
    submitQuery: Mock = vi
        .fn()
        .mockImplementation(async ({ query }: { query: SourceQuery }) => ({
            queryUuid: `${query.nodeId ?? sourceType}-query-uuid`,
        })),
): QuerySourceClient & { submitQuery: Mock } => ({
    definition: { sourceType, label: sourceType, description: 'fake source' },
    supportsPivot: sourceType !== QuerySourceType.DUCKDB,
    scanSchema: vi.fn().mockResolvedValue({ sourceType, tables: [] }),
    getQueryReferences: (query: SourceQuery) => {
        if (query.sourceType !== QuerySourceType.DUCKDB) return [];
        if (query.references === undefined) return [];
        return Array.isArray(query.references)
            ? query.references
            : Object.values(query.references);
    },
    submitQuery,
});

type Mocks = {
    featureFlagModel: { get: Mock };
    projectModel: { getSummary: Mock };
    queryHistoryModel: { get: Mock };
};

const createService = (registry: QuerySourceRegistry) => {
    const mocks: Mocks = {
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({ organizationUuid }),
        },
        queryHistoryModel: {
            get: vi.fn(async (queryUuid: string) => ({
                queryUuid,
                status: QueryHistoryStatus.READY,
                error: null,
            })),
        },
    };

    const service = new QuerySourceService({
        projectModel: mocks.projectModel as unknown as ProjectModel,
        queryHistoryModel:
            mocks.queryHistoryModel as unknown as QueryHistoryModel,
        featureFlagModel: mocks.featureFlagModel as unknown as FeatureFlagModel,
        registry,
    });

    return { service, mocks };
};

const createRegistryWithFakes = () => {
    const sqlSource = createFakeSource(QuerySourceType.SQL);
    const semanticLayerSource = createFakeSource(
        QuerySourceType.SEMANTIC_LAYER,
    );
    const duckdbSource = createFakeSource(QuerySourceType.DUCKDB);
    const registry = new QuerySourceRegistry();
    registry.register(sqlSource);
    registry.register(semanticLayerSource);
    registry.register(duckdbSource);
    return { registry, sqlSource, semanticLayerSource, duckdbSource };
};

describe('QuerySourceRegistry', () => {
    it('lists registered sources and resolves them by type', () => {
        const { registry } = createRegistryWithFakes();
        expect(registry.list().map((d) => d.sourceType)).toEqual([
            QuerySourceType.SQL,
            QuerySourceType.SEMANTIC_LAYER,
            QuerySourceType.DUCKDB,
        ]);
        expect(
            registry.get(QuerySourceType.DUCKDB).definition.sourceType,
        ).toEqual(QuerySourceType.DUCKDB);
    });

    it('rejects duplicate registrations', () => {
        const { registry } = createRegistryWithFakes();
        expect(() =>
            registry.register(createFakeSource(QuerySourceType.SQL)),
        ).toThrow('already registered');
    });
});

describe('QuerySourceService', () => {
    describe('executeSourceQueries validation', () => {
        const execute = (queries: SourceQuery[]) => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);
            return service.executeSourceQueries({
                ...executionContext,
                account,
                projectUuid,
                queries,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });
        };

        it('rejects an empty submission', async () => {
            await expect(execute([])).rejects.toThrow(ParameterError);
        });

        it('rejects duplicate node ids', async () => {
            await expect(
                execute([
                    {
                        nodeId: 'a',
                        sourceType: QuerySourceType.SQL,
                        sql: 'SELECT 1',
                    },
                    {
                        nodeId: 'a',
                        sourceType: QuerySourceType.SQL,
                        sql: 'SELECT 2',
                    },
                ]),
            ).rejects.toThrow('Duplicate node id');
        });

        it('rejects invalid node ids', async () => {
            await expect(
                execute([
                    {
                        nodeId: '1-bad-id!',
                        sourceType: QuerySourceType.SQL,
                        sql: 'SELECT 1',
                    },
                ]),
            ).rejects.toThrow('Invalid node id');
        });

        it('rejects references that are neither node ids nor query uuids', async () => {
            await expect(
                execute([
                    {
                        nodeId: 'merge',
                        sourceType: QuerySourceType.DUCKDB,
                        sql: 'SELECT * FROM t',
                        references: { t: 'missing_node' },
                    },
                ]),
            ).rejects.toThrow('neither the node id');
        });

        it('rejects reference cycles', async () => {
            await expect(
                execute([
                    {
                        nodeId: 'x',
                        sourceType: QuerySourceType.DUCKDB,
                        sql: 'SELECT * FROM t',
                        references: { t: 'y' },
                    },
                    {
                        nodeId: 'y',
                        sourceType: QuerySourceType.DUCKDB,
                        sql: 'SELECT * FROM t',
                        references: { t: 'x' },
                    },
                ]),
            ).rejects.toThrow('cycle');
        });

        it('allows references to existing results by query uuid', async () => {
            const results = await execute([
                {
                    nodeId: 'merge',
                    sourceType: QuerySourceType.DUCKDB,
                    sql: 'SELECT * FROM t',
                    references: { t: '123e4567-e89b-12d3-a456-426614174000' },
                },
            ]);
            expect(results.queries).toEqual([
                {
                    nodeId: 'merge',
                    sourceType: QuerySourceType.DUCKDB,
                    queryUuid: 'merge-query-uuid',
                },
            ]);
        });

        it('throws when the feature flag is disabled', async () => {
            const fakes = createRegistryWithFakes();
            const { service, mocks } = createService(fakes.registry);
            mocks.featureFlagModel.get.mockResolvedValue({ enabled: false });

            await expect(
                service.executeSourceQueries({
                    ...executionContext,
                    account,
                    projectUuid,
                    queries: [
                        { sourceType: QuerySourceType.SQL, sql: 'SELECT 1' },
                    ],
                    context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                }),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('executeSourceQueries submission', () => {
        it('submits a single query and generates a node id', async () => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);

            const results = await service.executeSourceQueries({
                ...executionContext,
                account,
                projectUuid,
                queries: [{ sourceType: QuerySourceType.SQL, sql: 'SELECT 1' }],
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });

            expect(results.queries).toHaveLength(1);
            expect(results.queries[0].nodeId).toEqual('query_1');
            expect(fakes.sqlSource.submitQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    account,
                    projectUuid,
                    resolvedReferences: {},
                }),
            );
        });

        it('submits in dependency order, rewriting node references to queryUuids', async () => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);

            // The merge query comes first in the payload; submission order
            // must still be dependencies-first
            const results = await service.executeSourceQueries({
                ...executionContext,
                account,
                projectUuid,
                queries: [
                    {
                        nodeId: 'merged',
                        sourceType: QuerySourceType.DUCKDB,
                        sql: 'SELECT * FROM orders JOIN revenue USING (id)',
                        references: ['orders', 'revenue'],
                    },
                    {
                        nodeId: 'orders',
                        sourceType: QuerySourceType.SQL,
                        sql: 'SELECT 1',
                    },
                    {
                        nodeId: 'revenue',
                        sourceType: QuerySourceType.SEMANTIC_LAYER,
                        exploreName: 'payments',
                        dimensions: [],
                        metrics: [],
                    },
                ],
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });

            expect(results.queries.map((q) => q.nodeId)).toEqual(
                expect.arrayContaining(['orders', 'revenue', 'merged']),
            );
            // The merge query was submitted after its dependencies, with their
            // node ids resolved to real queryUuids
            expect(fakes.duckdbSource.submitQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    resolvedReferences: {
                        orders: 'orders-query-uuid',
                        revenue: 'revenue-query-uuid',
                    },
                }),
            );
            const mergeSubmission = results.queries.find(
                (q) => q.nodeId === 'merged',
            );
            expect(mergeSubmission?.queryUuid).toEqual('merged-query-uuid');
        });

        it('hands every source the submission execution context and its own pivot', async () => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);
            const pivotConfiguration: PivotConfiguration = {
                indexColumn: {
                    reference: 'orders_status',
                    type: VizIndexType.CATEGORY,
                },
                valuesColumns: [
                    {
                        reference: 'orders_total',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: undefined,
                sortBy: undefined,
            };

            await service.executeSourceQueries({
                account,
                projectUuid,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                parameters: { region: 'EU' },
                userAttributeOverrides: { tenant: ['acme'] },
                invalidateCache: true,
                queries: [
                    {
                        nodeId: 'orders',
                        sourceType: QuerySourceType.SEMANTIC_LAYER,
                        exploreName: 'orders',
                        dimensions: ['orders_status'],
                        metrics: ['orders_total'],
                        pivotConfiguration,
                    },
                    {
                        nodeId: 'summary',
                        sourceType: QuerySourceType.DUCKDB,
                        sql: 'SELECT * FROM orders',
                        references: ['orders'],
                    },
                ],
            });

            const sharedContext = {
                parameters: { region: 'EU' },
                userAttributeOverrides: { tenant: ['acme'] },
                invalidateCache: true,
            };
            expect(fakes.semanticLayerSource.submitQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...sharedContext,
                    pivotConfiguration,
                }),
            );
            // The pivot belongs to the node that declared it; nodes without
            // one get an explicit null, never the neighbour's pivot
            expect(fakes.duckdbSource.submitQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...sharedContext,
                    pivotConfiguration: null,
                }),
            );
        });

        it('refuses a pivot on a node that cannot pivot before submitting any node', async () => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);

            await expect(
                service.executeSourceQueries({
                    ...executionContext,
                    account,
                    projectUuid,
                    context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                    queries: [
                        {
                            nodeId: 'orders',
                            sourceType: QuerySourceType.SEMANTIC_LAYER,
                            exploreName: 'orders',
                            dimensions: ['orders_status'],
                            metrics: ['orders_total'],
                        },
                        {
                            nodeId: 'payments',
                            sourceType: QuerySourceType.SEMANTIC_LAYER,
                            exploreName: 'payments',
                            dimensions: ['payments_status'],
                            metrics: ['payments_total'],
                        },
                        {
                            nodeId: 'joined',
                            sourceType: QuerySourceType.DUCKDB,
                            sql: 'SELECT * FROM orders JOIN payments USING (status)',
                            references: ['orders', 'payments'],
                            pivotConfiguration: {
                                indexColumn: undefined,
                                valuesColumns: [],
                                groupByColumns: undefined,
                                sortBy: undefined,
                            },
                        },
                    ],
                }),
            ).rejects.toThrow(
                expect.objectContaining({
                    name: ParameterError.name,
                    message: expect.stringContaining('"joined"'),
                }),
            );

            // Nothing ran: the legs never reached the warehouse
            expect(
                fakes.semanticLayerSource.submitQuery,
            ).not.toHaveBeenCalled();
            expect(fakes.duckdbSource.submitQuery).not.toHaveBeenCalled();
        });

        it('requires user attribute overrides on the submit contract', () => {
            const args: SubmitSourceQueryArgs = {
                account,
                projectUuid,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                query: { sourceType: QuerySourceType.SQL, sql: 'SELECT 1' },
                resolvedReferences: {},
                parameters: {},
                userAttributeOverrides: {},
                invalidateCache: false,
                pivotConfiguration: null,
            };
            const { userAttributeOverrides, ...withoutOverrides } = args;
            // @ts-expect-error omitting the overrides is a compile error, not a silent default
            const rejected: SubmitSourceQueryArgs = withoutOverrides;
            expect(rejected).not.toHaveProperty('userAttributeOverrides');
            expect(userAttributeOverrides).toEqual({});
        });

        it('propagates submit failures as-is', async () => {
            const fakes = createRegistryWithFakes();
            fakes.sqlSource.submitQuery.mockRejectedValue(
                new Error('warehouse exploded'),
            );
            const { service } = createService(fakes.registry);

            await expect(
                service.executeSourceQueries({
                    ...executionContext,
                    account,
                    projectUuid,
                    queries: [
                        { sourceType: QuerySourceType.SQL, sql: 'SELECT 1' },
                    ],
                    context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                }),
            ).rejects.toThrow('warehouse exploded');
        });
    });

    describe('getSourceQueryStatuses', () => {
        it('returns the standard status per query uuid', async () => {
            const fakes = createRegistryWithFakes();
            const { service, mocks } = createService(fakes.registry);
            mocks.queryHistoryModel.get.mockImplementation(
                async (queryUuid: string) => ({
                    queryUuid,
                    status:
                        queryUuid === 'failed-uuid'
                            ? QueryHistoryStatus.ERROR
                            : QueryHistoryStatus.READY,
                    error: queryUuid === 'failed-uuid' ? 'boom' : null,
                }),
            );

            const results = await service.getSourceQueryStatuses(
                account,
                projectUuid,
                ['ok-uuid', 'failed-uuid'],
            );

            expect(results.statuses).toEqual([
                {
                    queryUuid: 'ok-uuid',
                    status: QueryHistoryStatus.READY,
                    error: null,
                },
                {
                    queryUuid: 'failed-uuid',
                    status: QueryHistoryStatus.ERROR,
                    error: 'boom',
                },
            ]);
        });

        it('rejects an empty uuid list', async () => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);
            await expect(
                service.getSourceQueryStatuses(account, projectUuid, []),
            ).rejects.toThrow(ParameterError);
        });
    });
});

/**
 * The composer interface contract: a pipeline whose terminal node is a
 * semantic-layer query resolves to that metric query's own result set — it
 * is never wrapped in a DuckDB `SELECT *`, which would remove the column
 * metadata the metric path persists at query-write time. DuckDB nodes read
 * upstream results by reference and produce their own columns; no metadata
 * is carried through.
 */
describe('composer pipelines return the standard results interface', () => {
    const createRealSources = () => {
        const asyncQueryService = {
            executeAsyncMetricQuery: vi.fn().mockResolvedValue({
                queryUuid: 'metric-query-uuid',
            }),
            executeAsyncComposeSqlQuery: vi.fn().mockResolvedValue({
                queryUuid: 'compose-query-uuid',
            }),
        };
        const registry = new QuerySourceRegistry();
        registry.register(
            new SemanticLayerQuerySource({
                asyncQueryService:
                    asyncQueryService as unknown as AsyncQueryService,
                projectService: {} as ProjectService,
            }),
        );
        registry.register(
            new DuckdbQuerySource({
                asyncQueryService:
                    asyncQueryService as unknown as AsyncQueryService,
            }),
        );
        return { registry, asyncQueryService };
    };

    it('resolves a single-node semantic-layer pipeline to the metric query itself, without a DuckDB wrapper', async () => {
        const { registry, asyncQueryService } = createRealSources();
        const { service } = createService(registry);

        const result = await service.executeSourceQueries({
            ...executionContext,
            account,
            projectUuid,
            context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_revenue'],
                },
            ],
        });

        // The submission's queryUuid is the metric query's own uuid — results
        // are served from that query's history row, which carries the column
        // metadata the metric execution path persists.
        expect(result.queries).toHaveLength(1);
        expect(result.queries[0].queryUuid).toEqual('metric-query-uuid');
        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledTimes(
            1,
        );
        expect(asyncQueryService.executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                metricQuery: expect.objectContaining({
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_revenue'],
                }),
            }),
        );
        // The query is not wrapped in a DuckDB SELECT *; the compose engine
        // is not involved.
        expect(
            asyncQueryService.executeAsyncComposeSqlQuery,
        ).not.toHaveBeenCalled();
    });

    it('runs a DuckDB node as its own compose query that reads the metric result by reference', async () => {
        const { registry, asyncQueryService } = createRealSources();
        const { service } = createService(registry);

        const result = await service.executeSourceQueries({
            ...executionContext,
            account,
            projectUuid,
            context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'orders',
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_revenue'],
                },
                {
                    sourceType: QuerySourceType.DUCKDB,
                    nodeId: 'summary',
                    sql: 'SELECT sum(orders_total_revenue) AS revenue FROM orders',
                    references: ['orders'],
                },
            ],
        });

        // The semantic-layer node still resolves to its own result set.
        const bySourceType = Object.fromEntries(
            result.queries.map((submission) => [
                submission.sourceType,
                submission.queryUuid,
            ]),
        );
        expect(bySourceType[QuerySourceType.SEMANTIC_LAYER]).toEqual(
            'metric-query-uuid',
        );
        // The DuckDB node runs as a separate compose query that reads the
        // metric result by queryUuid reference.
        expect(bySourceType[QuerySourceType.DUCKDB]).toEqual(
            'compose-query-uuid',
        );
        expect(
            asyncQueryService.executeAsyncComposeSqlQuery,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                references: { orders: 'metric-query-uuid' },
            }),
        );
    });

    it('hands a DuckDB node its parameters and cache control, and refuses a pivot on it', async () => {
        const { registry, asyncQueryService } = createRealSources();
        const { service } = createService(registry);
        const duckdbNode: SourceQuery = {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'summary',
            sql: 'SELECT * FROM t WHERE region = ${ld.parameters.region}',
            references: { t: '123e4567-e89b-12d3-a456-426614174000' },
        };

        await service.executeSourceQueries({
            account,
            projectUuid,
            context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            parameters: { region: 'EU' },
            userAttributeOverrides: {},
            invalidateCache: true,
            queries: [duckdbNode],
        });
        expect(
            asyncQueryService.executeAsyncComposeSqlQuery,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                parameters: { region: 'EU' },
                invalidateCache: true,
            }),
        );

        await expect(
            service.executeSourceQueries({
                ...executionContext,
                account,
                projectUuid,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                queries: [
                    {
                        ...duckdbNode,
                        pivotConfiguration: {
                            indexColumn: undefined,
                            valuesColumns: [],
                            groupByColumns: undefined,
                            sortBy: undefined,
                        },
                    },
                ],
            }),
        ).rejects.toThrow(ParameterError);
    });
});
