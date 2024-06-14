import { ConditionalOperator } from '../types/conditionalRule';
import { type Table } from '../types/explore';
import {
    type FilterGroup,
    type FilterRule,
    type Filters,
    type MetricFilterRule,
} from '../types/filter';
import {
    addDashboardFiltersToMetricQuery,
    addFilterRule,
    createFilterRuleFromRequiredMetricRule,
    isFilterRuleInQuery,
    overrideChartFilter,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
} from './filters';
import {
    baseTable,
    chartAndFilterGroup,
    chartOrFilterGroup,
    customSqlDimension,
    dashboardFilters,
    dashboardFilterWithSameTargetAndOperator,
    dashboardFilterWithSameTargetButDifferentOperator,
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
