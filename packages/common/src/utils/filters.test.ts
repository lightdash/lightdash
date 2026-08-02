import { DimensionType, FieldType } from '../types/field';
import {
    FilterOperator,
    UnitOfTime,
    type AndFilterGroup,
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterGroup,
    type FilterRule,
    type Filters,
    type MetricFilterRule,
    type OrFilterGroup,
} from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';
import { TimeFrames } from '../types/timeFrames';
import {
    addDashboardFiltersToMetricQuery,
    addFilterRule,
    applyDashboardFiltersForTile,
    createFilterRuleFromField,
    createFilterRuleFromModelRequiredFilterRule,
    getDashboardFilterRulesForTileAndReferences,
    getUnmetFilterRequirements,
    isEmptyDashboardFilterRule,
    isFilterRuleInQuery,
    overrideChartFilter,
    reduceRequiredDimensionFiltersToFilterRules,
    resetRequiredFilterRules,
    stripOverridesForLockedFiltersOnTab,
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

vi.mock('uuid', () => ({
    v4: vi.fn(() => 'uuid'),
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

    test('should NOT override a chart filter with an empty dashboard filter on the same field', () => {
        const emptyDashboardFilter: DashboardFilters = {
            dimensions: [
                {
                    id: 'empty-filter',
                    label: undefined,
                    target: { fieldId: 'a_dim1', tableName: 'test' },
                    operator: FilterOperator.EQUALS,
                    values: [],
                    disabled: false,
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithAndFilters,
            emptyDashboardFilter,
        );
        const dimensionRules = (result.filters.dimensions as AndFilterGroup)
            .and;
        // The chart's own a_dim1 filter survives untouched — the empty
        // dashboard filter must not clobber its values with [].
        expect(dimensionRules).toContainEqual(
            expect.objectContaining({
                id: '1',
                target: { fieldId: 'a_dim1' },
                operator: FilterOperator.EQUALS,
                values: [0],
            }),
        );
        // ...and the empty filter adds no clause of its own.
        expect(dimensionRules).toHaveLength(1);
    });

    test('keeps a value-less IN_THE_CURRENT dashboard filter — it compiles from settings, not values', () => {
        const relativeDateFilter: DashboardFilters = {
            dimensions: [
                {
                    id: 'in-the-current',
                    label: undefined,
                    target: { fieldId: 'a_date_dim', tableName: 'test' },
                    operator: FilterOperator.IN_THE_CURRENT,
                    values: [],
                    settings: { unitOfTime: UnitOfTime.months },
                    disabled: false,
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        const result = addDashboardFiltersToMetricQuery(
            metricQueryWithAndFilters,
            relativeDateFilter,
        );
        const dimensionRules = (result.filters.dimensions as AndFilterGroup)
            .and;
        // The active relative-date filter survives the empty-filter guard and is
        // applied to the query.
        expect(dimensionRules).toContainEqual(
            expect.objectContaining({
                operator: FilterOperator.IN_THE_CURRENT,
                target: { fieldId: 'a_date_dim' },
                settings: { unitOfTime: UnitOfTime.months },
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

describe('createFilterRuleFromField — time-interval DATE dims', () => {
    const monthDim = (baseType: DimensionType.TIMESTAMP | DimensionType.DATE) =>
        ({
            ...dimension('created_at_month', 'orders'),
            type: DimensionType.DATE,
            timeInterval: TimeFrames.MONTH,
            timeIntervalBaseDimensionName: 'created_at',
            timeIntervalBaseDimensionType: baseType,
        }) as const;

    // GLITCH-452: a day-or-coarser trunc of a TIMESTAMP base now compiles to a
    // real DATE, so the drill receives a bare calendar value ("2024-11-01"), not
    // the old UTC instant. Calendar values are never timezone-shifted — even when
    // a project tz is supplied — so the drill filter matches the displayed month.
    const calendarNov = '2024-11-01';
    // DATE-base interval emits a calendar value anchored at UTC midnight.
    const dateBaseNov = '2024-11-01T00:00:00Z';

    test('TIMESTAMP-base (cast to DATE): calendar value is not shifted under a positive offset', () => {
        const rule = createFilterRuleFromField(
            monthDim(DimensionType.TIMESTAMP),
            calendarNov,
            'Europe/Paris',
        );
        expect(rule.values).toEqual(['2024-11']);
    });

    test('TIMESTAMP-base (cast to DATE): calendar value is not shifted under a negative offset', () => {
        const rule = createFilterRuleFromField(
            monthDim(DimensionType.TIMESTAMP),
            calendarNov,
            'America/New_York',
        );
        expect(rule.values).toEqual(['2024-11']);
    });

    test('TIMESTAMP-base: legacy UTC-instant value (flag off) is read at UTC, never shifted', () => {
        // Before the cast, a TIMESTAMP-base trunc emitted a UTC instant. With the
        // correction layer removed it is read at UTC — matching the unshifted
        // flag-off grid — regardless of any project tz supplied.
        const rule = createFilterRuleFromField(
            monthDim(DimensionType.TIMESTAMP),
            '2024-10-31T23:00:00Z',
            'Europe/Paris',
        );
        expect(rule.values).toEqual(['2024-10']);
    });

    test('DATE-base: negative offset must NOT shift the calendar date back', () => {
        const rule = createFilterRuleFromField(
            monthDim(DimensionType.DATE),
            dateBaseNov,
            'America/New_York',
        );
        // Shifting "Nov 1 UTC" into NY would land on Oct 31 — must not happen.
        expect(rule.values).toEqual(['2024-11']);
    });

    test('DATE-base: positive offset also stays on the calendar date', () => {
        const rule = createFilterRuleFromField(
            monthDim(DimensionType.DATE),
            dateBaseNov,
            'Asia/Tokyo',
        );
        expect(rule.values).toEqual(['2024-11']);
    });

    test('plain DATE column (no timeInterval): negative offset must NOT shift', () => {
        const plainDateDim = {
            ...dimension('order_date', 'orders'),
            type: DimensionType.DATE,
        } as const;
        const rule = createFilterRuleFromField(
            plainDateDim,
            '2024-11-01',
            'America/New_York',
        );
        // Plain DATE columns are calendar values — shifting into NY would
        // land on Oct 31 and silently corrupt the filter.
        expect(rule.values).toEqual(['2024-11-01']);
    });

    test('plain DATE column (no timeInterval): positive offset must NOT shift', () => {
        const plainDateDim = {
            ...dimension('order_date', 'orders'),
            type: DimensionType.DATE,
        } as const;
        const rule = createFilterRuleFromField(
            plainDateDim,
            '2024-11-01',
            'Asia/Tokyo',
        );
        expect(rule.values).toEqual(['2024-11-01']);
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

    test('should track chart filter on interval base dimension when dashboard filter targets an interval dimension', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'base-filter',
                    target: { fieldId: 'order_date' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-06-26'],
                },
            ],
        };

        const dashboardFilter: DashboardFilterRule = {
            id: 'month-filter',
            label: 'Month Filter',
            target: {
                fieldId: 'order_date_month',
                tableName: 'orders',
            },
            operator: FilterOperator.EQUALS,
            values: ['2025-01'],
        };

        const result = trackWhichTimeBasedMetricFiltersToOverride(
            metricQueryDimensionFilters,
            dashboardFilter,
            mockExplore,
        );

        expect(result.overrideData?.fieldsToChange).toEqual(['order_date']);
    });

    test('should track chart filters on base and interval dimensions when dashboard filter targets an interval dimension', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'base-filter',
                    target: { fieldId: 'order_date' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-03-01'],
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
            expect.arrayContaining(['order_date', 'order_date_week']),
        );
    });

    test('should track chart filter on interval dimension when dashboard filter targets the interval base dimension', () => {
        const metricQueryDimensionFilters: AndFilterGroup = {
            id: 'dim-filter-group',
            and: [
                {
                    id: 'month-filter',
                    target: { fieldId: 'order_date_month' },
                    operator: FilterOperator.EQUALS,
                    values: ['2024-03'],
                },
            ],
        };

        const dashboardFilter: DashboardFilterRule = {
            id: 'base-filter',
            label: 'Order Date Filter',
            target: {
                fieldId: 'order_date',
                tableName: 'orders',
            },
            operator: FilterOperator.EQUALS,
            values: ['2024-03-01'],
        };

        const result = trackWhichTimeBasedMetricFiltersToOverride(
            metricQueryDimensionFilters,
            dashboardFilter,
            mockExplore,
        );

        expect(result.overrideData?.fieldsToChange).toEqual([
            'order_date_month',
        ]);
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

describe('applyDashboardFiltersForTile', () => {
    const baseMetricQuery: MetricQuery = {
        exploreName: 'test',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    };

    const statusRule: DashboardFilterRule = {
        id: 'f-status',
        target: { fieldId: 'orders_status', tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: [true],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const offExploreRule: DashboardFilterRule = {
        id: 'f-off',
        target: { fieldId: 'other_browser', tableName: 'other' },
        operator: FilterOperator.EQUALS,
        values: ['chrome'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    test('drops rules whose fieldId is not in the explore', () => {
        const { metricQuery, appliedDashboardFilters } =
            applyDashboardFiltersForTile({
                tileUuid: 't-1',
                metricQuery: baseMetricQuery,
                dashboardFilters: {
                    dimensions: [offExploreRule],
                    metrics: [],
                    tableCalculations: [],
                },
                explore: mockExplore,
            });

        expect(appliedDashboardFilters.dimensions).toEqual([]);
        expect(
            (metricQuery.filters.dimensions as AndFilterGroup | undefined)
                ?.and ?? [],
        ).toEqual([]);
    });

    test('drops rules whose tileTargets disable them for this tile', () => {
        const disabledRule: DashboardFilterRule = {
            ...statusRule,
            tileTargets: { 't-1': false },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const { metricQuery, appliedDashboardFilters } =
            applyDashboardFiltersForTile({
                tileUuid: 't-1',
                metricQuery: baseMetricQuery,
                dashboardFilters: {
                    dimensions: [disabledRule],
                    metrics: [],
                    tableCalculations: [],
                },
                explore: mockExplore,
            });

        expect(appliedDashboardFilters.dimensions).toEqual([]);
        expect(
            (metricQuery.filters.dimensions as AndFilterGroup | undefined)
                ?.and ?? [],
        ).toEqual([]);
    });

    test('merges applicable rules into the metric query', () => {
        const { metricQuery, appliedDashboardFilters } =
            applyDashboardFiltersForTile({
                tileUuid: 't-1',
                metricQuery: baseMetricQuery,
                dashboardFilters: {
                    dimensions: [statusRule, offExploreRule],
                    metrics: [],
                    tableCalculations: [],
                },
                explore: mockExplore,
            });

        expect(appliedDashboardFilters.dimensions).toHaveLength(1);
        expect(appliedDashboardFilters.dimensions[0].id).toBe('f-status');
        const merged = (metricQuery.filters.dimensions as AndFilterGroup).and;
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            target: { fieldId: 'orders_status' },
            values: [true],
        });
    });
});

describe('stripOverridesForLockedFiltersOnTab', () => {
    const TAB_A = 'tab-a';
    const TAB_B = 'tab-b';
    const makeRule = (
        id: string,
        fieldId: string,
        tableName: string,
        opts: { lockedTabUuids?: string[]; values?: unknown[] } = {},
    ): DashboardFilterRule => ({
        id,
        operator: FilterOperator.EQUALS,
        target: { fieldId, tableName },
        values: opts.values ?? ['x'],
        label: undefined,
        ...(opts.lockedTabUuids ? { lockedTabUuids: opts.lockedTabUuids } : {}),
    });

    test('drops override on a tab where the rule is locked', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [TAB_A],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [
                makeRule('o-1', 'orders_status', 'orders', {
                    values: ['returned'],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_A,
            true,
        );
        expect(result.filters.dimensions).toEqual([]);
        expect(result.droppedCount).toBe(1);
    });

    test('keeps override on a tab where the rule is NOT locked', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [TAB_A],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_status', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_B,
            true,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('keeps override on a different field even if a sibling field is locked', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [TAB_A],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_amount', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_A,
            true,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('does not cross filter groups (dim lock leaves metric overrides alone)', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [TAB_A],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [],
            metrics: [makeRule('o-1', 'orders_status', 'orders')],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_A,
            true,
        );
        expect(result.filters.metrics).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('matches on both fieldId and tableName', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'status', 'orders', {
                    lockedTabUuids: [TAB_A],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'status', 'customers')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_A,
            true,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('tabbed dashboard with undefined tabUuid strips nothing (transient pre-selection state)', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [TAB_A],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_status', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            undefined,
            true,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('rule locked on multiple tabs is enforced on each', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [TAB_A, TAB_B],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_status', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const a = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_A,
            true,
        );
        const b = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_B,
            true,
        );
        expect(a.droppedCount).toBe(1);
        expect(b.droppedCount).toBe(1);
    });

    test('empty lockedTabUuids never strips', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_status', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            TAB_A,
            true,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('tab-less dashboard: any non-empty lockedTabUuids strips overrides', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: ['dashboard-uuid-as-sentinel'],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [
                makeRule('o-1', 'orders_status', 'orders', {
                    values: ['returned'],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            undefined,
            false,
        );
        expect(result.filters.dimensions).toEqual([]);
        expect(result.droppedCount).toBe(1);
    });

    test('tab-less dashboard: empty lockedTabUuids still does not strip', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: [],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_status', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            undefined,
            false,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });

    test('tab-less dashboard: non-target field is not affected by lock', () => {
        const saved = {
            dimensions: [
                makeRule('s-1', 'orders_status', 'orders', {
                    lockedTabUuids: ['dashboard-uuid-as-sentinel'],
                }),
            ],
            metrics: [],
            tableCalculations: [],
        };
        const overrides = {
            dimensions: [makeRule('o-1', 'orders_amount', 'orders')],
            metrics: [],
            tableCalculations: [],
        };
        const result = stripOverridesForLockedFiltersOnTab(
            saved,
            overrides,
            undefined,
            false,
        );
        expect(result.filters.dimensions).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });
});

describe('isEmptyDashboardFilterRule', () => {
    test('flags disabled:false + empty values + value-requiring operator', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.EQUALS,
                disabled: false,
                values: [],
            }),
        ).toBe(true);
    });

    test('flags missing values (treated as empty)', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.EQUALS,
                disabled: false,
            }),
        ).toBe(true);
    });

    test('flags omitted disabled (defaults to active)', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.EQUALS,
                values: [],
            }),
        ).toBe(true);
    });

    test('treats null values (YAML `values: ~`) as empty', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.EQUALS,
                disabled: false,
                values: null,
            }),
        ).toBe(true);
    });

    test('does NOT flag disabled filters', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.EQUALS,
                disabled: true,
                values: [],
            }),
        ).toBe(false);
    });

    test('does NOT flag operators that legitimately take no values', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.NULL,
                disabled: false,
                values: [],
            }),
        ).toBe(false);
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.NOT_NULL,
                disabled: false,
            }),
        ).toBe(false);
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.IN_PERIOD_TO_DATE,
                disabled: false,
            }),
        ).toBe(false);
    });

    test('does NOT flag value-less relative-date operators (compile from settings, not values)', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.IN_THE_CURRENT,
                disabled: false,
                values: [],
            }),
        ).toBe(false);
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.NOT_IN_THE_CURRENT,
                disabled: false,
                values: [],
            }),
        ).toBe(false);
    });

    test('does NOT flag filters with values', () => {
        expect(
            isEmptyDashboardFilterRule({
                operator: FilterOperator.EQUALS,
                disabled: false,
                values: ['some-value'],
            }),
        ).toBe(false);
    });
});

describe('getUnmetFilterRequirements', () => {
    const createRule = (
        id: string,
        overrides: Partial<DashboardFilterRule> = {},
    ): DashboardFilterRule => ({
        id,
        label: undefined,
        target: { fieldId: `${id}_field`, tableName: 'test' },
        operator: FilterOperator.EQUALS,
        values: [],
        ...overrides,
    });

    const toDashboardFilters = (
        partial: Partial<DashboardFilters>,
    ): DashboardFilters => ({
        dimensions: [],
        metrics: [],
        tableCalculations: [],
        ...partial,
    });

    test('returns empty array when there are no filters', () => {
        expect(getUnmetFilterRequirements(toDashboardFilters({}))).toEqual([]);
    });

    test('returns empty array when all requirements are satisfied', () => {
        const filters = toDashboardFilters({
            dimensions: [
                createRule('a', {
                    required: true,
                    disabled: false,
                    values: ['x'],
                }),
                createRule('b', {
                    requiredGroupId: 'g1',
                    disabled: false,
                    values: ['y'],
                }),
                createRule('c'),
            ],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([]);
    });

    test('returns a single entry for a required filter without a value', () => {
        const required = createRule('a', { required: true, disabled: true });
        const filters = toDashboardFilters({
            dimensions: [required, createRule('b')],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([
            { type: 'single', filter: required },
        ]);
    });

    test('returns a group entry when every member is valueless', () => {
        const memberA = createRule('a', {
            requiredGroupId: 'g1',
            disabled: true,
        });
        const memberB = createRule('b', {
            requiredGroupId: 'g1',
            disabled: true,
        });
        const filters = toDashboardFilters({ dimensions: [memberA, memberB] });
        expect(getUnmetFilterRequirements(filters)).toEqual([
            { type: 'group', groupId: 'g1', filters: [memberA, memberB] },
        ]);
    });

    test('group is satisfied when at least one member has a value', () => {
        const filters = toDashboardFilters({
            dimensions: [
                createRule('a', { requiredGroupId: 'g1', disabled: true }),
                createRule('b', {
                    requiredGroupId: 'g1',
                    disabled: false,
                    values: ['y'],
                }),
            ],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([]);
    });

    test('an enabled rule with a value-requiring operator and no values does not satisfy a requirement', () => {
        const emptyRequired = createRule('a', {
            required: true,
            disabled: false,
        });
        const emptyMemberA = createRule('b', {
            requiredGroupId: 'g1',
            disabled: false,
        });
        const emptyMemberB = createRule('c', {
            requiredGroupId: 'g1',
            disabled: true,
        });
        const filters = toDashboardFilters({
            dimensions: [emptyRequired, emptyMemberA, emptyMemberB],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([
            { type: 'single', filter: emptyRequired },
            {
                type: 'group',
                groupId: 'g1',
                filters: [emptyMemberA, emptyMemberB],
            },
        ]);
    });

    test('an enabled rule with a value-less operator satisfies a requirement without values', () => {
        const filters = toDashboardFilters({
            dimensions: [
                createRule('a', {
                    required: true,
                    disabled: false,
                    operator: FilterOperator.NOT_NULL,
                }),
                createRule('b', { requiredGroupId: 'g1', disabled: true }),
                createRule('c', {
                    requiredGroupId: 'g1',
                    disabled: false,
                    operator: FilterOperator.IN_THE_CURRENT,
                    settings: { unitOfTime: 'months' },
                }),
            ],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([]);
    });

    test('a rule with both required and requiredGroupId is a single, not a group member', () => {
        const both = createRule('a', {
            required: true,
            requiredGroupId: 'g1',
            disabled: true,
        });
        const memberB = createRule('b', {
            requiredGroupId: 'g1',
            disabled: true,
        });

        // `required` wins: the dual-flag rule is excluded from its group
        const unmetGroupFilters = toDashboardFilters({
            dimensions: [both, memberB],
        });
        expect(getUnmetFilterRequirements(unmetGroupFilters)).toEqual([
            { type: 'single', filter: both },
            { type: 'group', groupId: 'g1', filters: [memberB] },
        ]);

        // A value on the dual-flag rule satisfies its single, not the group
        const satisfiedSingle = createRule('a', {
            required: true,
            requiredGroupId: 'g1',
            disabled: false,
            values: ['x'],
        });
        const satisfiedSingleFilters = toDashboardFilters({
            dimensions: [satisfiedSingle, memberB],
        });
        expect(getUnmetFilterRequirements(satisfiedSingleFilters)).toEqual([
            { type: 'group', groupId: 'g1', filters: [memberB] },
        ]);

        // Group satisfied by the other member, but the required single remains unmet
        const satisfiedGroupFilters = toDashboardFilters({
            dimensions: [
                both,
                createRule('b', {
                    requiredGroupId: 'g1',
                    disabled: false,
                    values: ['y'],
                }),
            ],
        });
        expect(getUnmetFilterRequirements(satisfiedGroupFilters)).toEqual([
            { type: 'single', filter: both },
        ]);
    });

    test('evaluates independent groups separately', () => {
        const g2MemberA = createRule('c', {
            requiredGroupId: 'g2',
            disabled: true,
        });
        const g2MemberB = createRule('d', {
            requiredGroupId: 'g2',
            disabled: true,
        });
        const filters = toDashboardFilters({
            dimensions: [
                createRule('a', { requiredGroupId: 'g1', disabled: true }),
                createRule('b', {
                    requiredGroupId: 'g1',
                    disabled: false,
                    values: ['y'],
                }),
                g2MemberA,
                g2MemberB,
            ],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([
            { type: 'group', groupId: 'g2', filters: [g2MemberA, g2MemberB] },
        ]);
    });

    test('includes metric filters as group members', () => {
        const dimensionMember = createRule('a', {
            requiredGroupId: 'g1',
            disabled: true,
        });
        const metricMember = createRule('b', {
            requiredGroupId: 'g1',
            disabled: true,
        });
        const filters = toDashboardFilters({
            dimensions: [dimensionMember],
            metrics: [metricMember],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([
            {
                type: 'group',
                groupId: 'g1',
                filters: [dimensionMember, metricMember],
            },
        ]);

        // A metric member with a value satisfies the group
        const satisfied = toDashboardFilters({
            dimensions: [dimensionMember],
            metrics: [
                createRule('b', { requiredGroupId: 'g1', values: ['y'] }),
            ],
        });
        expect(getUnmetFilterRequirements(satisfied)).toEqual([]);
    });

    test('ignores tableCalculations filters', () => {
        const filters = toDashboardFilters({
            tableCalculations: [
                createRule('a', { required: true, disabled: true }),
                createRule('b', { requiredGroupId: 'g1', disabled: true }),
            ],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([]);
    });

    test('does not treat an empty-string requiredGroupId as a group', () => {
        const filters = toDashboardFilters({
            dimensions: [
                createRule('a', { requiredGroupId: '', disabled: true }),
                createRule('b', { requiredGroupId: '', disabled: true }),
            ],
        });
        expect(getUnmetFilterRequirements(filters)).toEqual([]);
    });
});
