import { DimensionType, FieldType } from '../types/field';
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
import { TimeFrames } from '../types/timeFrames';
import {
    addDashboardFiltersToMetricQuery,
    addFilterRule,
    createFilterRuleFromModelRequiredFilterRule,
    getDashboardFilterRulesForTileAndReferences,
    getDashboardFilterRulesForTileAndTables,
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
    dashboardFilters,
    dashboardFiltersWithMetrics,
    dashboardFilterWithSameTargetAndOperator,
    dashboardFilterWithSameTargetButDifferentOperator,
    dimension,
    emptyDashboardFilters,
    expectedChartWithOverrideDashboardFilters,
    expectedChartWithOverrideDashboardORFilters,
    expectedFiltersWithCustomSqlDimension,
    expectedRequiredResetResult,
    expectedRequiredResult,
    filterRule,
    joinedModelRequiredFilterRule,
    metricQueryWithAndFilters,
    metricQueryWithExistingMetricFilters,
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

    test('should merge dashboard metric filters into the metric query', () => {
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithAndFilters,
            dashboardFiltersWithMetrics,
        );
        expect(result.filters.metrics).toBeDefined();
        expect((result.filters.metrics as AndFilterGroup).and).toHaveLength(1);
        expect((result.filters.metrics as AndFilterGroup).and[0]).toMatchObject(
            {
                target: { fieldId: 'a_metric1' },
                operator: FilterOperator.GREATER_THAN,
                values: [100],
            },
        );
    });

    test('should override existing chart metric filter with same target from dashboard', () => {
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithExistingMetricFilters,
            dashboardFiltersWithMetrics,
        );
        expect(result.filters.metrics).toBeDefined();
        const metricFilters = (result.filters.metrics as AndFilterGroup).and;
        // Dashboard metric filter overrides the existing chart metric filter with same fieldId
        expect(metricFilters).toContainEqual(
            expect.objectContaining({
                target: { fieldId: 'a_metric1' },
                operator: FilterOperator.GREATER_THAN,
                values: [100],
            }),
        );
    });

    test('should return metric query unchanged when dashboard has no filters', () => {
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithAndFilters,
            emptyDashboardFilters,
        );
        expect(result.filters.dimensions).toBeDefined();
        expect((result.filters.metrics as AndFilterGroup).and).toHaveLength(0);
        expect(
            (result.filters.tableCalculations as AndFilterGroup).and,
        ).toHaveLength(0);
    });

    test('should not affect dimension filters when adding metric filters', () => {
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithAndFilters,
            dashboardFiltersWithMetrics,
        );
        expect(
            (result.filters.dimensions as AndFilterGroup).and,
        ).toContainEqual(
            expect.objectContaining({
                target: { fieldId: 'a_dim1' },
                operator: FilterOperator.EQUALS,
                values: ['1', '2', '3'],
            }),
        );
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
                mockExplore,
            ),
        ).toEqual(true);
        expect(
            isFilterRuleInQuery(
                dimension('dim', 'table'),
                filterRule,
                filterGroupWithoutFilterRule,
                mockExplore,
            ),
        ).toEqual(false);
    });

    test('should not treat string-derived time dimensions as satisfying required date filters', () => {
        const exploreWithStringDerivedTimeDimension = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date: {
                            name: 'order_date',
                            label: 'Order Date',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date',
                            tablesReferences: [],
                            sql: 'order_date',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.DATE,
                            isIntervalBase: true,
                        },
                        order_date_fiscal_quarter: {
                            name: 'order_date_fiscal_quarter',
                            label: 'Order Date Fiscal Quarter',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_fiscal_quarter',
                            tablesReferences: [],
                            sql: 'order_date_fiscal_quarter',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'fiscal_quarter',
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const requiredFilter = expectedRequiredResult('order_date', 'orders');
        const filtersWithOnlyStringDerivedDimension: FilterGroup = {
            id: 'mockGroupId',
            and: [
                {
                    id: 'string-derived-filter',
                    target: { fieldId: 'orders_order_date_fiscal_quarter' },
                    operator: FilterOperator.EQUALS,
                    values: ['FY2024-Q1'],
                },
            ],
        };

        expect(
            isFilterRuleInQuery(
                exploreWithStringDerivedTimeDimension.tables.orders.dimensions
                    .order_date,
                requiredFilter,
                filtersWithOnlyStringDerivedDimension,
                exploreWithStringDerivedTimeDimension,
            ),
        ).toEqual(false);
    });

    test('should treat date-derived time dimensions as satisfying required date filters', () => {
        const exploreWithDateDerivedTimeDimension = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date: {
                            name: 'order_date',
                            label: 'Order Date',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date',
                            tablesReferences: [],
                            sql: 'order_date',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.DATE,
                            isIntervalBase: true,
                        },
                        order_date_biweekly: {
                            name: 'order_date_biweekly',
                            label: 'Order Date Biweekly',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_biweekly',
                            tablesReferences: [],
                            sql: 'order_date_biweekly',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.DATE,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'biweekly',
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const requiredFilter = expectedRequiredResult('order_date', 'orders');
        const filtersWithOnlyDateDerivedDimension: FilterGroup = {
            id: 'mockGroupId',
            and: [
                {
                    id: 'date-derived-filter',
                    target: { fieldId: 'orders_order_date_biweekly' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [14],
                    settings: {
                        unitOfTime: 'days',
                    },
                },
            ],
        };

        expect(
            isFilterRuleInQuery(
                exploreWithDateDerivedTimeDimension.tables.orders.dimensions
                    .order_date,
                requiredFilter,
                filtersWithOnlyDateDerivedDimension,
                exploreWithDateDerivedTimeDimension,
            ),
        ).toEqual(true);
    });

    test('should require an exact match when the required filter targets a custom derived time dimension', () => {
        const exploreWithSiblingStringDerivedTimeDimensions = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date: {
                            name: 'order_date',
                            label: 'Order Date',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date',
                            tablesReferences: [],
                            sql: 'order_date',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.DATE,
                            isIntervalBase: true,
                        },
                        order_date_fiscal_year: {
                            name: 'order_date_fiscal_year',
                            label: 'Order Date Fiscal Year',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_fiscal_year',
                            tablesReferences: [],
                            sql: 'order_date_fiscal_year',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'fiscal_year',
                        },
                        order_date_fiscal_quarter: {
                            name: 'order_date_fiscal_quarter',
                            label: 'Order Date Fiscal Quarter',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_fiscal_quarter',
                            tablesReferences: [],
                            sql: 'order_date_fiscal_quarter',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'fiscal_quarter',
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const requiredFilter = expectedRequiredResult(
            'order_date_fiscal_year',
            'orders',
        );
        const filtersWithSiblingDerivedDimensionOnly: FilterGroup = {
            id: 'mockGroupId',
            and: [
                {
                    id: 'sibling-derived-filter',
                    target: { fieldId: 'orders_order_date_fiscal_quarter' },
                    operator: FilterOperator.EQUALS,
                    values: ['FY2024-Q1'],
                },
            ],
        };

        expect(
            isFilterRuleInQuery(
                exploreWithSiblingStringDerivedTimeDimensions.tables.orders
                    .dimensions.order_date_fiscal_year,
                requiredFilter,
                filtersWithSiblingDerivedDimensionOnly,
                exploreWithSiblingStringDerivedTimeDimensions,
            ),
        ).toEqual(false);
    });

    test('should allow sibling standard time dimensions when the required filter targets a standard derived time dimension', () => {
        const exploreWithStandardDerivedTimeDimensions = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date_week: {
                            ...mockExplore.tables.orders.dimensions
                                .order_date_week,
                            timeInterval: TimeFrames.WEEK,
                        },
                        order_date_month: {
                            ...mockExplore.tables.orders.dimensions
                                .order_date_month,
                            timeInterval: TimeFrames.MONTH,
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const requiredFilter = expectedRequiredResult(
            'order_date_week',
            'orders',
        );
        const filtersWithSiblingStandardDimension: FilterGroup = {
            id: 'mockGroupId',
            and: [
                {
                    id: 'sibling-standard-filter',
                    target: { fieldId: 'orders_order_date_month' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-09-01'],
                },
            ],
        };

        expect(
            isFilterRuleInQuery(
                exploreWithStandardDerivedTimeDimensions.tables.orders
                    .dimensions.order_date_week,
                requiredFilter,
                filtersWithSiblingStandardDimension,
                exploreWithStandardDerivedTimeDimensions,
            ),
        ).toEqual(true);
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

    test('should keep required date filters when only string-derived time filters are present', () => {
        const exploreWithStringDerivedTimeDimension = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date: {
                            name: 'order_date',
                            label: 'Order Date',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date',
                            tablesReferences: [],
                            sql: 'order_date',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.DATE,
                            isIntervalBase: true,
                        },
                        order_date_fiscal_quarter: {
                            name: 'order_date_fiscal_quarter',
                            label: 'Order Date Fiscal Quarter',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_fiscal_quarter',
                            tablesReferences: [],
                            sql: 'order_date_fiscal_quarter',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'fiscal_quarter',
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const filtersWithOnlyStringDerivedDimension: Filters = {
            dimensions: {
                id: 'mockGroupId',
                and: [
                    {
                        id: 'string-derived-filter',
                        target: { fieldId: 'orders_order_date_fiscal_quarter' },
                        operator: FilterOperator.EQUALS,
                        values: ['FY2024-Q1'],
                    },
                ],
            },
        };

        const result = reduceRequiredDimensionFiltersToFilterRules(
            [modelRequiredFilterRule('order_date')],
            filtersWithOnlyStringDerivedDimension.dimensions,
            exploreWithStringDerivedTimeDimension,
        );

        expect(result).toEqual([
            expectedRequiredResult('order_date', 'orders'),
        ]);
    });

    test('should keep required derived time filters when only a sibling derived time filter is present', () => {
        const exploreWithSiblingStringDerivedTimeDimensions = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date: {
                            name: 'order_date',
                            label: 'Order Date',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date',
                            tablesReferences: [],
                            sql: 'order_date',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.DATE,
                            isIntervalBase: true,
                        },
                        order_date_fiscal_year: {
                            name: 'order_date_fiscal_year',
                            label: 'Order Date Fiscal Year',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_fiscal_year',
                            tablesReferences: [],
                            sql: 'order_date_fiscal_year',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'fiscal_year',
                        },
                        order_date_fiscal_quarter: {
                            name: 'order_date_fiscal_quarter',
                            label: 'Order Date Fiscal Quarter',
                            table: 'orders',
                            tableLabel: 'Orders',
                            compiledSql: 'order_date_fiscal_quarter',
                            tablesReferences: [],
                            sql: 'order_date_fiscal_quarter',
                            hidden: false,
                            fieldType: FieldType.DIMENSION,
                            type: DimensionType.STRING,
                            timeIntervalBaseDimensionName: 'order_date',
                            customTimeInterval: 'fiscal_quarter',
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const filtersWithSiblingDerivedDimensionOnly: Filters = {
            dimensions: {
                id: 'mockGroupId',
                and: [
                    {
                        id: 'sibling-derived-filter',
                        target: { fieldId: 'orders_order_date_fiscal_quarter' },
                        operator: FilterOperator.EQUALS,
                        values: ['FY2024-Q1'],
                    },
                ],
            },
        };

        const result = reduceRequiredDimensionFiltersToFilterRules(
            [modelRequiredFilterRule('order_date_fiscal_year')],
            filtersWithSiblingDerivedDimensionOnly.dimensions,
            exploreWithSiblingStringDerivedTimeDimensions,
        );

        expect(result).toEqual([
            expectedRequiredResult('order_date_fiscal_year', 'orders'),
        ]);
    });

    test('should not add a required standard derived time filter when a sibling standard time filter is present', () => {
        const exploreWithStandardDerivedTimeDimensions = {
            ...mockExplore,
            tables: {
                ...mockExplore.tables,
                orders: {
                    ...mockExplore.tables.orders,
                    dimensions: {
                        ...mockExplore.tables.orders.dimensions,
                        order_date_week: {
                            ...mockExplore.tables.orders.dimensions
                                .order_date_week,
                            timeInterval: TimeFrames.WEEK,
                        },
                        order_date_month: {
                            ...mockExplore.tables.orders.dimensions
                                .order_date_month,
                            timeInterval: TimeFrames.MONTH,
                        },
                    },
                },
            },
        } as typeof mockExplore;
        const filtersWithSiblingStandardDimension: Filters = {
            dimensions: {
                id: 'mockGroupId',
                and: [
                    {
                        id: 'sibling-standard-filter',
                        target: { fieldId: 'orders_order_date_month' },
                        operator: FilterOperator.EQUALS,
                        values: ['2024-09-01'],
                    },
                ],
            },
        };

        const result = reduceRequiredDimensionFiltersToFilterRules(
            [modelRequiredFilterRule('order_date_week')],
            filtersWithSiblingStandardDimension.dimensions,
            exploreWithStandardDerivedTimeDimensions,
        );

        expect(result).toEqual([]);
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

describe('getDashboardFilterRulesForTileAndTables', () => {
    const tileUuid = 'tile-1';

    const makeFilter = (
        id: string,
        tableName: string,
        fieldId: string,
        tileTargets?: DashboardFilterRule['tileTargets'],
    ): DashboardFilterRule => ({
        id,
        label: undefined,
        target: { fieldId, tableName },
        operator: FilterOperator.EQUALS,
        values: ['test'],
        tileTargets,
    });

    test('auto-applied filter passes when table exists in explore', () => {
        const rules = [makeFilter('f1', 'orders', 'orders_date')];
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['orders', 'customers'],
            rules,
        );
        expect(result).toHaveLength(1);
        expect(result[0].target.fieldId).toBe('orders_date');
    });

    test('auto-applied filter is dropped when table does not exist in explore', () => {
        const rules = [makeFilter('f1', 'orders', 'orders_date')];
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['payments', 'customers'],
            rules,
        );
        expect(result).toHaveLength(0);
    });

    test('explicitly mapped filter is kept even when source table is not in explore (cross-explore)', () => {
        const rules = [
            makeFilter('f1', 'orders', 'orders_date', {
                [tileUuid]: {
                    fieldId: 'orders_date',
                    tableName: 'orders',
                },
            }),
        ];
        // The target explore does NOT have the 'orders' table,
        // but the filter is explicitly mapped to this tile.
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['payments', 'customers'],
            rules,
        );
        expect(result).toHaveLength(1);
        expect(result[0].target.fieldId).toBe('orders_date');
    });

    test('explicitly mapped filter with remapped field is kept for cross-explore', () => {
        const rules = [
            makeFilter('f1', 'orders', 'orders_customer_id', {
                [tileUuid]: {
                    fieldId: 'payments_customer_id',
                    tableName: 'payments',
                },
            }),
        ];
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['payments'],
            rules,
        );
        expect(result).toHaveLength(1);
        // Target should be remapped to the tile-specific field
        expect(result[0].target.fieldId).toBe('payments_customer_id');
        expect(result[0].target.tableName).toBe('payments');
    });

    test('explicitly excluded tile (tileTargets = false) drops the filter', () => {
        const rules = [
            makeFilter('f1', 'orders', 'orders_date', {
                [tileUuid]: false,
            }),
        ];
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['orders'],
            rules,
        );
        expect(result).toHaveLength(0);
    });

    test('disabled filter is always dropped', () => {
        const rules: DashboardFilterRule[] = [
            {
                ...makeFilter('f1', 'orders', 'orders_date', {
                    [tileUuid]: {
                        fieldId: 'orders_date',
                        tableName: 'orders',
                    },
                }),
                disabled: true,
            },
        ];
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['orders'],
            rules,
        );
        expect(result).toHaveLength(0);
    });

    test('filter for different tile auto-applies with table check', () => {
        const rules = [
            makeFilter('f1', 'orders', 'orders_date', {
                'other-tile': {
                    fieldId: 'orders_date',
                    tableName: 'orders',
                },
            }),
        ];
        // This tile is NOT in tileTargets, so auto-apply with table check
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['orders'],
            rules,
        );
        expect(result).toHaveLength(1);
    });

    test('filter for different tile auto-apply fails when table not in explore', () => {
        const rules = [
            makeFilter('f1', 'orders', 'orders_date', {
                'other-tile': {
                    fieldId: 'orders_date',
                    tableName: 'orders',
                },
            }),
        ];
        // This tile is NOT in tileTargets, auto-apply, table check fails
        const result = getDashboardFilterRulesForTileAndTables(
            tileUuid,
            ['payments'],
            rules,
        );
        expect(result).toHaveLength(0);
    });
});
