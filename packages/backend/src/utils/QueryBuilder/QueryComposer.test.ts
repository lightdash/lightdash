import {
    CustomFormatType,
    FilterOperator,
    MetricQuery,
    PivotConfiguration,
    SortByDirection,
    TableCalculationTotalMode,
    TableCalculationType,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import {
    EXPLORE,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';
import {
    QueryComposer,
    QueryComposerContext,
    TotalConfiguration,
} from './QueryComposer';

const CONTEXT: QueryComposerContext = {
    explore: EXPLORE,
    warehouseSqlBuilder: warehouseClientMock,
    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
    userAttributes: {},
    timezone: QUERY_BUILDER_UTC_TIMEZONE,
    availableParameterDefinitions: {},
    parameters: {},
    dateZoom: undefined,
    pivotDimensions: undefined,
    pivotItemsMap: undefined,
    continueOnError: undefined,
    useTimezoneAwareDateTrunc: undefined,
    columnTimezone: undefined,
    applyDateZoomToFilters: undefined,
};

const PIVOT_CONFIGURATION: PivotConfiguration = {
    indexColumn: [{ reference: 'table1_dim1', type: VizIndexType.CATEGORY }],
    valuesColumns: [
        {
            reference: 'table1_metric1',
            aggregation: VizAggregationOptions.SUM,
        },
    ],
    groupByColumns: undefined,
    sortBy: [{ reference: 'table1_dim1', direction: SortByDirection.ASC }],
};

// Pivoted source: index on table1_dim1, pivot (groupBy) on table1_shared,
// value on table1_metric1. Supports every totals grain.
const TOTALS_SOURCE_METRIC_QUERY: MetricQuery = {
    exploreName: 'table1',
    dimensions: ['table1_dim1', 'table1_shared'],
    metrics: ['table1_metric1'],
    filters: {},
    sorts: [{ fieldId: 'table1_dim1', descending: false }],
    limit: 500,
    tableCalculations: [],
};

const TOTALS_SOURCE_PIVOT_CONFIGURATION: PivotConfiguration = {
    indexColumn: { reference: 'table1_dim1', type: VizIndexType.CATEGORY },
    valuesColumns: [
        {
            reference: 'table1_metric1',
            aggregation: VizAggregationOptions.SUM,
        },
    ],
    groupByColumns: [{ reference: 'table1_shared' }],
    sortBy: [{ reference: 'table1_dim1', direction: SortByDirection.ASC }],
};

describe('QueryComposer', () => {
    it('compiles a metric query and returns the base SQL via getSql when there is no pivot', () => {
        const composer = new QueryComposer(
            { metricQuery: METRIC_QUERY, pivotConfiguration: undefined },
            CONTEXT,
        );

        const compiled = composer.compile();

        expect(compiled.query).toMatchSnapshot();
        expect(Object.keys(compiled.fields)).toEqual(
            expect.arrayContaining(['table1_dim1', 'table1_metric1']),
        );

        // Without a pivot configuration, getSql returns the compiled base query.
        expect(composer.getSql({ columnLimit: 100 })).toBe(compiled.query);
    });

    it('wraps the base query with the pivot query when a pivot configuration is set', () => {
        const composer = new QueryComposer(
            {
                metricQuery: METRIC_QUERY,
                pivotConfiguration: PIVOT_CONFIGURATION,
            },
            CONTEXT,
        );

        const sql = composer.getSql({ columnLimit: 100 });

        // The pivot SQL wraps (and therefore differs from) the base query.
        expect(sql).not.toBe(composer.compile().query);
        expect(sql).toMatchSnapshot();
    });

    describe('getters', () => {
        it('combines user access controls only when both attribute maps are in context', () => {
            const withAttributes = new QueryComposer(
                { metricQuery: METRIC_QUERY },
                CONTEXT,
            );
            expect(withAttributes.getUserAccessControls()).toEqual({
                userAttributes: {},
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            });

            const withoutAttributes = new QueryComposer(
                { metricQuery: METRIC_QUERY },
                {
                    explore: EXPLORE,
                    warehouseSqlBuilder: warehouseClientMock,
                },
            );
            expect(withoutAttributes.getUserAccessControls()).toBeUndefined();
        });

        it('applies metric format overrides from the source query in getFields', () => {
            const composer = new QueryComposer(
                {
                    metricQuery: {
                        ...METRIC_QUERY,
                        metricOverrides: {
                            table1_metric1: {
                                formatOptions: {
                                    type: CustomFormatType.PERCENT,
                                    round: 1,
                                },
                            },
                        },
                    },
                },
                CONTEXT,
            );

            const fields = composer.getFields();
            const baseFields = composer.compile().fields;

            expect(fields.table1_metric1).toEqual({
                ...baseFields.table1_metric1,
                format: '#,##0.0%',
                separator: undefined,
            });
            // Fields without an override pass through untouched.
            expect(fields.table1_dim1).toEqual(baseFields.table1_dim1);
        });
    });

    describe('totalConfiguration', () => {
        const CASES: Array<TotalConfiguration> = [
            { kind: 'grandTotal', subtotalDimensions: undefined },
            { kind: 'columnTotal', subtotalDimensions: undefined },
            { kind: 'rowTotal', subtotalDimensions: undefined },
            { kind: 'columnSubtotal', subtotalDimensions: ['table1_dim1'] },
            { kind: 'rowSubtotal', subtotalDimensions: ['table1_dim1'] },
        ];

        it.each(CASES)(
            'collapses the source query into the totals grain for kind "$kind"',
            ({ kind, subtotalDimensions }) => {
                const composer = new QueryComposer(
                    {
                        metricQuery: TOTALS_SOURCE_METRIC_QUERY,
                        pivotConfiguration: TOTALS_SOURCE_PIVOT_CONFIGURATION,
                        totalConfiguration: { kind, subtotalDimensions },
                    },
                    CONTEXT,
                );

                expect(composer.getSql({ columnLimit: 100 })).toMatchSnapshot();
            },
        );

        describe('metric-filtered source (filtered dimension groups)', () => {
            const METRIC_FILTERED_TOTALS_SOURCE: MetricQuery = {
                ...TOTALS_SOURCE_METRIC_QUERY,
                filters: {
                    metrics: {
                        id: 'root',
                        and: [
                            {
                                id: '1',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [10],
                            },
                        ],
                    },
                },
            };

            it.each([
                { kind: 'columnTotal' as const, subtotalDimensions: undefined },
                {
                    kind: 'columnSubtotal' as const,
                    subtotalDimensions: ['table1_dim1'],
                },
            ])(
                'restricts the totals query to the filtered dimension groups for kind "$kind"',
                ({ kind, subtotalDimensions }) => {
                    const composer = new QueryComposer(
                        {
                            metricQuery: METRIC_FILTERED_TOTALS_SOURCE,
                            pivotConfiguration:
                                TOTALS_SOURCE_PIVOT_CONFIGURATION,
                            totalConfiguration: { kind, subtotalDimensions },
                        },
                        CONTEXT,
                    );

                    const sql = composer.getSql({ columnLimit: 100 });
                    // The metric filter must not survive into the collapsed
                    // totals grain; it is enforced by the semi-join instead.
                    expect(sql).toContain('source_dimension_groups');
                    expect(sql).toMatchSnapshot();
                },
            );

            it('sums sum-of-rows table calcs over the shared filtered-groups CTE', () => {
                const composer = new QueryComposer(
                    {
                        metricQuery: {
                            ...METRIC_FILTERED_TOTALS_SOURCE,
                            tableCalculations: [
                                {
                                    name: 'metric_plus_two',
                                    displayName: 'Metric plus two',
                                    sql: '${table1.metric1} + 2',
                                    type: TableCalculationType.NUMBER,
                                    totalMode:
                                        TableCalculationTotalMode.SUM_OF_ROWS,
                                },
                            ],
                        },
                        pivotConfiguration: undefined,
                        totalConfiguration: {
                            kind: 'grandTotal',
                            subtotalDimensions: undefined,
                        },
                    },
                    CONTEXT,
                );

                const sql = composer.getSql({ columnLimit: 100 });
                expect(sql).toContain('source_aggregations');
                // Restriction and aggregations share one source embed.
                expect(sql.match(/source_rows AS \(/g)).toHaveLength(1);
                expect(sql).toMatchSnapshot();
            });
        });
    });
});
