import {
    BinType,
    CustomDimensionType,
    FilterOperator,
    ForbiddenError,
    JoinRelationship,
    TimeFrames,
} from '@lightdash/common';
import {
    BuildQueryProps,
    CompiledQuery,
    MetricQueryBuilder,
} from './MetricQueryBuilder';
import {
    bigqueryClientMock,
    EXPECTED_SQL_WITH_CROSS_JOIN,
    EXPECTED_SQL_WITH_CROSS_TABLE_METRICS,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_AND_TABLE_CALCULATION,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_NUMBER,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH,
    EXPECTED_SQL_WITH_CUSTOM_DIMENSION_BIN_WIDTH_ON_POSTGRES,
    EXPECTED_SQL_WITH_CUSTOM_SQL_DIMENSION,
    EXPECTED_SQL_WITH_MANY_TO_ONE_JOIN,
    EXPECTED_SQL_WITH_SORTED_CUSTOM_DIMENSION,
    EXPLORE,
    EXPLORE_ALL_JOIN_TYPES_CHAIN,
    EXPLORE_BIGQUERY,
    EXPLORE_JOIN_CHAIN,
    EXPLORE_WITH_CROSS_TABLE_METRICS,
    EXPLORE_WITH_REQUIRED_FILTERS,
    EXPLORE_WITH_SQL_FILTER,
    EXPLORE_WITHOUT_JOIN_RELATIONSHIPS,
    EXPLORE_WITHOUT_PRIMARY_KEYS,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    METRIC_QUERY_ALL_JOIN_TYPES_CHAIN_SQL,
    METRIC_QUERY_CROSS_TABLE,
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
} from './MetricQueryBuilder.mock';

const replaceWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim();

// Wrapper around class to simplify test calls
const buildQuery = (
    args: Omit<BuildQueryProps, 'availableParameters'>,
): CompiledQuery =>
    new MetricQueryBuilder({ ...args, availableParameters: [] }).compileQuery();

// Wrapper around class to simplify test calls with useExperimentalMetricCtes=true
const buildQueryWithExperimentalCtes = (
    args: Omit<BuildQueryProps, 'availableParameters'>,
): CompiledQuery =>
    new MetricQueryBuilder({
        ...args,
        availableParameters: [],
    }).compileQuery(true);

describe('Query builder', () => {
    test('Should build simple metric query', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: METRIC_QUERY,
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: bigqueryClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: bigqueryClientMock,
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
                    warehouseSqlBuilder: bigqueryClientMock,
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

                    warehouseSqlBuilder: bigqueryClientMock,
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
                        sorts: [
                            {
                                fieldId: 'age_range',
                                descending: true,
                            },
                        ],
                    },

                    warehouseSqlBuilder: bigqueryClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                warehouseSqlBuilder: bigqueryClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
                    warehouseSqlBuilder: warehouseClientMock,
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
            warehouseSqlBuilder: warehouseClientMock,
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

    describe('Parameters', () => {
        test('Should build query with parameters in dimensions', () => {
            const exploreWithParameterDimension = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        dimensions: {
                            ...EXPLORE.tables.table1.dimensions,
                            dim1: {
                                ...EXPLORE.tables.table1.dimensions.dim1,
                                compiledSql:
                                    'CASE WHEN ${lightdash.parameters.status} = \'active\' THEN "table1".dim1 ELSE NULL END',
                            },
                        },
                    },
                },
            };

            const result = buildQuery({
                explore: exploreWithParameterDimension,
                compiledMetricQuery: METRIC_QUERY,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                parameters: { status: 'active' },
            });

            expect(result.query).toContain(
                "CASE WHEN 'active' = 'active' THEN \"table1\".dim1 ELSE NULL END",
            );
        });

        test('Should build query with parameters in sql_on statements', () => {
            const exploreWithParameterJoin = {
                ...EXPLORE,
                joinedTables: [
                    {
                        table: 'table2',
                        sqlOn: "${table1.shared} = ${table2.shared} AND ${lightdash.parameters.status} = 'active'",
                        compiledSqlOn:
                            '("table1".shared) = ("table2".shared) AND ${lightdash.parameters.status} = \'active\'',
                        type: undefined,
                        tablesReferences: ['table1', 'table2'],
                        relationship: JoinRelationship.MANY_TO_ONE,
                    },
                ],
            };

            const result = buildQuery({
                explore: exploreWithParameterJoin,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                parameters: { status: 'active' },
            });

            expect(result.query).toContain(
                '("table1".shared) = ("table2".shared) AND \'active\' = \'active\'',
            );
        });

        test('Should correctly identify usedParameters in query', () => {
            // Create a QueryBuilder instance directly to test getSqlAndReferences
            const queryBuilder = new MetricQueryBuilder({
                explore: {
                    ...EXPLORE,
                    tables: {
                        ...EXPLORE.tables,
                        table1: {
                            ...EXPLORE.tables.table1,
                            dimensions: {
                                ...EXPLORE.tables.table1.dimensions,
                                dim1: {
                                    ...EXPLORE.tables.table1.dimensions.dim1,
                                    compiledSql:
                                        'CASE WHEN ${lightdash.parameters.status} = \'active\' THEN "table1".dim1 WHEN ${lightdash.parameters.region} = \'EU\' THEN "table1".dim2 ELSE NULL END',
                                },
                            },
                        },
                    },
                },
                compiledMetricQuery: METRIC_QUERY,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                parameters: {
                    status: 'active',
                    region: 'EU',
                    unused: 'parameter',
                },
                availableParameters: ['status', 'region', 'unused'],
            });

            const compiledQuery = queryBuilder.compileQuery();

            // Check that usedParameters only includes parameters that are actually used in the query
            expect(compiledQuery.usedParameters).toEqual({
                status: 'active',
                region: 'EU',
            });

            // Verify that unused parameter is not included
            expect(compiledQuery.usedParameters).not.toHaveProperty('unused');
        });
    });

    describe('Query builder with useExperimentalMetricCtes=true', () => {
        test('Should build query with CTEs for metrics to prevent inflation', () => {
            // Use the imported explore mock with MANY_TO_ONE relationship to trigger metric inflation
            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    metrics: ['table1_metric1', 'table2_metric3'],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.warnings).toHaveLength(0);
            expect(replaceWhitespace(result.query)).toBe(
                replaceWhitespace(EXPECTED_SQL_WITH_MANY_TO_ONE_JOIN),
            );
        });

        test('Should build query with CTEs for metrics and CROSS join', () => {
            // Use the imported explore mock with MANY_TO_ONE relationship to trigger metric inflation
            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: [], // no dimensions in the query causes a CROSS join
                    metrics: ['table1_metric1', 'table2_metric3'],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.warnings).toHaveLength(0);
            expect(replaceWhitespace(result.query)).toBe(
                replaceWhitespace(EXPECTED_SQL_WITH_CROSS_JOIN),
            );
        });

        test('Should handle inflation-proof metrics correctly', () => {
            // Create a metric query that includes both the count distinct metric and the sum metric
            const metricQueryWithMixedMetrics = {
                ...METRIC_QUERY_TWO_TABLES,
                metrics: [
                    'table2_metric2',
                    'table1_metric1',
                    'table1_metric_that_references_dim_from_table2',
                ],
            };

            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithMixedMetrics,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(result.warnings).toHaveLength(0);
            expect(result.query).not.toContain('cte_keys_');
            expect(result.query).not.toContain('cte_metrics_');
            expect(result.query).not.toContain('cte_unaffected');
        });

        test('Should generate warnings for tables without primary keys', () => {
            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE_WITHOUT_PRIMARY_KEYS,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have warnings about missing primary keys
            expect(
                result.warnings.some((w) =>
                    w.message.includes('missing a primary key definition'),
                ),
            ).toBe(true);

            // Should have warnings about metrics that could be inflated
            expect(
                result.warnings.some((w) =>
                    w.message.includes(
                        'could be inflated due to table missing primary key definition',
                    ),
                ),
            ).toBe(true);
        });

        test('Should generate warnings for joins without relationship type', () => {
            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE_WITHOUT_JOIN_RELATIONSHIPS,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have warnings about missing relationship type
            expect(
                result.warnings.some((w) =>
                    w.message.includes('missing a join relationship type'),
                ),
            ).toBe(true);

            // Should have warnings about metrics that could be inflated
            expect(
                result.warnings.some((w) =>
                    w.message.includes(
                        'could be inflated due to missing join relationship type',
                    ),
                ),
            ).toBe(true);
        });

        test('Should handle metrics that reference other metrics from joined tables', () => {
            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE_WITH_CROSS_TABLE_METRICS,
                compiledMetricQuery: METRIC_QUERY_CROSS_TABLE,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(replaceWhitespace(result.query)).toBe(
                replaceWhitespace(EXPECTED_SQL_WITH_CROSS_TABLE_METRICS),
            );
        });

        test('Should handle metrics referencing other metrics when base metrics are also selected', () => {
            const result = buildQueryWithExperimentalCtes({
                explore: EXPLORE_WITH_CROSS_TABLE_METRICS,
                compiledMetricQuery: {
                    ...METRIC_QUERY_CROSS_TABLE,
                    metrics: [
                        'orders_revenue_per_customer',
                        'orders_total_order_amount',
                        'customers_total_customers',
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            const sql = result.query;

            const countOccurrences = (search: string) => {
                // escape all special characters
                const escapedSearch = search.replace(
                    /[-[\]{}()*+?.,\\^$|#\s]/g,
                    '\\$&',
                );
                const matches = sql.match(new RegExp(escapedSearch, 'g')) || [];
                return matches.length;
            };

            expect(
                countOccurrences(
                    'SUM("orders".amount) AS "orders_total_order_amount"',
                ),
            ).toBe(1);
            expect(
                countOccurrences(
                    'COUNT("customers".customer_id) AS "customers_total_customers"',
                ),
            ).toBe(1);
            expect(
                countOccurrences(
                    'cte_unaffected."orders_total_order_amount" / cte_metrics_customers."customers_total_customers" AS "orders_revenue_per_customer"',
                ),
            ).toBe(1);
        });
    });
});

describe('Escaping filters', () => {
    test('Should return valid SQL filter', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY,
                        filters: {
                            dimensions: {
                                id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                                and: [
                                    {
                                        id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                        target: { fieldId: 'table1_dim1' },
                                        operator: FilterOperator.EQUALS,
                                        values: ['999'],
                                    },
                                ],
                            },
                        },
                    },
                    warehouseSqlBuilder: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toContain(replaceWhitespace(`WHERE (( ("table1".dim1) IN (999) ))`));
    });

    test('Should throw when invalid number is provided', () => {
        expect(() =>
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY,
                        filters: {
                            dimensions: {
                                id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                                and: [
                                    {
                                        id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                        target: { fieldId: 'table1_dim1' },
                                        operator: FilterOperator.EQUALS,
                                        values: ['99) OR (1=1) --'],
                                    },
                                ],
                            },
                        },
                    },
                    warehouseSqlBuilder: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toThrow(
            'Invalid number value in filter: "99) OR (1=1) ". Expected a valid number.',
        );
    });

    test('Should return valid SQL filter with escaped quotes in postgres', () => {
        expect(
            replaceWhitespace(
                buildQuery({
                    explore: EXPLORE,
                    compiledMetricQuery: {
                        ...METRIC_QUERY,
                        filters: {
                            dimensions: {
                                id: '7e750e7c-8098-4a90-b364-4e935ad7a7e9',
                                and: [
                                    {
                                        id: 'd69d3ba0-6ff5-4437-9ef3-4ed69006ea2e',
                                        target: { fieldId: 'table1_shared' },
                                        operator: FilterOperator.EQUALS,
                                        values: ["\\') OR (1=1) --"],
                                    },
                                ],
                            },
                        },
                    },
                    warehouseSqlBuilder: warehouseClientMock,
                    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                    timezone: QUERY_BUILDER_UTC_TIMEZONE,
                }).query,
            ),
        ).toContain(
            replaceWhitespace(
                `WHERE (( ("table1".shared) IN ('\\\\'') OR (1=1) ') ))`,
            ),
        );
    });
});
