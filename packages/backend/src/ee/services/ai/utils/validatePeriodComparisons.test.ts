import {
    type CustomMetricBaseTransformed,
    type PeriodComparisonCustomMetric,
} from '@lightdash/ai';
import {
    DimensionType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    TimeFrames,
    type Explore,
} from '@lightdash/common';
import { validatePeriodComparisons } from './validators';

const baseExplore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'pop_explore',
    label: 'PoP Explore',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'test_db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            dimensions: {
                created_at_month: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'created_at_month',
                    label: 'Created at (Month)',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: "DATE_TRUNC('month', ${TABLE}.created_at)",
                    hidden: false,
                    source: undefined,
                    compiledSql: "DATE_TRUNC('month', orders.created_at)",
                    tablesReferences: ['orders'],
                    timeInterval: TimeFrames.MONTH,
                },
                created_at_day: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'created_at_day',
                    label: 'Created at (Day)',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: "DATE_TRUNC('day', ${TABLE}.created_at)",
                    hidden: false,
                    source: undefined,
                    compiledSql: "DATE_TRUNC('day', orders.created_at)",
                    tablesReferences: ['orders'],
                    timeInterval: TimeFrames.DAY,
                },
                region: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'region',
                    label: 'Region',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.region',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.region',
                    tablesReferences: ['orders'],
                },
            },
            metrics: {
                revenue: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'revenue',
                    label: 'Revenue',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'SUM(${TABLE}.amount)',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'SUM(orders.amount)',
                    tablesReferences: ['orders'],
                },
            },
            lineageGraph: {},
            groupLabel: undefined,
            requiredAttributes: undefined,
            primaryKey: undefined,
        },
    },
    spotlight: { visibility: 'show', categories: [] },
};

const customAvgRevenue: CustomMetricBaseTransformed = {
    table: 'orders',
    name: 'avg_revenue',
    label: 'Average revenue',
    description: '',
    type: MetricType.AVERAGE,
    baseDimensionName: 'amount',
    filters: undefined,
};

const validPc: PeriodComparisonCustomMetric = {
    kind: 'periodComparison',
    baseMetricId: 'orders_revenue',
    timeDimensionId: 'orders_created_at_month',
    granularity: TimeFrames.MONTH,
    periodOffset: 1,
};

describe('validatePeriodComparisons', () => {
    it('is a no-op for null', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                null,
                ['orders_created_at_month'],
                ['orders_revenue'],
                null,
            ),
        ).not.toThrow();
    });

    it('is a no-op for empty array', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [],
                ['orders_created_at_month'],
                ['orders_revenue'],
                null,
            ),
        ).not.toThrow();
    });

    it('passes a valid entry against a real metric', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [validPc],
                ['orders_created_at_month'],
                ['orders_revenue'],
                null,
            ),
        ).not.toThrow();
    });

    it('passes when base metric is a custom metric', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [
                    {
                        ...validPc,
                        baseMetricId: 'orders_avg_revenue',
                    },
                ],
                ['orders_created_at_month'],
                ['orders_revenue'],
                [customAvgRevenue],
            ),
        ).not.toThrow();
    });

    it('rejects when timeDimensionId is not in selected dimensions', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [validPc],
                ['orders_region'],
                ['orders_revenue'],
                null,
            ),
        ).toThrow(/orders_created_at_month/);
    });

    it('rejects when timeDimensionId is not a time-interval dimension', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [
                    {
                        ...validPc,
                        timeDimensionId: 'orders_region',
                    },
                ],
                ['orders_region'],
                ['orders_revenue'],
                null,
            ),
        ).toThrow(/time-interval dimension/);
    });

    it('rejects when granularity does not match the time dimension', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [
                    {
                        ...validPc,
                        timeDimensionId: 'orders_created_at_day',
                    },
                ],
                ['orders_created_at_day'],
                ['orders_revenue'],
                null,
            ),
        ).toThrow(/granularity/);
    });

    it('rejects when baseMetricId is unknown', () => {
        expect(() =>
            validatePeriodComparisons(
                baseExplore,
                [
                    {
                        ...validPc,
                        baseMetricId: 'orders_nonexistent',
                    },
                ],
                ['orders_created_at_month'],
                ['orders_revenue'],
                null,
            ),
        ).toThrow(/orders_nonexistent/);
    });
});
