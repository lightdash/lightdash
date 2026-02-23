import { SupportedDbtAdapter } from '../types/dbt';
import { type Explore } from '../types/explore';
import {
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
} from '../types/field';
import { FilterOperator } from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import { PreAggregateMissReason } from '../types/preAggregate';
import { TimeFrames } from '../types/timeFrames';
import { findMatch } from './matcher';

const makeDimension = ({
    name,
    table = 'orders',
    type = DimensionType.STRING,
    timeInterval,
    timeIntervalBaseDimensionName,
}: {
    name: string;
    table?: string;
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
    table,
    tableLabel: table,
    hidden: false,
    compiledSql: 'x',
    tablesReferences: [],
    ...(timeInterval ? { timeInterval } : {}),
    ...(timeIntervalBaseDimensionName ? { timeIntervalBaseDimensionName } : {}),
});

const makeMetric = ({
    name,
    type,
    table = 'orders',
}: {
    name: string;
    type: MetricType;
    table?: string;
}): CompiledMetric => ({
    index: 0,
    fieldType: FieldType.METRIC,
    type,
    name,
    label: name,
    sql: '${TABLE}.x',
    table,
    tableLabel: table,
    hidden: false,
    compiledSql: 'x',
    tablesReferences: [],
});

const baseExplore = (): Explore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
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
                order_date_month: makeDimension({
                    name: 'order_date_month',
                    type: DimensionType.DATE,
                    timeInterval: TimeFrames.MONTH,
                    timeIntervalBaseDimensionName: 'order_date',
                }),
            },
            metrics: {
                total_order_amount: makeMetric({
                    name: 'total_order_amount',
                    type: MetricType.SUM,
                }),
                order_count: makeMetric({
                    name: 'order_count',
                    type: MetricType.COUNT,
                }),
                unique_customers: makeMetric({
                    name: 'unique_customers',
                    type: MetricType.COUNT_DISTINCT,
                }),
                custom_metric: makeMetric({
                    name: 'custom_metric',
                    type: MetricType.NUMBER,
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
            dimensions: {
                first_name: makeDimension({
                    name: 'first_name',
                    table: 'customers',
                }),
            },
            metrics: {},
            lineageGraph: {},
        },
    },
});

const makeMetricQuery = (
    partial: Partial<MetricQuery> & Pick<MetricQuery, 'dimensions' | 'metrics'>,
): MetricQuery => ({
    exploreName: 'orders',
    dimensions: partial.dimensions,
    metrics: partial.metrics,
    filters: partial.filters || {},
    sorts: partial.sorts || [],
    limit: partial.limit || 500,
    tableCalculations: partial.tableCalculations || [],
    ...(partial.additionalMetrics
        ? { additionalMetrics: partial.additionalMetrics }
        : {}),
    ...(partial.customDimensions
        ? { customDimensions: partial.customDimensions }
        : {}),
});

describe('findMatch', () => {
    it('returns no_pre_aggregates_defined when explore has no pre-aggregates', () => {
        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            baseExplore(),
        );

        expect(result).toStrictEqual({
            hit: false,
            preAggregateName: null,
            miss: {
                reason: PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED,
            },
        });
    });

    it('returns hit when dimensions and metrics match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count', 'total_order_amount'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status', 'orders_order_date_month'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_daily',
            miss: null,
        });
    });

    it('returns dimension_not_in_pre_aggregate when query dimensions are missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'orders_status',
        });
    });

    it('returns metric_not_in_pre_aggregate when query metrics are missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.METRIC_NOT_IN_PRE_AGGREGATE,
            fieldId: 'orders_total_order_amount',
        });
    });

    it('returns non_additive_metric for non-reaggregatable metrics', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['unique_customers'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_unique_customers'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.NON_ADDITIVE_METRIC,
            fieldId: 'orders_unique_customers',
        });
    });

    it('returns custom_sql_metric for type:number metrics', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['custom_metric'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_custom_metric'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.CUSTOM_SQL_METRIC,
            fieldId: 'orders_custom_metric',
        });
    });

    it('returns filter_dimension_not_in_pre_aggregate when dimension filter is missing', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: '1',
                        and: [
                            {
                                id: '2',
                                operator: FilterOperator.EQUALS,
                                target: { fieldId: 'customers_first_name' },
                                values: ['John'],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason:
                PreAggregateMissReason.FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
            fieldId: 'customers_first_name',
        });
    });

    it('returns granularity_too_fine when query granularity is finer than rollup', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_monthly',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.MONTH,
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.GRANULARITY_TOO_FINE,
            fieldId: 'orders_order_date_day',
            queryGranularity: TimeFrames.DAY,
            preAggregateGranularity: TimeFrames.MONTH,
            preAggregateTimeDimension: 'order_date',
        });
    });

    it('accepts coarser query granularity than rollup', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_daily',
                    dimensions: ['order_date'],
                    metrics: ['order_count'],
                    timeDimension: 'order_date',
                    granularity: TimeFrames.DAY,
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('returns custom_dimension_present when custom dimensions exist', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                customDimensions: [
                    {
                        id: 'custom_1',
                        type: CustomDimensionType.SQL,
                        name: 'Custom',
                        table: 'orders',
                        sql: '1',
                        dimensionType: DimensionType.NUMBER,
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.CUSTOM_DIMENSION_PRESENT,
        });
    });

    it('returns table_calculation_present when table calculations exist', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                tableCalculations: [
                    {
                        name: 'calc_1',
                        displayName: 'Calc',
                        sql: '1',
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.TABLE_CALCULATION_PRESENT,
        });
    });

    it('returns custom_metric_present when additional metrics exist', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_summary',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                additionalMetrics: [
                    {
                        name: 'custom',
                        table: 'orders',
                        type: MetricType.SUM,
                        sql: '${TABLE}.amount',
                    },
                ],
            }),
            explore,
        );

        expect(result.miss).toStrictEqual({
            reason: PreAggregateMissReason.CUSTOM_METRIC_PRESENT,
        });
    });

    it('picks the smallest matching pre-aggregate', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_large',
                    dimensions: ['status', 'order_date'],
                    metrics: ['order_count'],
                },
                {
                    name: 'orders_small',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_small',
            miss: null,
        });
    });

    it('uses metrics count as tie-breaker when dimensions count is equal', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'orders_wider_metrics',
                    dimensions: ['status'],
                    metrics: ['order_count', 'total_order_amount'],
                },
                {
                    name: 'orders_narrow_metrics',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result).toStrictEqual({
            hit: true,
            preAggregateName: 'orders_narrow_metrics',
            miss: null,
        });
    });

    it('matches joined dimension references in dot notation', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'customer_rollup',
                    dimensions: ['customers.first_name'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['customers_first_name'],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('extracts nested filter group dimensions', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'customer_rollup',
                    dimensions: ['status', 'customers.first_name'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: ['orders_order_count'],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'or1',
                                or: [
                                    {
                                        id: 'f1',
                                        operator: FilterOperator.EQUALS,
                                        target: {
                                            fieldId: 'customers_first_name',
                                        },
                                        values: ['A'],
                                    },
                                    {
                                        id: 'f2',
                                        operator: FilterOperator.EQUALS,
                                        target: { fieldId: 'orders_status' },
                                        values: ['completed'],
                                    },
                                ],
                            },
                        ],
                    },
                },
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('allows dimensions-only queries when dimensions match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'status_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: ['orders_status'],
                metrics: [],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });

    it('allows metrics-only queries when metrics match', () => {
        const explore = {
            ...baseExplore(),
            preAggregates: [
                {
                    name: 'metric_rollup',
                    dimensions: ['status'],
                    metrics: ['order_count'],
                },
            ],
        };

        const result = findMatch(
            makeMetricQuery({
                dimensions: [],
                metrics: ['orders_order_count'],
            }),
            explore,
        );

        expect(result.hit).toBe(true);
    });
});
