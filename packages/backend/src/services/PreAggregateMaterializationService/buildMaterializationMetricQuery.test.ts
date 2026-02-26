import {
    DimensionType,
    FieldType,
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
                        aggregation: 'sum',
                    },
                ],
            });
        },
    );
});
