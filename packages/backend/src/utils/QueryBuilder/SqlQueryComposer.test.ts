import {
    DimensionType,
    PivotConfiguration,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
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
});
