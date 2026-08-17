import {
    ForbiddenError,
    ParameterError,
    QueryDagNodeStatus,
    QueryDagStatus,
    QueryExecutionContext,
    QueryHistoryStatus,
    QuerySourceType,
    type MetricQueryRequest,
    type QueryDagNodeRequest,
    type SourceQuery,
} from '@lightdash/common';
import type { Mock } from 'vitest';
import { buildAccount } from '../../auth/account/account.mock';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryDagModel } from '../../models/QueryDagModel/QueryDagModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { QuerySourceRegistry } from './QuerySourceRegistry';
import { QuerySourceService } from './QuerySourceService';
import type { QuerySourceClient } from './types';

const account = buildAccount();
const projectUuid = 'test-project-uuid';
const organizationUuid = 'test-org-uuid';

const metricQueryRequest: MetricQueryRequest = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
};

const createFakeSource = (
    sourceType: QuerySourceType,
    submitQuery: Mock = vi
        .fn()
        .mockResolvedValue({ queryUuid: `${sourceType}-query-uuid` }),
): QuerySourceClient & { submitQuery: Mock } => ({
    definition: { sourceType, label: sourceType, description: 'fake source' },
    scanSchema: vi.fn().mockResolvedValue({ sourceType, tables: [] }),
    getQueryReferences: (query: SourceQuery) =>
        query.sourceType === QuerySourceType.DUCKDB
            ? Object.values(query.references ?? {})
            : [],
    submitQuery,
});

type Mocks = {
    featureFlagModel: { get: Mock };
    projectModel: { getSummary: Mock };
    queryHistoryModel: { pollForQueryCompletion: Mock };
    queryDagModel: {
        create: Mock;
        get: Mock;
        updateDag: Mock;
        updateNode: Mock;
    };
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
            pollForQueryCompletion: vi
                .fn()
                .mockResolvedValue({ status: QueryHistoryStatus.READY }),
        },
        queryDagModel: {
            create: vi.fn(
                async (args: {
                    nodes: {
                        nodeId: string;
                        sourceType: QuerySourceType;
                    }[];
                }) => ({
                    queryDagUuid: 'test-dag-uuid',
                    projectUuid,
                    status: QueryDagStatus.PENDING,
                    error: null,
                    createdAt: new Date(),
                    nodes: args.nodes.map((node) => ({
                        nodeId: node.nodeId,
                        sourceType: node.sourceType,
                        status: QueryDagNodeStatus.PENDING,
                        queryUuid: null,
                        error: null,
                    })),
                    organizationUuid,
                    createdByUserUuid: account.user.id,
                }),
            ),
            get: vi.fn(),
            updateDag: vi.fn().mockResolvedValue(undefined),
            updateNode: vi.fn().mockResolvedValue(undefined),
        },
    };

    const service = new QuerySourceService({
        projectModel: mocks.projectModel as unknown as ProjectModel,
        queryHistoryModel:
            mocks.queryHistoryModel as unknown as QueryHistoryModel,
        queryDagModel: mocks.queryDagModel as unknown as QueryDagModel,
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

/** Waits until the background orchestration marks the dag terminal. */
const waitForDagFinish = async (mocks: Mocks) => {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        const terminalCall = mocks.queryDagModel.updateDag.mock.calls.find(
            (call) => {
                const update = call[1] as { status: QueryDagStatus };
                return (
                    update.status === QueryDagStatus.COMPLETED ||
                    update.status === QueryDagStatus.ERROR
                );
            },
        );
        if (terminalCall) return;
    }
    throw new Error('Query DAG orchestration did not finish');
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
    describe('executeSourceQuery', () => {
        it('submits through the source and returns its queryUuid', async () => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);

            const results = await service.executeSourceQuery({
                account,
                projectUuid,
                query: { sourceType: QuerySourceType.SQL, sql: 'SELECT 1' },
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });

            expect(results).toEqual({ queryUuid: 'sql-query-uuid' });
            expect(fakes.sqlSource.submitQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    account,
                    projectUuid,
                    resolvedReferences: {},
                }),
            );
        });

        it('throws when the feature flag is disabled', async () => {
            const fakes = createRegistryWithFakes();
            const { service, mocks } = createService(fakes.registry);
            mocks.featureFlagModel.get.mockResolvedValue({ enabled: false });

            await expect(
                service.executeSourceQuery({
                    account,
                    projectUuid,
                    query: {
                        sourceType: QuerySourceType.SQL,
                        sql: 'SELECT 1',
                    },
                    context: QueryExecutionContext.MULTI_SOURCE_QUERY,
                }),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('executeQueryDag validation', () => {
        const execute = (nodes: QueryDagNodeRequest[]) => {
            const fakes = createRegistryWithFakes();
            const { service } = createService(fakes.registry);
            return service.executeQueryDag({
                account,
                projectUuid,
                nodes,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });
        };

        it('rejects an empty DAG', async () => {
            await expect(execute([])).rejects.toThrow(ParameterError);
        });

        it('rejects duplicate node ids', async () => {
            await expect(
                execute([
                    {
                        nodeId: 'a',
                        query: {
                            sourceType: QuerySourceType.SQL,
                            sql: 'SELECT 1',
                        },
                    },
                    {
                        nodeId: 'a',
                        query: {
                            sourceType: QuerySourceType.SQL,
                            sql: 'SELECT 2',
                        },
                    },
                ]),
            ).rejects.toThrow('Duplicate node id');
        });

        it('rejects invalid node ids', async () => {
            await expect(
                execute([
                    {
                        nodeId: '1-bad-id!',
                        query: {
                            sourceType: QuerySourceType.SQL,
                            sql: 'SELECT 1',
                        },
                    },
                ]),
            ).rejects.toThrow('Invalid node id');
        });

        it('rejects references that are neither node ids nor query uuids', async () => {
            await expect(
                execute([
                    {
                        nodeId: 'merge',
                        query: {
                            sourceType: QuerySourceType.DUCKDB,
                            sql: 'SELECT * FROM t',
                            references: { t: 'missing_node' },
                        },
                    },
                ]),
            ).rejects.toThrow('neither a node id');
        });

        it('allows references to existing results by query uuid', async () => {
            const results = await execute([
                {
                    nodeId: 'merge',
                    query: {
                        sourceType: QuerySourceType.DUCKDB,
                        sql: 'SELECT * FROM t',
                        references: {
                            t: '123e4567-e89b-12d3-a456-426614174000',
                        },
                    },
                },
            ]);
            expect(results.queryDagUuid).toEqual('test-dag-uuid');
        });

        it('rejects dependency cycles', async () => {
            await expect(
                execute([
                    {
                        nodeId: 'x',
                        query: {
                            sourceType: QuerySourceType.DUCKDB,
                            sql: 'SELECT * FROM t',
                            references: { t: 'y' },
                        },
                    },
                    {
                        nodeId: 'y',
                        query: {
                            sourceType: QuerySourceType.DUCKDB,
                            sql: 'SELECT * FROM t',
                            references: { t: 'x' },
                        },
                    },
                ]),
            ).rejects.toThrow('cycle');
        });
    });

    describe('executeQueryDag orchestration', () => {
        const dagNodes: QueryDagNodeRequest[] = [
            {
                nodeId: 'orders',
                query: { sourceType: QuerySourceType.SQL, sql: 'SELECT 1' },
            },
            {
                nodeId: 'revenue',
                query: {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    query: metricQueryRequest,
                },
            },
            {
                nodeId: 'merged',
                query: {
                    sourceType: QuerySourceType.DUCKDB,
                    sql: 'SELECT * FROM o JOIN r USING (id)',
                    references: { o: 'orders', r: 'revenue' },
                },
            },
        ];

        it('runs upstream nodes, resolves references, then runs dependents', async () => {
            const fakes = createRegistryWithFakes();
            const { service, mocks } = createService(fakes.registry);

            const results = await service.executeQueryDag({
                account,
                projectUuid,
                nodes: dagNodes,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });
            expect(results.status).toEqual(QueryDagStatus.PENDING);
            expect(results.nodes).toHaveLength(3);

            await waitForDagFinish(mocks);

            expect(fakes.duckdbSource.submitQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    resolvedReferences: {
                        orders: 'sql-query-uuid',
                        revenue: 'semanticLayer-query-uuid',
                    },
                }),
            );
            expect(mocks.queryDagModel.updateNode).toHaveBeenCalledWith(
                'test-dag-uuid',
                'merged',
                expect.objectContaining({
                    status: QueryDagNodeStatus.COMPLETED,
                }),
            );
            expect(mocks.queryDagModel.updateDag).toHaveBeenLastCalledWith(
                'test-dag-uuid',
                { status: QueryDagStatus.COMPLETED },
            );
        });

        it('skips dependents and fails the DAG when an upstream node fails', async () => {
            const fakes = createRegistryWithFakes();
            fakes.sqlSource.submitQuery.mockRejectedValue(
                new Error('warehouse exploded'),
            );
            const { service, mocks } = createService(fakes.registry);

            await service.executeQueryDag({
                account,
                projectUuid,
                nodes: dagNodes,
                context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            });
            await waitForDagFinish(mocks);

            expect(fakes.duckdbSource.submitQuery).not.toHaveBeenCalled();
            expect(mocks.queryDagModel.updateNode).toHaveBeenCalledWith(
                'test-dag-uuid',
                'orders',
                expect.objectContaining({
                    status: QueryDagNodeStatus.ERROR,
                    error: 'warehouse exploded',
                }),
            );
            expect(mocks.queryDagModel.updateNode).toHaveBeenCalledWith(
                'test-dag-uuid',
                'merged',
                expect.objectContaining({
                    status: QueryDagNodeStatus.SKIPPED,
                }),
            );
            // The independent node still completes
            expect(mocks.queryDagModel.updateNode).toHaveBeenCalledWith(
                'test-dag-uuid',
                'revenue',
                expect.objectContaining({
                    status: QueryDagNodeStatus.COMPLETED,
                }),
            );
            expect(mocks.queryDagModel.updateDag).toHaveBeenLastCalledWith(
                'test-dag-uuid',
                expect.objectContaining({ status: QueryDagStatus.ERROR }),
            );
        });
    });

    describe('getQueryDag', () => {
        it('is creator-only', async () => {
            const fakes = createRegistryWithFakes();
            const { service, mocks } = createService(fakes.registry);
            mocks.queryDagModel.get.mockResolvedValue({
                queryDagUuid: 'test-dag-uuid',
                projectUuid,
                status: QueryDagStatus.COMPLETED,
                error: null,
                createdAt: new Date(),
                nodes: [],
                organizationUuid,
                createdByUserUuid: 'someone-else',
            });

            await expect(
                service.getQueryDag(account, projectUuid, 'test-dag-uuid'),
            ).rejects.toThrow(ForbiddenError);
        });

        it('returns the dag without ownership fields for its creator', async () => {
            const fakes = createRegistryWithFakes();
            const { service, mocks } = createService(fakes.registry);
            const createdAt = new Date();
            mocks.queryDagModel.get.mockResolvedValue({
                queryDagUuid: 'test-dag-uuid',
                projectUuid,
                status: QueryDagStatus.COMPLETED,
                error: null,
                createdAt,
                nodes: [],
                organizationUuid,
                createdByUserUuid: account.user.id,
            });

            const dag = await service.getQueryDag(
                account,
                projectUuid,
                'test-dag-uuid',
            );
            expect(dag).toEqual({
                queryDagUuid: 'test-dag-uuid',
                projectUuid,
                status: QueryDagStatus.COMPLETED,
                error: null,
                createdAt,
                nodes: [],
            });
        });
    });
});
