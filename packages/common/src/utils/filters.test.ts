import { ConditionalOperator } from '../types/conditionalRule';
import { SupportedDbtAdapter } from '../types/dbt';
import { type Explore, type Table } from '../types/explore';
import { DimensionType, FieldType } from '../types/field';
import {
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
    createFilterRuleFromRequiredMetricRule,
    isFilterRuleInQuery,
    overrideChartFilter,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
    trackWhichTimeBasedMetricFiltersToOverride,
} from './filters';
import {
    baseTable,
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
    metricFilterRule,
    metricQueryWithAndFilters,
    metricQueryWithOrFilters,
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
                    operator: ConditionalOperator.EQUALS,
                },
                {
                    id: '2',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
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
                    operator: ConditionalOperator.EQUALS,
                },
                {
                    id: '4',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
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
                    operator: ConditionalOperator.NOT_EQUALS,
                },
                {
                    id: '2',
                    target: { fieldId: 'field-2' },
                    values: ['2'],
                    disabled: false,
                    operator: ConditionalOperator.EQUALS,
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

describe('createFilterRuleFromRequiredMetricRule', () => {
    test('should create a correct FilterRule', () => {
        const result = createFilterRuleFromRequiredMetricRule(
            metricFilterRule('dimension'),
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
            metricFilterRule('mockFieldRef1'),
            metricFilterRule('mockFieldRef2'),
        ];
        const table: Table = {
            ...baseTable,
            lineageGraph: {},
            dimensions: {
                mockFieldRef1: dimension('mockFieldRef1', 'table'),
                mockFieldRef2: dimension('mockFieldRef2', 'table'),
            },
        };
        const emptyFilters: Filters = {
            dimensions: {
                id: 'mockGroupId',
                and: [],
            },
        };
        const result = reduceRequiredDimensionFiltersToFilterRules(
            mockRequiredFilters,
            table,
            emptyFilters.dimensions,
        );
        const expectedFilterRuleResult: FilterRule[] = [
            expectedRequiredResult('mockFieldRef1', 'table'),
            expectedRequiredResult('mockFieldRef2', 'table'),
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
    const mockExplore: Explore = {
        name: 'test',
        label: 'Test',
        tags: [],
        baseTable: 'orders',
        targetDatabase: SupportedDbtAdapter.POSTGRES,
        joinedTables: [],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: 'test',
                schema: 'public',
                sqlTable: 'orders',
                metrics: {},
                lineageGraph: {},
                dimensions: {
                    order_date_year: {
                        name: 'order_date_year',
                        label: 'Order Date Year',
                        table: 'orders',
                        tableLabel: 'Orders',
                        compiledSql: 'order_date_year',
                        tablesReferences: [],
                        sql: 'order_date_year',
                        hidden: false,
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        timeIntervalBaseDimensionName: 'order_date',
                    },
                    order_date_month: {
                        name: 'order_date_month',
                        label: 'Order Date Month',
                        table: 'orders',
                        tableLabel: 'Orders',
                        compiledSql: 'order_date_month',
                        tablesReferences: [],
                        sql: 'order_date_month',
                        hidden: false,
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        timeIntervalBaseDimensionName: 'order_date',
                    },
                    order_date_week: {
                        name: 'order_date_week',
                        label: 'Order Date Week',
                        table: 'orders',
                        tableLabel: 'Orders',
                        compiledSql: 'order_date_week',
                        sql: 'order_date_week',
                        hidden: false,
                        tablesReferences: [],
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        timeIntervalBaseDimensionName: 'order_date',
                    },
                    status: {
                        name: 'status',
                        label: 'Status',
                        table: 'orders',
                        tableLabel: 'Orders',
                        compiledSql: 'status',
                        sql: 'status',
                        hidden: false,
                        tablesReferences: [],
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.BOOLEAN,
                    },
                },
            },
        },
    };

    test('should track fields to change when dashboard filter targets base time dimension', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'month-filter',
                    target: { fieldId: 'order_date_month' },
                    operator: ConditionalOperator.EQUALS,
                    values: ['2024-03'],
                },
                {
                    id: 'week-filter',
                    target: { fieldId: 'order_date_week' },
                    operator: ConditionalOperator.EQUALS,
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
            operator: ConditionalOperator.EQUALS,
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
                    operator: ConditionalOperator.EQUALS,
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
            operator: ConditionalOperator.EQUALS,
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
                    operator: ConditionalOperator.EQUALS,
                    values: ['2024-03'],
                },
                {
                    id: 'week-filter',
                    target: { fieldId: 'order_date_week' },
                    operator: ConditionalOperator.EQUALS,
                    values: ['2024-03-25'],
                },
                {
                    id: 'year-filter',
                    target: { fieldId: 'order_date_year' },
                    operator: ConditionalOperator.EQUALS,
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
            operator: ConditionalOperator.EQUALS,
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
                    operator: ConditionalOperator.EQUALS,
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
            operator: ConditionalOperator.EQUALS,
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
