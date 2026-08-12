import {
    ExploreType,
    QueryExecutionContext,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { PreAggregateStrategy } from './PreAggregateStrategy';
import { type PreAggregationDuckDbClient } from './PreAggregationDuckDbClient';
import { type PreAggregationExternalResolver } from './PreAggregationExternalResolver';

const makeStrategy = () => {
    const duckDbClient = {
        resolve: vi.fn().mockResolvedValue({
            resolved: true,
            query: 'SELECT duckdb',
            warehouseClient: {},
        }),
    };
    const externalResolver = {
        resolve: vi.fn().mockResolvedValue({
            resolved: true,
            query: 'SELECT external',
        }),
    };
    const strategy = new PreAggregateStrategy({
        preAggregationDuckDbClient:
            duckDbClient as unknown as PreAggregationDuckDbClient,
        preAggregationExternalResolver:
            externalResolver as unknown as PreAggregationExternalResolver,
        preAggregateDailyStatsModel: {} as never,
        preAggregateResultsStorageClient: {} as never,
        isEnabled: () => true,
        dashboardModel: {} as never,
        savedChartModel: {} as never,
        projectService: {} as never,
    });
    return { strategy, duckDbClient, externalResolver };
};

const resolveExecutionParams = (externalTable?: string) => ({
    projectUuid: 'projectUuid',
    queryUuid: 'queryUuid',
    warehouseQuery: 'SELECT warehouse',
    preAggregationRoute: {
        sourceExploreName: 'orders',
        preAggregateName: 'rollup',
        mode: 'opportunistic' as const,
        ...(externalTable ? { externalTable } : {}),
    },
    resolveArgs: {
        metricQuery: {} as MetricQuery,
        timezone: 'UTC',
        dateZoom: undefined,
        parameters: undefined,
        fieldsMap: {},
        pivotConfiguration: undefined,
        startOfWeek: undefined,
        userAccessControls: {
            userAttributes: {},
            intrinsicUserAttributes: {},
        },
        availableParameterDefinitions: {},
    },
});

describe('PreAggregateStrategy.resolveExecution', () => {
    test('managed routes resolve via DuckDB with duckdb execution', async () => {
        const { strategy, duckDbClient, externalResolver } = makeStrategy();

        const result = await strategy.resolveExecution(
            resolveExecutionParams(),
        );

        expect(result).toEqual({
            resolved: true,
            query: 'SELECT duckdb',
            execution: 'duckdb',
        });
        expect(duckDbClient.resolve).toHaveBeenCalledTimes(1);
        expect(externalResolver.resolve).not.toHaveBeenCalled();
    });

    test('external routes resolve via the external resolver with project_warehouse execution', async () => {
        const { strategy, duckDbClient, externalResolver } = makeStrategy();

        const result = await strategy.resolveExecution(
            resolveExecutionParams('"analytics"."orders_rollup_mv"'),
        );

        expect(result).toEqual({
            resolved: true,
            query: 'SELECT external',
            execution: 'project_warehouse',
        });
        expect(externalResolver.resolve).toHaveBeenCalledTimes(1);
        expect(duckDbClient.resolve).not.toHaveBeenCalled();
    });
});

describe('PreAggregateStrategy.getRoutingDecision', () => {
    test('carries the external table onto the route for matched external defs', () => {
        const { strategy } = makeStrategy();
        const explore = {
            name: 'orders',
            baseTable: 'orders',
            tables: {
                orders: {
                    dimensions: {
                        status: {
                            name: 'status',
                            table: 'orders',
                            fieldType: 'dimension',
                            type: 'string',
                            hidden: false,
                        },
                    },
                    metrics: {},
                },
            },
            preAggregates: [
                {
                    name: 'rollup',
                    dimensions: ['status'],
                    metrics: [],
                    table: '"analytics"."orders_rollup_mv"',
                },
            ],
        } as unknown as Explore;

        const decision = strategy.getRoutingDecision({
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
            explore,
            context: QueryExecutionContext.EXPLORE,
        });

        expect(decision).toEqual(
            expect.objectContaining({
                target: 'pre_aggregate',
                route: {
                    sourceExploreName: 'orders',
                    preAggregateName: 'rollup',
                    mode: 'opportunistic',
                    externalTable: '"analytics"."orders_rollup_mv"',
                },
            }),
        );
    });

    test('carries the external table onto required routes for direct pre-aggregate explores', () => {
        const { strategy } = makeStrategy();
        const decision = strategy.getRoutingDecision({
            metricQuery: {} as MetricQuery,
            explore: {
                name: '__preagg__orders__rollup',
                type: ExploreType.PRE_AGGREGATE,
                preAggregateSource: {
                    sourceExploreName: 'orders',
                    preAggregateName: 'rollup',
                    externalTable: '"analytics"."orders_rollup_mv"',
                },
            } as unknown as Explore,
            context: QueryExecutionContext.EXPLORE,
        });

        expect(decision).toEqual(
            expect.objectContaining({
                target: 'pre_aggregate',
                route: {
                    sourceExploreName: 'orders',
                    preAggregateName: 'rollup',
                    mode: 'required',
                    externalTable: '"analytics"."orders_rollup_mv"',
                },
            }),
        );
    });
});
