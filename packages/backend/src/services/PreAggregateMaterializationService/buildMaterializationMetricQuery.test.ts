import {
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    type Explore,
    type PreAggregateDef,
} from '@lightdash/common';
import { buildMaterializationMetricQuery } from './buildMaterializationMetricQuery';

const getSourceExplore = (): Explore =>
    ({
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
                database: 'analytics',
                schema: 'public',
                sqlTable: 'public.orders',
                dimensions: {
                    status: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: 'status',
                        label: 'Status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.status',
                        hidden: false,
                        compiledSql: '"orders".status',
                        tablesReferences: ['orders'],
                    },
                    order_date: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        name: 'order_date',
                        label: 'Order date',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.order_date',
                        hidden: false,
                        compiledSql: '"orders".order_date',
                        tablesReferences: ['orders'],
                    },
                    order_date_day: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        name: 'order_date_day',
                        label: 'Order date day',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.order_date_day',
                        hidden: false,
                        compiledSql: '"orders".order_date_day',
                        tablesReferences: ['orders'],
                        timeInterval: TimeFrames.DAY,
                        timeIntervalBaseDimensionName: 'order_date',
                    },
                },
                metrics: {
                    order_count: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.COUNT,
                        name: 'order_count',
                        label: 'Order count',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: 'count(*)',
                        hidden: false,
                        compiledSql: 'count(*)',
                        tablesReferences: ['orders'],
                    },
                    avg_order_amount: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.AVERAGE,
                        name: 'avg_order_amount',
                        label: 'Average order amount',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.amount',
                        hidden: false,
                        compiledSql: 'AVG("orders".amount)',
                        tablesReferences: ['orders'],
                        filters: [
                            {
                                id: 'avg-order-amount-filter',
                                target: {
                                    fieldRef: 'status',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                        ],
                    },
                    avg_order_amount__sum: {
                        fieldType: FieldType.METRIC,
                        type: MetricType.SUM,
                        name: 'avg_order_amount__sum',
                        label: 'Average order amount sum collision',
                        table: 'orders',
                        tableLabel: 'Orders',
                        sql: '${TABLE}.amount',
                        hidden: false,
                        compiledSql: 'SUM("orders".amount)',
                        tablesReferences: ['orders'],
                    },
                },
                lineageGraph: {},
            },
        },
    }) as Explore;

describe('buildMaterializationMetricQuery', () => {
    it('includes the time dimension with the configured granularity when omitted from dimensions', () => {
        const preAggregateDef: PreAggregateDef = {
            name: 'orders_rollup',
            dimensions: ['status'],
            metrics: ['orders_order_count'],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
        };

        const result = buildMaterializationMetricQuery({
            sourceExplore: getSourceExplore(),
            preAggregateDef,
        });

        expect(result.metricQuery.dimensions).toEqual(
            expect.arrayContaining(['orders_status', 'orders_order_date_day']),
        );
        expect(result.metricQuery.dimensions).toHaveLength(2);
    });

    it('does not duplicate the time dimension when it is already part of the definition', () => {
        const preAggregateDef: PreAggregateDef = {
            name: 'orders_rollup',
            dimensions: ['status', 'order_date'],
            metrics: ['orders_order_count'],
            timeDimension: 'order_date',
            granularity: TimeFrames.DAY,
        };

        const result = buildMaterializationMetricQuery({
            sourceExplore: getSourceExplore(),
            preAggregateDef,
        });

        expect(
            result.metricQuery.dimensions.filter(
                (fieldId) => fieldId === 'orders_order_date_day',
            ),
        ).toHaveLength(1);
        expect(result.metricQuery.dimensions).toHaveLength(2);
    });

    it.each(['order_count', 'orders.order_count'])(
        'resolves metric reference "%s" to field IDs',
        (metricReference) => {
            const preAggregateDef: PreAggregateDef = {
                name: 'orders_rollup',
                dimensions: ['status'],
                metrics: [metricReference],
            };

            const result = buildMaterializationMetricQuery({
                sourceExplore: getSourceExplore(),
                preAggregateDef,
            });

            expect(result.metricQuery.metrics).toEqual(['orders_order_count']);
            expect(result.metricComponents).toEqual({
                orders_order_count: [
                    {
                        componentFieldId: 'orders_order_count',
                        aggregation: MetricType.SUM,
                    },
                ],
            });
        },
    );

    it('decomposes average metrics into hidden sum and count component metrics', () => {
        const preAggregateDef: PreAggregateDef = {
            name: 'orders_rollup',
            dimensions: ['status'],
            metrics: ['avg_order_amount'],
        };

        const result = buildMaterializationMetricQuery({
            sourceExplore: getSourceExplore(),
            preAggregateDef,
        });

        expect(result.metricQuery.metrics).toEqual([
            'orders_avg_order_amount__sum',
            'orders_avg_order_amount__count',
        ]);
        expect(result.metricQuery.additionalMetrics).toEqual([
            {
                name: 'avg_order_amount__sum',
                table: 'orders',
                type: MetricType.SUM,
                sql: '${TABLE}.amount',
                hidden: true,
                filters: [
                    {
                        id: 'avg-order-amount-filter',
                        target: {
                            fieldRef: 'status',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                    },
                ],
            },
            {
                name: 'avg_order_amount__count',
                table: 'orders',
                type: MetricType.COUNT,
                sql: '${TABLE}.amount',
                hidden: true,
                filters: [
                    {
                        id: 'avg-order-amount-filter',
                        target: {
                            fieldRef: 'status',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                    },
                ],
            },
        ]);
        expect(result.metricComponents).toEqual({
            orders_avg_order_amount: [
                {
                    componentFieldId: 'orders_avg_order_amount__sum',
                    aggregation: MetricType.SUM,
                },
                {
                    componentFieldId: 'orders_avg_order_amount__count',
                    aggregation: MetricType.SUM,
                },
            ],
        });
    });

    it('throws when generated average metric component field IDs collide with selected metrics', () => {
        expect(() =>
            buildMaterializationMetricQuery({
                sourceExplore: getSourceExplore(),
                preAggregateDef: {
                    name: 'orders_rollup',
                    dimensions: ['status'],
                    metrics: ['avg_order_amount', 'avg_order_amount__sum'],
                },
            }),
        ).toThrow(
            'Pre-aggregate "orders_rollup" generates duplicate materialization metric field ID "orders_avg_order_amount__sum"',
        );
    });
});
