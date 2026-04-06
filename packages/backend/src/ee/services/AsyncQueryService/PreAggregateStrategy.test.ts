import {
    DimensionType,
    ExploreType,
    FieldType,
    MetricType,
    QueryExecutionContext,
    SupportedDbtAdapter,
    TimeFrames,
    getItemId,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
} from '@lightdash/common';
import { buildMaterializationMetricQuery } from '../PreAggregateMaterializationService/buildMaterializationMetricQuery';
import { PreAggregateStrategy } from './PreAggregateStrategy';

const makeDimension = ({
    name,
    type = DimensionType.STRING,
    timeInterval,
    timeIntervalBaseDimensionName,
}: {
    name: string;
    type?: DimensionType;
    timeInterval?: TimeFrames;
    timeIntervalBaseDimensionName?: string;
}): CompiledDimension => ({
    index: 0,
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label: name,
    sql: '${TABLE}.x',
    table: 'orders',
    tableLabel: 'orders',
    hidden: false,
    compiledSql: '"orders".x',
    tablesReferences: ['orders'],
    ...(timeInterval ? { timeInterval } : {}),
    ...(timeIntervalBaseDimensionName ? { timeIntervalBaseDimensionName } : {}),
});

const makeMetric = ({
    name,
    type,
    tablesReferences,
}: {
    name: string;
    type: MetricType;
    tablesReferences?: string[];
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    sql: '${TABLE}.x',
    table: 'orders',
    tableLabel: 'orders',
    hidden: false,
    compiledSql: 'SUM("orders".x)',
    tablesReferences: tablesReferences ?? ['orders'],
});

describe('EE PreAggregateStrategy', () => {
    test('returns a materialization access plan for generated materialization metric queries', () => {
        const explore: Explore = {
            name: 'orders',
            label: 'Orders',
            tags: [],
            baseTable: 'orders',
            type: ExploreType.DEFAULT,
            joinedTables: [],
            targetDatabase: SupportedDbtAdapter.POSTGRES,
            tables: {
                orders: {
                    name: 'orders',
                    label: 'Orders',
                    database: 'db',
                    schema: 'public',
                    sqlTable: 'orders',
                    dimensions: {
                        status: makeDimension({ name: 'status' }),
                        order_date: makeDimension({
                            name: 'order_date',
                            type: DimensionType.DATE,
                        }),
                        order_date_day: makeDimension({
                            name: 'order_date_day',
                            type: DimensionType.DATE,
                            timeInterval: TimeFrames.DAY,
                            timeIntervalBaseDimensionName: 'order_date',
                        }),
                    },
                    metrics: {
                        avg_order_amount: makeMetric({
                            name: 'avg_order_amount',
                            type: MetricType.AVERAGE,
                            tablesReferences: ['orders', 'customers'],
                        }),
                    },
                    lineageGraph: {},
                },
                customers: {
                    name: 'customers',
                    label: 'Customers',
                    database: 'db',
                    schema: 'public',
                    sqlTable: 'customers',
                    dimensions: {},
                    metrics: {},
                    lineageGraph: {},
                },
            },
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status'],
                    metrics: ['avg_order_amount'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const materializationMetricQuery = buildMaterializationMetricQuery({
            sourceExplore: explore,
            preAggregateDef: explore.preAggregates![0],
            materializationConfig: {
                maxRows: null,
            },
        });

        const strategy = new PreAggregateStrategy({
            preAggregationDuckDbClient: {} as never,
            preAggregateDailyStatsModel: {} as never,
            preAggregateResultsStorageClient: {} as never,
            isEnabled: () => true,
        });

        const result = strategy.getRoutingDecision({
            metricQuery: materializationMetricQuery.metricQuery,
            explore,
            context: QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
        });

        expect(result).toEqual({
            target: 'materialization',
            preAggregateMetadata: {
                hit: true,
                name: 'orders_daily',
                reason: {
                    reason: 'custom_metric_present',
                },
            },
            materializationAccessPlan: {
                tableNames: ['orders', 'customers'],
                dimensionFieldIds: ['orders_status', 'orders_order_date_day'],
                metricFieldIds: [getItemId(explore.tables.orders.metrics.avg_order_amount)],
            },
        });
    });
});
