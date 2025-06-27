import {
    FilterOperator,
    type AndFilterGroup,
    type DashboardFilterRule,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type MetricFilterRule,
    type OrFilterGroup,
} from '../types/filter';
import {
    addDashboardFiltersToMetricQuery,
    addFilterRule,
    createFilterRuleFromModelRequiredFilterRule,
    getDashboardFilterRulesForTileAndReferences,
    isFilterRuleInQuery,
    overrideChartFilter,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
    trackWhichTimeBasedMetricFiltersToOverride,
} from './filters';
import {
    chartAndFilterGroup,
    chartOrFilterGroup,
    customSqlDimension,
    dashboardFilterWithSameTargetAndOperator,
    dashboardFilterWithSameTargetButDifferentOperator,
    dashboardFilters,
    dimension,
    expectedChartWithOverrideDashboardFilters,
    expectedChartWithOverrideDashboardORFilters,
    expectedFiltersWithCustomSqlDimension,
    expectedRequiredResetResult,
    expectedRequiredResult,
    filterRule,
    joinedModelRequiredFilterRule,
    metricQueryWithAndFilters,
    metricQueryWithOrFilters,
    mockExplore,
    mockExploreWithJoinedTable,
    modelRequiredFilterRule,
} from './filters.mock';

jest.mock('uuid', () => ({
    v4: jest.fn(() => 'uuid'),
}));

describe('addDashboardFiltersToMetricQuery', () => {
    test('should override the chart AND filter group with dashboard filters', async () => {
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithAndFilters,
            dashboardFilters,
        );
        expect(result).toEqual(expectedChartWithOverrideDashboardFilters);
    });
    test('should override the chart OR filter group with dashboard filters', async () => {
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithOrFilters,
            dashboardFilters,
        );
        expect(result).toEqual(expectedChartWithOverrideDashboardORFilters);
    });
});
describe('overrideChartFilter', () => {
    test('should override the chart and group filter', async () => {
        const result = overrideChartFilter(
            chartAndFilterGroup,
            dashboardFilterWithSameTargetAndOperator,
            {},
        );
        expect(result).toEqual({
            id: 'fillter-group-1',
            and: [
                {
                    id: '5',
                    target: { fieldId: 'field-1' },
                    values: ['1', '2', '3'],
                    disabled: false,
                    operator: FilterOperator.EQUALS,
                },
                {
                    id: '2',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: FilterOperator.EQUALS,
                },
            ],
        });
    });

    test('should override the chart or group filter', async () => {
        const result = overrideChartFilter(
            chartOrFilterGroup,
            dashboardFilterWithSameTargetAndOperator,
            {},
        );
        expect(result).toEqual({
            id: 'fillter-group-1',
            or: [
                {
                    id: '5',
                    target: { fieldId: 'field-1' },
                    values: ['1', '2', '3'],
                    disabled: false,
                    operator: FilterOperator.EQUALS,
                },
                {
                    id: '4',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: FilterOperator.EQUALS,
                },
            ],
        });
    });

    test('should override the chart group filter when operator is different', async () => {
        const result = overrideChartFilter(
            chartAndFilterGroup,
            dashboardFilterWithSameTargetButDifferentOperator,
            {},
        );
        expect(result).toEqual({
            id: 'fillter-group-1',
            and: [
                {
                    id: '5',
                    target: { fieldId: 'field-1' },
                    values: ['1', '2', '3'],
                    disabled: false,
                    operator: FilterOperator.NOT_EQUALS,
                },
                {
                    id: '2',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: FilterOperator.EQUALS,
                },
            ],
        });
    });
});

describe('addFilterRule', () => {
    test('should add custom sql dimension filter to dimensions group', async () => {
        const result = addFilterRule({
            filters: {},
            field: customSqlDimension,
        });
        expect(result).toEqual(expectedFiltersWithCustomSqlDimension);
    });
});

describe('createFilterRuleFromModelRequiredFilterRule', () => {
    test('should create a correct FilterRule', () => {
        const result = createFilterRuleFromModelRequiredFilterRule(
            modelRequiredFilterRule('dimension'),
            'tableName',
        );
        expect(result).toEqual(
            expectedRequiredResult('dimension', 'tableName'),
        );
    });
});

describe('isFilterRuleInQuery', () => {
    test('should correctly determine if a filter rule is in the query', () => {
        const filterGroupWithFilterRule: FilterGroup = {
            id: 'mockGroupId',
            and: [filterRule],
        };
        const filterGroupWithoutFilterRule: FilterGroup = {
            id: 'mockGroupId',
            and: [],
        };
        expect(
            isFilterRuleInQuery(
                dimension('dim', 'table'),
                filterRule,
                filterGroupWithFilterRule,
            ),
        ).toEqual(true);
        expect(
            isFilterRuleInQuery(
                dimension('dim', 'table'),
                filterRule,
                filterGroupWithoutFilterRule,
            ),
        ).toEqual(false);
    });
});

describe('reduceRequiredDimensionFiltersToFilterRules', () => {
    test('should correctly reduce required dimension filters to filter rules', () => {
        // Define mock data
        const mockRequiredFilters: MetricFilterRule[] = [
            modelRequiredFilterRule('order_date_week'),
            joinedModelRequiredFilterRule(
                'customers.created_at_week',
                'customers',
            ),
        ];
        const emptyFilters: Filters = {
            dimensions: {
                id: 'mockGroupId',
                and: [],
            },
        };
        const result = reduceRequiredDimensionFiltersToFilterRules(
            mockRequiredFilters,
            emptyFilters.dimensions,
            mockExploreWithJoinedTable,
        );
        const expectedFilterRuleResult: FilterRule[] = [
            expectedRequiredResult('order_date_week', 'orders'),
            expectedRequiredResult('created_at_week', 'customers'),
        ];

        expect(result).toEqual(expectedFilterRuleResult);
    });
});

describe('resetRequiredFilterRules', () => {
    test('should correctly reset required filter rules', () => {
        const filterGroup: FilterGroup = {
            id: 'uuidGroup',
            and: [
                expectedRequiredResult('mockFieldRef1', 'table'),
                expectedRequiredResult('mockFieldRef2', 'table'),
            ],
        };
        const newFilterRules = resetRequiredFilterRules(filterGroup, [
            'table_mockFieldRef1',
            'someOther',
        ]);
        expect(newFilterRules).toEqual(expectedRequiredResetResult);
    });
});

describe('trackWhichTimeBasedMetricFiltersToOverride', () => {
    test('should track fields to change when dashboard filter targets base time dimension', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'month-filter',
                    target: { fieldId: 'order_date_month' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-03'],
                },
                {
                    id: 'week-filter',
                    target: { fieldId: 'order_date_week' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-03-25'],
                },
            ],
        };

        const dashboardFilter: DashboardFilterRule = {
            id: 'year-filter',
            label: 'Year Filter',
            target: {
                fieldId: 'order_date_year',
                tableName: 'orders',
            },
            operator: FilterOperator.EQUALS,
            values: ['2024'],
        };

        const result = trackWhichTimeBasedMetricFiltersToOverride(
            metricQueryDimensionFilters,
            dashboardFilter,
            mockExplore,
        );

        expect(result.overrideData?.fieldsToChange).toEqual(
            expect.arrayContaining(['order_date_month', 'order_date_week']),
        );
    });

    test('should not track fields when dashboard filter targets non-base dimension', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'status-filter',
                    target: { fieldId: 'status' },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ],
        };

        const dashboardFilter: DashboardFilterRule = {
            id: 'status-filter',
            label: 'Status Filter',
            target: {
                fieldId: 'status',
                tableName: 'orders',
            },
            operator: FilterOperator.EQUALS,
            values: ['shipped'],
        };

        const result = trackWhichTimeBasedMetricFiltersToOverride(
            metricQueryDimensionFilters,
            dashboardFilter,
            mockExplore,
        );

        expect(result.overrideData?.fieldsToChange).toBeUndefined();
    });

    test('should handle multiple time intervals in metric query', () => {
        const metricQueryDimensionFilters: OrFilterGroup = {
            id: 'dim-filter-group',
            or: [
                {
                    id: 'month-filter',
                    target: { fieldId: 'order_date_month' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-03'],
                },
                {
                    id: 'week-filter',
                    target: { fieldId: 'order_date_week' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-03-25'],
                },
                {
                    id: 'year-filter',
                    target: { fieldId: 'order_date_year' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024'],
                },
            ],
        };

        const dashboardFilter: DashboardFilterRule = {
            id: 'base-filter',
            label: 'Base Filter',
            target: {
                fieldId: 'order_date_year',
                tableName: 'orders',
            },
            operator: FilterOperator.EQUALS,
            values: ['2024'],
        };

        const result = trackWhichTimeBasedMetricFiltersToOverride(
            metricQueryDimensionFilters,
            dashboardFilter,
            mockExplore,
        );

        expect(result.overrideData?.fieldsToChange).toEqual(
            expect.arrayContaining([
                'order_date_month',
                'order_date_week',
                'order_date_year',
            ]),
        );
    });

    test('should return original filter when no matching time intervals', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'status-filter',
                    target: { fieldId: 'status' },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ],
        };

        const dashboardFilter: DashboardFilterRule = {
            id: 'year-filter',
            label: 'Year Filter',
            target: {
                fieldId: 'order_date_year',
                tableName: 'orders',
            },
            operator: FilterOperator.EQUALS,
            values: ['2024'],
        };

        const result = trackWhichTimeBasedMetricFiltersToOverride(
            metricQueryDimensionFilters,
            dashboardFilter,
            mockExplore,
        );

        expect(result.overrideData?.fieldsToChange).toBeUndefined();
    });
});

describe('getDashboardFilterRulesForTileAndReferences', () => {
    test('should return filter rules when there is a match (isSqlColumn is true and fieldId is in references)', () => {
        const mockTileUuid = 'tile-123';
        const mockReferences = ['field-1', 'field-2'];

        const mockDashboardFilterRules: DashboardFilterRule[] = [
            {
                id: 'filter-1',
                label: 'Filter 1',
                target: {
                    fieldId: 'field-1',
                    tableName: 'table-1',
                    isSqlColumn: true,
                },
                operator: FilterOperator.EQUALS,
                values: ['value-1'],
                tileTargets: {
                    [mockTileUuid]: {
                        fieldId: 'field-1',
                        tableName: 'table-1',
                        isSqlColumn: true,
                    },
                },
            },
        ];

        const result = getDashboardFilterRulesForTileAndReferences(
            mockTileUuid,
            mockReferences,
            mockDashboardFilterRules,
        );

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('filter-1');
        expect(result[0].target.fieldId).toBe('field-1');
        expect(result[0].target.isSqlColumn).toBe(true);
    });

    test('should not return filter rules when isSqlColumn is false even though fieldId is a match', () => {
        const mockTileUuid = 'tile-123';
        const mockReferences = ['field-1', 'field-2'];

        const mockDashboardFilterRules: DashboardFilterRule[] = [
            {
                id: 'filter-2',
                label: 'Filter 2',
                target: {
                    fieldId: 'field-2',
                    tableName: 'table-1',
                    isSqlColumn: false,
                },
                operator: FilterOperator.EQUALS,
                values: ['value-2'],
                tileTargets: {
                    [mockTileUuid]: {
                        fieldId: 'field-2',
                        tableName: 'table-1',
                        isSqlColumn: false,
                    },
                },
            },
        ];

        const result = getDashboardFilterRulesForTileAndReferences(
            mockTileUuid,
            mockReferences,
            mockDashboardFilterRules,
        );

        // Verify filter-2 is not included (isSqlColumn is false but fieldId is a match)
        expect(result).toHaveLength(0);
    });

    test('should not return filter rules when isSqlColumn is true but fieldId does not match', () => {
        const mockTileUuid = 'tile-123';
        const mockReferences = ['field-1', 'field-2'];

        const mockDashboardFilterRules: DashboardFilterRule[] = [
            {
                id: 'filter-3',
                label: 'Filter 3',
                target: {
                    fieldId: 'field-3',
                    tableName: 'table-1',
                    isSqlColumn: true,
                },
                operator: FilterOperator.EQUALS,
                values: ['value-3'],
                tileTargets: {
                    [mockTileUuid]: {
                        fieldId: 'field-3',
                        tableName: 'table-1',
                        isSqlColumn: true,
                    },
                },
            },
        ];

        const result = getDashboardFilterRulesForTileAndReferences(
            mockTileUuid,
            mockReferences,
            mockDashboardFilterRules,
        );

        // Verify filter-3 is not included (isSqlColumn is true but fieldId doesn't match)
        expect(result).toHaveLength(0);
    });
});
