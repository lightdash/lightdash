import {
    BinType,
    CustomDimensionType,
    ForbiddenError,
    TimeFrames,
} from '@lightdash/common';
import {
    BuildQueryProps,
    CompiledQuery,
    MetricQueryBuilder,
} from './queryBuilder';
import {
    bigqueryClientMock,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_AND_TABLE_CALCULATION,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_NUMBER,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH_ON_POSTGRES,
    EXPECTED_SQL_WITH_CUSTOM_SQL_DIMENSION,
    EXPECTED_SQL_WITH_SORTED_CUSTOM_DIMENSION,
    EXPLORE,
    EXPLORE_ALL_JOIN_TYPES_CHAIN,
    EXPLORE_BIGQUERY,
    EXPLORE_JOIN_CHAIN,
    EXPLORE_WITH_REQUIRED_FILTERS,
    EXPLORE_WITH_SQL_FILTER,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    METRIC_QUERY_ALL_JOIN_TYPES_CHAIN_SQL,
    METRIC_QUERY_JOIN_CHAIN,
    METRIC_QUERY_JOIN_CHAIN_SQL,
    METRIC_QUERY_SQL,
    METRIC_QUERY_SQL_BIGQUERY,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_TWO_TABLES_SQL,
    METRIC_QUERY_WITH_ADDITIONAL_METRIC,
    METRIC_QUERY_WITH_ADDITIONAL_METRIC_SQL,
    METRIC_QUERY_WITH_CUSTOM_DIMENSION,
    METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION,
    METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT,
    METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT_SQL,
    METRIC_QUERY_WITH_DISABLED_FILTER,
    METRIC_QUERY_WITH_DISABLED_FILTER_SQL,
    METRIC_QUERY_WITH_EMPTY_FILTER,
    METRIC_QUERY_WITH_EMPTY_FILTER_GROUPS,
    METRIC_QUERY_WITH_EMPTY_FILTER_SQL,
    METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
    METRIC_QUERY_WITH_EMPTY_METRIC_FILTER_SQL,
    METRIC_QUERY_WITH_FILTER,
    METRIC_QUERY_WITH_FILTER_AND_DISABLED_FILTER,
    METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
    METRIC_QUERY_WITH_FILTER_OR_OPERATOR_SQL,
    METRIC_QUERY_WITH_FILTER_SQL,
    METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM,
    METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM_SQL,
    METRIC_QUERY_WITH_METRIC_FILTER,
    METRIC_QUERY_WITH_METRIC_FILTER_AND_ONE_DISABLED_SQL,
    METRIC_QUERY_WITH_METRIC_FILTER_SQL,
    METRIC_QUERY_WITH_MONTH_NAME_SORT,
    METRIC_QUERY_WITH_MONTH_NAME_SORT_SQL,
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL,
    METRIC_QUERY_WITH_NESTED_METRIC_FILTERS,
    METRIC_QUERY_WITH_NESTED_METRIC_FILTERS_SQL,
    METRIC_QUERY_WITH_REQUIRED_FILTERS_SQL,
    METRIC_QUERY_WITH_SQL_FILTER,
    METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
    METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER_SQL,
    METRIC_QUERY_WITH_TABLE_REFERENCE,
    METRIC_QUERY_WITH_TABLE_REFERENCE_SQL,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './queryBuilder.mock';

const replaceWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim();

// Wrapper around class to simplify test calls
const buildQuery = (args: BuildQueryProps): CompiledQuery =>
    new MetricQueryBuilder(args).compileQuery();

describe('Query builder', () => {
    test('Should build simple metric query', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_SQL));
    });

    test('Should build simple metric query in BigQuery', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE_BIGQUERY,
                    compiledMetricQuery: METRIC_QUERY,
                    warehouseClient: bigqueryClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_SQL_BIGQUERY));
    });

    test('Should build metric query across two tables', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_TWO_TABLES_SQL));
    });

    test('Should build metric query where a field references another table', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_TABLE_REFERENCE,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_TABLE_REFERENCE_SQL),
        );
    });

    test('Should join table from filter dimension', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_WITH_FILTER_SQL));
    });

    test('should join chain of intermediary tables', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE_JOIN_CHAIN,
                    compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_JOIN_CHAIN_SQL));
    });

    test('should join chain of intermediary tables', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE_ALL_JOIN_TYPES_CHAIN,
                    compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_ALL_JOIN_TYPES_CHAIN_SQL),
        );
    });

    test('Should build query with filter OR operator', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_FILTER_OR_OPERATOR_SQL),
        );
    });

    test('Should build query with disabled filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_DISABLED_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_DISABLED_FILTER_SQL),
        );
    });

    test('Should build query with a filter and one disabled filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_FILTER_AND_DISABLED_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(
                METRIC_QUERY_WITH_METRIC_FILTER_AND_ONE_DISABLED_SQL,
            ),
        );
    });

    test('Should build query with nested filter operators', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL),
        );
    });

    test('Should build query with no filter when there are only empty filter groups ', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER_GROUPS,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_SQL));
    });

    test('Should build second query with metric filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_METRIC_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_WITH_METRIC_FILTER_SQL));
    });

    test('Should build query with metric filter (where filter is disabled) and metric references a dimension from a joined table', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(
                METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM_SQL,
            ),
        );
    });

    test('Should build second query with nested metric filters', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_NESTED_METRIC_FILTERS,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_NESTED_METRIC_FILTERS_SQL),
        );
    });

    test('Should build query with additional metric', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_ADDITIONAL_METRIC,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_ADDITIONAL_METRIC_SQL),
        );
    });

    test('Should build query with empty filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_WITH_EMPTY_FILTER_SQL));
    });

    test('Should build query with empty metric filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_EMPTY_METRIC_FILTER_SQL),
        );
    });

    test('Should build query with cte in table calculations filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER_SQL),
        );
    });

    test('Should throw error if user attributes are missing', () => {
        expect(
            () =>
                buildQuery({
                    explore: EXPLORE_WITH_SQL_FILTER,
                    compiledMetricQuery: METRIC_QUERY,
                    warehouseClient: warehouseClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
        ).toThrow(ForbiddenError);
    });

    test('Should replace user attributes from sql filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE_WITH_SQL_FILTER,
                    compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
                    warehouseClient: warehouseClientMock,
                    userAttributes: {
                        country: ['EU'],
                    },
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_WITH_SQL_FILTER));
    });

    it('buildQuery with custom dimension bin number', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    warehouseClient: bigqueryClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_NUMBER),
        );
    });

    it('buildQuery with custom dimension bin width', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                        compiledCustomDimensions: [
                            {
                                id: 'age_range',
                                name: 'Age range',
                                type: CustomDimensionType.BIN,
                                dimensionId: 'table1_dim1',
                                table: 'table1',
                                binType: BinType.FIXED_WIDTH,
                                binWidth: 10,
                            },
                        ],
                    },
                    warehouseClient: bigqueryClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH),
        );
    });

    it('buildQuery with custom dimension and table calculation', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                        tableCalculations: [
                            {
                                name: 'calc3',
                                displayName: '',
                                sql: '${table1.dim1} + 1',
                            },
                        ],
                        compiledTableCalculations: [
                            {
                                name: 'calc3',
                                displayName: '',
                                sql: '${table1.dim1} + 1',
                                compiledSql: 'table1_dim1 + 1',
                            },
                        ],
                    },

                    warehouseClient: bigqueryClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(
                EXPECTED_SQL_WITH_CUSTOM_DIMENSION_AND_TABLE_CALCULATION,
            ),
        );
    });

    it('buildQuery with sorted custom dimension', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                        sorts: [{ fieldId: 'age_range', descending: true }],
                    },

                    warehouseClient: bigqueryClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(EXPECTED_SQL_WITH_SORTED_CUSTOM_DIMENSION),
        );
    });

    it('buildQuery with custom dimension bin width on postgres', () => {
        // Concat function is different in postgres/redshift
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                        compiledCustomDimensions: [
                            {
                                id: 'age_range',
                                name: 'Age range',
                                type: CustomDimensionType.BIN,
                                dimensionId: 'table1_dim1',
                                table: 'table1',
                                binType: BinType.FIXED_WIDTH,
                                binWidth: 10,
                            },
                        ],
                    },
                    warehouseClient: warehouseClientMock,
                    userAttributes: {},
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(
                EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH_ON_POSTGRES,
            ),
        );
    });

    it('buildQuery with custom dimension not selected', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    dimensions: ['table1_dim1'], // without age_range
                },
                warehouseClient: bigqueryClientMock,
                userAttributes: {},
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).not.toContain('age_range');
    });
    it('Should build query with required filters with joined tables', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE_WITH_REQUIRED_FILTERS,
                    compiledMetricQuery: METRIC_QUERY,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_REQUIRED_FILTERS_SQL),
        );
    });

    it('Should build metric query with metric filters', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_METRIC_FILTER,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(replaceWhitespace(METRIC_QUERY_WITH_METRIC_FILTER_SQL));
    });

    it('Should build metric query with sort by dimension with timeinterval month name', () => {
        // Create a modified explore with a month name dimension
        const exploreWithMonthNameDimension = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    dimensions: {
                        ...EXPLORE.tables.table1.dimensions,
                        dim1: {
                            ...EXPLORE.tables.table1.dimensions.dim1,
                            timeInterval: TimeFrames.MONTH_NAME,
                        },
                    },
                },
            },
        };

        expect(
            replaceWhitespace(
                buildQuery({
                    explore: exploreWithMonthNameDimension,
                    compiledMetricQuery: METRIC_QUERY_WITH_MONTH_NAME_SORT,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_MONTH_NAME_SORT_SQL),
        );
    });

    it('Should build metric query with sort by dimension with timeinterval day of the week name', () => {
        // Create a modified explore with a day of week name dimension
        const exploreWithDayOfWeekNameDimension = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    dimensions: {
                        ...EXPLORE.tables.table1.dimensions,
                        dim1: {
                            ...EXPLORE.tables.table1.dimensions.dim1,
                            timeInterval: TimeFrames.DAY_OF_WEEK_NAME,
                        },
                    },
                },
            },
        };

        expect(
            replaceWhitespace(
                buildQuery({
                    explore: exploreWithDayOfWeekNameDimension,
                    compiledMetricQuery:
                        METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT_SQL),
        );
    });

    it('Should build metric query as a custom SQL dimension', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY_WITH_CUSTOM_SQL_DIMENSION,
                    warehouseClient: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toStrictEqual(
            replaceWhitespace(EXPECTED_SQL_WITH_CUSTOM_SQL_DIMENSION),
        );
    });

    it('should build metric query with custom bin dimension with a CTE and a metric inflation warning', () => {
        const result = buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: {
                ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                compiledCustomDimensions: [
                    {
                        id: 'age_range',
                        name: 'Age range',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table1_dim1',
                        table: 'table1',
                        binType: BinType.FIXED_NUMBER,
                        binNumber: 10,
                    },
                ],
                metrics: ['table1_metric1', 'table2_metric3'],
            },
            warehouseClient: warehouseClientMock,
            userAttributes: {},
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
        });

        // Check that the query was generated correctly
        expect(replaceWhitespace(result.query)).toContain(
            replaceWhitespace('WITH age_range_cte AS'),
        );

        // Check that a warning was generated
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].message).toContain(
            'could be inflated due to join relationships',
        );
        expect(result.warnings[0].tables).toContain('table2');
    });
});
