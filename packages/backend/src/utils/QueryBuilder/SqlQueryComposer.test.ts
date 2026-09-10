import {
    DimensionType,
    FilterOperator,
    PivotConfiguration,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type DashboardFilters,
} from '@lightdash/common';
import { warehouseClientMock } from './MetricQueryBuilder.mock';
import {
    SQL_QUERY_MOCK_EXPLORER_NAME,
    SqlQueryColumn,
    SqlQueryComposer,
} from './SqlQueryComposer';

const USER_SQL = 'SELECT category, region, revenue FROM sales';

const COLUMNS: SqlQueryColumn[] = [
    { name: 'category', type: DimensionType.STRING },
    { name: 'region', type: DimensionType.STRING },
    { name: 'revenue', type: DimensionType.NUMBER },
];

const PIVOT_CONFIGURATION: PivotConfiguration = {
    indexColumn: [{ reference: 'category', type: VizIndexType.CATEGORY }],
    valuesColumns: [
        { reference: 'revenue', aggregation: VizAggregationOptions.SUM },
    ],
    groupByColumns: [{ reference: 'region' }],
    sortBy: [{ reference: 'category', direction: SortByDirection.ASC }],
};

const baseArgs = {
    userSql: USER_SQL,
    columns: COLUMNS,
    warehouseClient: warehouseClientMock,
    limit: 500,
    parameters: undefined,
    dashboardFilters: undefined,
    tileUuid: undefined,
    dashboardSorts: undefined,
};

describe('SqlQueryComposer', () => {
    it('wraps the user SQL and builds the mock metric query when there is no pivot', () => {
        const composer = new SqlQueryComposer({
            ...baseArgs,
            pivotConfiguration: undefined,
        });

        const compiled = composer.compile();

        // No filters and a user FROM subquery: the user SQL is returned with a
        // LIMIT appended rather than wrapped in an outer SELECT (PROD-7880).
        expect(compiled.query).toMatchSnapshot();
        // Without a pivot, getSql returns the base query.
        expect(composer.getSql({ columnLimit: 100 })).toBe(compiled.query);

        // Mock MetricQuery metadata carrier built from the discovered columns.
        const metricQuery = composer.getMetricQuery();
        expect(metricQuery.exploreName).toBe(SQL_QUERY_MOCK_EXPLORER_NAME);
        expect(metricQuery.metrics).toEqual([]);
        expect(metricQuery.dimensions).toEqual([
            `${SQL_QUERY_MOCK_EXPLORER_NAME}_category`,
            `${SQL_QUERY_MOCK_EXPLORER_NAME}_region`,
            `${SQL_QUERY_MOCK_EXPLORER_NAME}_revenue`,
        ]);
        expect(composer.getExplore().name).toBe(SQL_QUERY_MOCK_EXPLORER_NAME);
    });

    it('exposes no items at the results seam', () => {
        // The virtual view's dimensions serve SQL generation only. Exposing
        // them through getFields() would persist fake semantic fields to
        // query_history.fields on every SQL and compose execution.
        const composer = new SqlQueryComposer({
            ...baseArgs,
            pivotConfiguration: undefined,
        });

        expect(composer.getFields()).toEqual({});
        // SQL generation still reads the virtual-view items internally.
        expect(Object.keys(composer.compile().fields)).toContain(
            `${SQL_QUERY_MOCK_EXPLORER_NAME}_category`,
        );
    });

    it('wraps the base query with the pivot query when a pivot is set', () => {
        const composer = new SqlQueryComposer({
            ...baseArgs,
            pivotConfiguration: PIVOT_CONFIGURATION,
        });

        const sql = composer.getSql({ columnLimit: 100 });

        // The pivot SQL wraps (and therefore differs from) the base query.
        expect(sql).not.toBe(composer.compile().query);
        expect(sql).toMatchSnapshot();
        expect(composer.getPivotConfiguration()).toBe(PIVOT_CONFIGURATION);
    });

    it('hoists leading scripting statements above the pivot query', () => {
        const composer = new SqlQueryComposer({
            ...baseArgs,
            userSql: `DECLARE lookback_days INT64 DEFAULT 30;\n${USER_SQL} WHERE days > lookback_days;`,
            pivotConfiguration: PIVOT_CONFIGURATION,
        });

        const sql = composer.getSql({ columnLimit: 100 });

        expect(
            sql.startsWith('DECLARE lookback_days INT64 DEFAULT 30;\nWITH'),
        ).toBe(true);
        expect(sql).not.toContain('(DECLARE');
        expect(sql).toContain(
            'original_query AS (SELECT category, region, revenue FROM sales WHERE days > lookback_days)',
        );
    });

    it('hoists scripting statements before applying dashboard filters', () => {
        const dashboardFilters: DashboardFilters = {
            dimensions: [
                {
                    id: 'filter-category',
                    label: undefined,
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'category',
                        tableName: SQL_QUERY_MOCK_EXPLORER_NAME,
                        isSqlColumn: true,
                        fallbackType: DimensionType.STRING,
                    },
                    values: ['hardware'],
                    tileTargets: {
                        tile_1: {
                            fieldId: 'category',
                            tableName: SQL_QUERY_MOCK_EXPLORER_NAME,
                            isSqlColumn: true,
                            fallbackType: DimensionType.STRING,
                        },
                    },
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        const composer = new SqlQueryComposer({
            ...baseArgs,
            userSql: `DECLARE lookback_days INT64 DEFAULT 30;\n${USER_SQL} WHERE days > lookback_days;`,
            dashboardFilters,
            tileUuid: 'tile_1',
            pivotConfiguration: PIVOT_CONFIGURATION,
        });

        const sql = composer.getSql({ columnLimit: 100 });

        expect(
            sql.startsWith('DECLARE lookback_days INT64 DEFAULT 30;\nWITH'),
        ).toBe(true);
        expect(sql).not.toContain('(DECLARE');
        expect(sql).toContain('("category") IN (\'hardware\')');
    });

    it('escapes active quote characters in raw SQL chart column references', () => {
        const dashboardFilters: DashboardFilters = {
            dimensions: [
                {
                    id: 'filter-total-revenue',
                    label: undefined,
                    operator: FilterOperator.GREATER_THAN,
                    target: {
                        fieldId: 'total"revenue',
                        tableName: SQL_QUERY_MOCK_EXPLORER_NAME,
                        isSqlColumn: true,
                        fallbackType: DimensionType.NUMBER,
                    },
                    values: [100],
                    tileTargets: {
                        tile_1: {
                            fieldId: 'total"revenue',
                            tableName: SQL_QUERY_MOCK_EXPLORER_NAME,
                            isSqlColumn: true,
                            fallbackType: DimensionType.NUMBER,
                        },
                    },
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        const composer = new SqlQueryComposer({
            ...baseArgs,
            columns: [{ name: 'total"revenue', type: DimensionType.NUMBER }],
            dashboardFilters,
            tileUuid: 'tile_1',
            pivotConfiguration: undefined,
        });

        expect(
            composer.getExplore().tables[SQL_QUERY_MOCK_EXPLORER_NAME]
                .dimensions['total"revenue'].sql,
        ).toBe('"total""revenue"');
        expect(composer.compile().query).toContain(
            '("total""revenue") > (100)',
        );
    });
});
