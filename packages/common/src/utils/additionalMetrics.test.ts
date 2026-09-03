import { type CompiledTable, type Explore } from '../types/explore';
import { CustomFormatType, DimensionType, MetricType } from '../types/field';
import { type AdditionalMetric } from '../types/metricQuery';
import { buildPopAdditionalMetric } from '../types/periodOverPeriodComparison';
import { TimeFrames } from '../types/timeFrames';
import {
    convertAdditionalMetric,
    getCompatibleDashboardMetrics,
    mergeDashboardCustomMetrics,
} from './additionalMetrics';

const baseTable: CompiledTable = {
    name: 'orders',
    label: 'Orders',
    database: 'db',
    schema: 'schema',
    sqlTable: 'orders',
    dimensions: {},
    metrics: {},
    lineageGraph: {},
} as unknown as CompiledTable;

describe('convertAdditionalMetric — PoP formatOptions inheritance', () => {
    it('preserves formatOptions when converting a PoP additional metric', () => {
        const baseMetric = {
            table: 'orders',
            name: 'total_revenue',
            label: 'Revenue',
            description: 'Total revenue',
            type: MetricType.SUM,
            sql: '${TABLE}.amount',
            formatOptions: {
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
            },
        };

        const { additionalMetric: pop } = buildPopAdditionalMetric({
            metric: baseMetric,
            timeDimensionId: 'orders_order_date_week',
            granularity: TimeFrames.WEEK,
            periodOffset: 1,
        });

        expect(pop.formatOptions).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
        });

        const result = convertAdditionalMetric({
            additionalMetric: pop,
            table: baseTable,
        });

        expect(result.formatOptions).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
        });
    });
});

describe('convertAdditionalMetric — baseDimensionType plumbing', () => {
    const tableWithDims = {
        ...baseTable,
        dimensions: {
            order_date: {
                name: 'order_date',
                type: DimensionType.DATE,
            },
            order_date_day: {
                name: 'order_date_day',
                type: DimensionType.DATE,
                timeInterval: TimeFrames.DAY,
            },
            amount: {
                name: 'amount',
                type: DimensionType.NUMBER,
            },
            created_at: {
                name: 'created_at',
                type: DimensionType.TIMESTAMP,
            },
        },
    } as unknown as CompiledTable;

    it('resolves baseDimensionType/Interval for a MIN/MAX over a day-grain DATE dimension', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'max_day',
                type: MetricType.MAX,
                sql: "DATE_TRUNC('DAY', ${TABLE}.order_date)",
                baseDimensionName: 'order_date_day',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toEqual(DimensionType.DATE);
        expect(result.baseDimensionTimeInterval).toEqual(TimeFrames.DAY);
    });

    it('leaves it undefined when there is no baseDimensionName (free-SQL custom metric)', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'max_expr',
                type: MetricType.MAX,
                sql: '${TABLE}.order_date',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toBeUndefined();
        expect(result.baseDimensionTimeInterval).toBeUndefined();
    });

    it('leaves it undefined for a non MIN/MAX metric', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'count_day',
                type: MetricType.COUNT_DISTINCT,
                sql: "DATE_TRUNC('DAY', ${TABLE}.order_date)",
                baseDimensionName: 'order_date_day',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toBeUndefined();
    });

    it('leaves it undefined for a non-temporal base (MAX over a number)', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'max_amount',
                type: MetricType.MAX,
                sql: '${TABLE}.amount',
                baseDimensionName: 'amount',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toBeUndefined();
    });

    it('records a TIMESTAMP base for a MIN/MAX over a TIMESTAMP dimension', () => {
        const result = convertAdditionalMetric({
            additionalMetric: {
                table: 'orders',
                name: 'min_created_at',
                type: MetricType.MIN,
                sql: '${TABLE}.created_at',
                baseDimensionName: 'created_at',
            },
            table: tableWithDims,
        });
        expect(result.baseDimensionType).toEqual(DimensionType.TIMESTAMP);
        expect(result.baseDimensionTimeInterval).toBeUndefined();
    });
});

describe('mergeDashboardCustomMetrics', () => {
    const metric = (
        table: string,
        name: string,
        overrides: Partial<AdditionalMetric> = {},
    ): AdditionalMetric => ({
        table,
        name,
        label: name,
        sql: '${TABLE}.amount',
        type: MetricType.SUM,
        ...overrides,
    });

    it('adds new chart metrics to the registry', () => {
        const registry = [metric('orders', 'total_revenue')];
        const result = mergeDashboardCustomMetrics(registry, [
            metric('orders', 'avg_basket'),
        ]);

        expect(result.map((m) => m.name)).toEqual([
            'total_revenue',
            'avg_basket',
        ]);
    });

    it('is idempotent for an identical definition', () => {
        const registry = [metric('orders', 'total_revenue')];
        const result = mergeDashboardCustomMetrics(registry, [
            metric('orders', 'total_revenue'),
        ]);

        expect(result).toBe(registry);
    });

    it('keeps the existing registry definition when the same (table, name) reappears', () => {
        const registry = [metric('orders', 'total_revenue')];
        const result = mergeDashboardCustomMetrics(registry, [
            metric('orders', 'total_revenue', { sql: '${TABLE}.other_column' }),
        ]);

        expect(result).toBe(registry);
        expect(result[0].sql).toEqual('${TABLE}.amount');
    });

    it('lets the same name coexist on different tables', () => {
        const registry = [metric('orders', 'total')];
        const result = mergeDashboardCustomMetrics(registry, [
            metric('payments', 'total'),
        ]);

        expect(result).toHaveLength(2);
        expect(result.map((m) => m.table)).toEqual(['orders', 'payments']);
    });

    it('never admits system-generated metrics', () => {
        const result = mergeDashboardCustomMetrics(
            [],
            [
                metric('orders', 'total_revenue_previous_week', {
                    generationType: 'periodOverPeriod',
                }),
            ],
        );

        expect(result).toEqual([]);
    });

    it('returns the original array identity when nothing was added', () => {
        const registry = [metric('orders', 'total_revenue')];
        const result = mergeDashboardCustomMetrics(registry, []);

        expect(result).toBe(registry);
    });

    it('deduplicates within the incoming chart metrics', () => {
        const result = mergeDashboardCustomMetrics(
            [],
            [
                metric('orders', 'total_revenue'),
                metric('orders', 'total_revenue', {
                    sql: '${TABLE}.other_column',
                }),
            ],
        );

        expect(result).toHaveLength(1);
        expect(result[0].sql).toEqual('${TABLE}.amount');
    });
});

describe('getCompatibleDashboardMetrics', () => {
    const explore = {
        tables: {
            orders: {
                dimensions: {
                    amount: {},
                    status: {},
                    order_id: {},
                },
                metrics: {
                    total_amount: {},
                },
            },
            customers: {
                dimensions: {
                    customer_id: {},
                },
                metrics: {},
            },
        },
    } as unknown as Explore;

    const metric = (
        overrides: Partial<AdditionalMetric> = {},
    ): AdditionalMetric => ({
        table: 'orders',
        name: 'custom_metric',
        label: 'Custom metric',
        sql: '${TABLE}.amount',
        type: MetricType.SUM,
        ...overrides,
    });

    it('returns nothing without an explore', () => {
        expect(getCompatibleDashboardMetrics([metric()], undefined)).toEqual(
            [],
        );
    });

    it('omits metrics whose owning table is missing', () => {
        const result = getCompatibleDashboardMetrics(
            [metric(), metric({ table: 'payments', name: 'other' })],
            explore,
        );
        expect(result.map((m) => m.name)).toEqual(['custom_metric']);
    });

    it('requires the base dimension to exist on the owning table', () => {
        const result = getCompatibleDashboardMetrics(
            [
                metric({ baseDimensionName: 'amount' }),
                metric({ name: 'bad', baseDimensionName: 'deleted_column' }),
            ],
            explore,
        );
        expect(result.map((m) => m.name)).toEqual(['custom_metric']);
    });

    it('requires the base metric to exist on the owning table', () => {
        const result = getCompatibleDashboardMetrics(
            [
                metric({ baseMetricName: 'total_amount' }),
                metric({ name: 'bad', baseMetricName: 'deleted_metric' }),
            ],
            explore,
        );
        expect(result.map((m) => m.name)).toEqual(['custom_metric']);
    });

    it('requires every filter target field to exist', () => {
        const filterOn = (fieldRef: string) =>
            [
                {
                    id: 'f1',
                    target: { fieldRef },
                    operator: 'equals',
                    values: ['x'],
                },
            ] as AdditionalMetric['filters'];

        const result = getCompatibleDashboardMetrics(
            [
                metric({ filters: filterOn('orders.status') }),
                // Bare ref resolves against the owning table
                metric({ name: 'bare', filters: filterOn('status') }),
                metric({
                    name: 'joined',
                    filters: filterOn('customers.customer_id'),
                }),
                metric({
                    name: 'bad',
                    filters: filterOn('orders.deleted_column'),
                }),
                metric({
                    name: 'bad_table',
                    filters: filterOn('payments.status'),
                }),
            ],
            explore,
        );
        expect(result.map((m) => m.name)).toEqual([
            'custom_metric',
            'bare',
            'joined',
        ]);
    });

    it('resolves references case-insensitively like the compiler (uppercased timeframe keys)', () => {
        const exploreWithTimeframes = {
            tables: {
                orders: {
                    dimensions: { order_date_DAY: {} },
                    metrics: {},
                },
            },
        } as unknown as Explore;

        const result = getCompatibleDashboardMetrics(
            [
                metric({
                    filters: [
                        {
                            id: 'f1',
                            target: { fieldRef: 'orders.order_date_day' },
                            operator: 'equals',
                            values: ['2026-01-01'],
                        },
                    ] as AdditionalMetric['filters'],
                }),
            ],
            exploreWithTimeframes,
        );

        expect(result.map((m) => m.name)).toEqual(['custom_metric']);
    });

    it('requires every distinctKeys field to exist', () => {
        const result = getCompatibleDashboardMetrics(
            [
                metric({ distinctKeys: ['orders.order_id'] }),
                metric({
                    name: 'wrapped',
                    distinctKeys: ['${orders.order_id}'],
                }),
                metric({
                    name: 'bad',
                    distinctKeys: ['orders.deleted_column'],
                }),
            ],
            explore,
        );
        expect(result.map((m) => m.name)).toEqual(['custom_metric', 'wrapped']);
    });
});
