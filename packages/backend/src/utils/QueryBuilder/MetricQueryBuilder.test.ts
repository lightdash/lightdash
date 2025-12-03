import {
    AnyType,
    BinType,
    CustomDimensionType,
    DimensionType,
    Explore,
    FieldType,
    FilterOperator,
    ForbiddenError,
    JoinRelationship,
    MetricType,
    SortByDirection,
    TimeFrames,
    VizAggregationOptions,
    VizIndexType,
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
    args: Omit<BuildQueryProps, 'parameterDefinitions'>,
): CompiledQuery =>
    new MetricQueryBuilder({
        ...args,
        parameterDefinitions: {},
    }).compileQuery();

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
                                dependsOn: [],
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

    describe('getNullsFirstLast static method', () => {
        test('Should return empty string when nullsFirst is null', () => {
            const sort = {
                fieldId: 'test',
                descending: false,
                nullsFirst: undefined,
            };
            expect(MetricQueryBuilder.getNullsFirstLast(sort)).toBe('');
        });

        test('Should return " NULLS FIRST" when nullsFirst is true', () => {
            const sort = {
                fieldId: 'test',
                descending: false,
                nullsFirst: true,
            };
            expect(MetricQueryBuilder.getNullsFirstLast(sort)).toBe(
                ' NULLS FIRST',
            );
        });

        test('Should return " NULLS LAST" when nullsFirst is false', () => {
            const sort = {
                fieldId: 'test',
                descending: false,
                nullsFirst: false,
            };
            expect(MetricQueryBuilder.getNullsFirstLast(sort)).toBe(
                ' NULLS LAST',
            );
        });

        test('Should work correctly with descending sort', () => {
            const sortFirst = {
                fieldId: 'test',
                descending: true,
                nullsFirst: true,
            };
            const sortLast = {
                fieldId: 'test',
                descending: true,
                nullsFirst: false,
            };

            expect(MetricQueryBuilder.getNullsFirstLast(sortFirst)).toBe(
                ' NULLS FIRST',
            );
            expect(MetricQueryBuilder.getNullsFirstLast(sortLast)).toBe(
                ' NULLS LAST',
            );
        });
    });

    describe('nullsFirst in sort queries', () => {
        test('Should build query with NULLS FIRST on dimension', () => {
            const queryWithNullsFirst = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsFirst.query).toContain(
                'ORDER BY "table1_dim1" NULLS FIRST',
            );
        });

        test('Should build query with NULLS LAST on dimension', () => {
            const queryWithNullsLast = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: false,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsLast.query).toContain(
                'ORDER BY "table1_dim1" NULLS LAST',
            );
        });

        test('Should build query with NULLS FIRST on metric descending', () => {
            const queryWithNullsFirst = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsFirst.query).toContain(
                'ORDER BY "table1_metric1" DESC NULLS FIRST',
            );
        });

        test('Should build query with NULLS LAST on metric descending', () => {
            const queryWithNullsLast = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: false,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithNullsLast.query).toContain(
                'ORDER BY "table1_metric1" DESC NULLS LAST',
            );
        });

        test('Should build query with multiple sorts using nullsFirst', () => {
            const queryWithMultipleSorts = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: true,
                        },
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: false,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithMultipleSorts.query).toContain(
                'ORDER BY "table1_dim1" NULLS FIRST, "table1_metric1" DESC NULLS LAST',
            );
        });

        test('Should build query with mixed nullsFirst values', () => {
            const queryWithMixedNulls = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    sorts: [
                        {
                            fieldId: 'table1_dim1',
                            descending: false,
                            nullsFirst: undefined, // Should omit NULLS clause
                        },
                        {
                            fieldId: 'table1_metric1',
                            descending: true,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            const orderByClause =
                queryWithMixedNulls.query.match(/ORDER BY[^;]+/)?.[0];
            expect(orderByClause).toContain('"table1_dim1"');
            expect(orderByClause).not.toContain('"table1_dim1" NULLS');
            expect(orderByClause).toContain(
                '"table1_metric1" DESC NULLS FIRST',
            );
        });

        test('Should work with custom bin dimensions and nullsFirst', () => {
            const queryWithCustomDimAndNullsFirst = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    sorts: [
                        {
                            fieldId: 'age_range',
                            descending: false,
                            nullsFirst: true,
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            expect(queryWithCustomDimAndNullsFirst.query).toContain(
                '"age_range_order" NULLS FIRST',
            );
        });
    });

    describe('PostCalculation Metrics', () => {
        test('Should build query with percent_of_total postcalculation metric', () => {
            // Create an explore with a postcalculation metric
            const exploreWithPostCalcMetric = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        metrics: {
                            ...EXPLORE.tables.table1.metrics,
                            percent_of_total_metric: {
                                type: MetricType.PERCENT_OF_TOTAL,
                                fieldType: FieldType.METRIC as const,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'percent_of_total_metric',
                                label: 'Percent of Total',
                                sql: '${table1.metric1}',
                                compiledSql: '...',
                                tablesReferences: ['table1'],
                                hidden: false,
                            },
                        },
                    },
                },
            };

            const metricQueryWithPostCalc = {
                ...METRIC_QUERY,
                metrics: ['table1_metric1', 'table1_percent_of_total_metric'],
                tableCalculations: [],
                compiledTableCalculations: [],
            };

            const result = buildQuery({
                explore: exploreWithPostCalcMetric,
                compiledMetricQuery: metricQueryWithPostCalc,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            const expectedSQL = `WITH metrics AS (
SELECT
  "table1".dim1 AS "table1_dim1",
  MAX("table1".number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS "table1"

GROUP BY 1
),
postcalculation_metrics AS (
SELECT
  *,
  (CAST(metrics."table1_metric1" AS FLOAT) / CAST(NULLIF(SUM(metrics."table1_metric1") OVER(), 0) AS FLOAT)) AS "table1_percent_of_total_metric"
FROM metrics
)
SELECT
  *
FROM postcalculation_metrics
ORDER BY "table1_metric1" DESC
LIMIT 10`;

            expect(replaceWhitespace(result.query)).toStrictEqual(
                replaceWhitespace(expectedSQL),
            );
        });

        test('Should build query with running_total postcalculation metric and pivot configuration', () => {
            // Create an explore with a running_total metric and two dimensions
            const exploreWithRunningTotalAndDimensions: Explore = {
                ...EXPLORE,
                tables: {
                    ...EXPLORE.tables,
                    table1: {
                        ...EXPLORE.tables.table1,
                        dimensions: {
                            ...EXPLORE.tables.table1.dimensions,
                            category: {
                                type: DimensionType.STRING,
                                name: 'category',
                                label: 'Category',
                                table: 'table1',
                                tableLabel: 'table1',
                                fieldType: FieldType.DIMENSION,
                                sql: '${TABLE}.category',
                                compiledSql: '"table1".category',
                                tablesReferences: ['table1'],
                                hidden: false,
                            },
                        },
                        metrics: {
                            ...EXPLORE.tables.table1.metrics,
                            running_total_metric: {
                                type: MetricType.RUNNING_TOTAL,
                                fieldType: FieldType.METRIC,
                                table: 'table1',
                                tableLabel: 'table1',
                                name: 'running_total_metric',
                                label: 'Running Total',
                                sql: '${table1.metric1}',
                                compiledSql: '...',
                                tablesReferences: ['table1'],
                                hidden: false,
                            },
                        },
                    },
                },
            };

            const metricQueryWithPivot = {
                ...METRIC_QUERY,
                dimensions: ['table1_dim1', 'table1_category'],
                metrics: ['table1_running_total_metric'],
                tableCalculations: [],
                compiledTableCalculations: [],
            };

            const pivotConfiguration = {
                indexColumn: [
                    { reference: 'table1_dim1', type: VizIndexType.CATEGORY },
                ],
                valuesColumns: [
                    {
                        reference: 'table1_running_total_metric',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
                groupByColumns: [{ reference: 'table1_category' }],
                sortBy: [
                    {
                        reference: 'table1_dim1',
                        direction: SortByDirection.ASC,
                    },
                ],
            };

            const result = buildQuery({
                explore: exploreWithRunningTotalAndDimensions,
                compiledMetricQuery: metricQueryWithPivot,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                pivotConfiguration,
            });

            const expectedSQL = `WITH metrics AS (
SELECT
  "table1".dim1 AS "table1_dim1",
  "table1".category AS "table1_category",
  MAX("table1".number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS "table1"

GROUP BY 1,2
),
postcalculation_metrics AS (
SELECT
  *,
  SUM(metrics."table1_metric1") OVER (PARTITION BY "table1_category"ORDER BY "table1_metric1" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "table1_running_total_metric"
FROM metrics
)
SELECT
  *
FROM postcalculation_metrics
ORDER BY "table1_metric1" DESC
LIMIT 10`;

            // Should create a postcalculation metrics CTE and include pivot configuration handling
            expect(result.query).toContain('postcalculation_metrics AS');
            expect(result.query).toContain('"table1_running_total_metric"');
            expect(result.query).toContain('"table1_dim1"');
            expect(result.query).toContain('"table1_category"');
            expect(replaceWhitespace(result.query)).toStrictEqual(
                replaceWhitespace(expectedSQL),
            );
        });
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
                parameterDefinitions: {
                    status: { label: 'Status', type: 'string' },
                    region: { label: 'Region', type: 'string' },
                    unused: { label: 'Unused', type: 'string' },
                },
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

    describe('Query builder with deduplication', () => {
        test('Should build query with CTEs for metrics to prevent inflation', () => {
            // Use the imported explore mock with MANY_TO_ONE relationship to trigger metric inflation
            const result = buildQuery({
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
            const result = buildQuery({
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

            const result = buildQuery({
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
            const result = buildQuery({
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
            const result = buildQuery({
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
            const result = buildQuery({
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
            const result = buildQuery({
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

        test('Should include filter-only metric in fanout CTE but exclude from final SELECT', () => {
            // Query with dimension + metric1 selected, but filter on metric3 (from joined table with fanout)
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select table1_metric1
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on table2_metric3 but don't select it
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [100],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate table2_metric3 in the CTE
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have metric filter applied
            expect(result.query).toContain('("table2_metric3") > (100)');

            // Should NOT include table2_metric3 in the final column list
            // The final SELECT should explicitly list columns, not use *
            expect(result.query).toContain('"table1_dim1"');
            expect(result.query).toContain('"table1_metric1"');

            // Verify the final SELECT doesn't use SELECT * when filter-only metrics exist
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+(?:WHERE|ORDER|LIMIT)/s,
            );
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                // Should not be just "*"
                expect(selectClause).not.toBe('*');
            }
        });

        test('Should handle filter-only metric from same table (no fanout needed)', () => {
            // Query with filter on a metric from the same table as the selected metric
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Selected metric
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table1_metric1', // Filter on same metric (not filter-only)
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [50],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should NOT create fanout CTEs (same table, no fanout risk)
            expect(result.query).not.toContain('cte_keys_');
            expect(result.query).not.toContain('cte_metrics_');

            // Should have metric filter applied
            expect(result.query).toContain('("table1_metric1") > (50)');
        });

        test('Should handle multiple filter-only metrics with fanout protection', () => {
            // Query filtering on both table2_metric2 and table2_metric3 but only selecting table1_metric1
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select from table1
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric2', // Filter on metric2
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [50],
                                },
                                {
                                    id: '2',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on metric3
                                    },
                                    operator: FilterOperator.LESS_THAN,
                                    values: [200],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate both filter-only metrics in the CTE
            expect(result.query).toContain(
                'MAX("table2".number_column) AS "table2_metric2"',
            );
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have both metric filters applied
            expect(result.query).toContain('("table2_metric2") > (50)');
            expect(result.query).toContain('("table2_metric3") < (200)');

            // Final SELECT should only include table1 fields
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+(?:WHERE|ORDER|LIMIT)/s,
            );
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                expect(selectClause).toContain('"table1_dim1"');
                expect(selectClause).toContain('"table1_metric1"');
            }
        });

        test('Should handle mix of selected and filter-only metrics from joined table', () => {
            // Query selecting table2_metric2 and filtering on table2_metric3
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1', 'table2_metric2'], // Select metric2
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on metric3 (filter-only)
                                    },
                                    operator: FilterOperator.NOT_NULL,
                                    values: [],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table2_metric2', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate both metric2 (selected) and metric3 (filter-only) in the CTE
            expect(result.query).toContain(
                'MAX("table2".number_column) AS "table2_metric2"',
            );
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have metric filter applied
            expect(result.query).toContain('("table2_metric3") IS NOT NULL');

            // Final SELECT should include table1_dim1, table1_metric1, and table2_metric2 but NOT table2_metric3
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+(?:WHERE|ORDER|LIMIT)/s,
            );
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                expect(selectClause).toContain('"table1_dim1"');
                expect(selectClause).toContain('"table1_metric1"');
                expect(selectClause).toContain('"table2_metric2"');
                // Should not select table2_metric3 even though it's calculated in the CTE
            }
        });

        test('Should handle filter-only metric with table calculations', () => {
            // Query with filter-only metric and table calculations
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select table1_metric1
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on table2_metric3
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: [100],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                        },
                    ],
                    compiledTableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                            compiledSql: '"table1_metric1" * 2',
                            dependsOn: [],
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should create fanout CTEs for table2
            expect(result.query).toContain('cte_keys_table2');
            expect(result.query).toContain('cte_metrics_table2');

            // Should calculate filter-only metric in the CTE
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Should have metric filter applied in WHERE clause
            expect(result.query).toContain('("table2_metric3") IN (100)');

            // Final SELECT should explicitly list only the selected columns (not SELECT *)
            const finalSelectMatch = result.query.match(
                /SELECT\s+(.*?)\s+FROM\s+metrics\s+WHERE/s,
            );
            expect(finalSelectMatch).toBeTruthy();
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                // Should include the selected dimension and metric
                expect(selectClause).toContain('"table1_dim1"');
                expect(selectClause).toContain('"table1_metric1"');
                // Should include the table calculation
                expect(selectClause).toContain('"calc1"');
                // Should NOT be SELECT * (since we have filter-only metrics)
                expect(selectClause).not.toBe('*');
            }
        });

        test('Should include table calculation in SELECT when table calc has filter AND filter-only metric exists', () => {
            // Reproduces bug: table calc displays as "-" when:
            // 1. Table calculation is in results
            // 2. Table calculation has a filter
            // 3. A metric NOT in results IS in filter
            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'], // Only select table1_metric1
                    filters: {
                        metrics: {
                            id: 'metric-filter-root',
                            and: [
                                {
                                    id: 'metric-filter-1',
                                    target: {
                                        fieldId: 'table2_metric3', // Filter on table2_metric3 (not in SELECT)
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: [100],
                                },
                            ],
                        },
                        tableCalculations: {
                            id: 'tc-filter-root',
                            and: [
                                {
                                    id: 'tc-filter-1',
                                    target: {
                                        fieldId: 'calc1',
                                    },
                                    operator: FilterOperator.NOT_NULL,
                                    values: [],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                        },
                    ],
                    compiledTableCalculations: [
                        {
                            name: 'calc1',
                            displayName: 'Calc 1',
                            sql: '${table1.metric1} * 2',
                            compiledSql: '"table1_metric1" * 2',
                            dependsOn: [],
                        },
                    ],
                },
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have table_calculations CTE (because table calc has filter)
            expect(result.query).toContain('table_calculations AS (');

            // Should calculate filter-only metric in the CTE
            expect(result.query).toContain(
                'SUM("table2".number_column) AS "table2_metric3"',
            );

            // Final SELECT should explicitly include the table calculation
            // Match the SELECT after the CTE closing paren (not the SELECT inside the CTE)
            const finalSelectMatch = result.query.match(
                /\)\s*SELECT\s+(.*?)\s+FROM\s+table_calculations\s+WHERE/s,
            );
            expect(finalSelectMatch).toBeTruthy();
            if (finalSelectMatch) {
                const selectClause = finalSelectMatch[1].trim();
                // Should include the selected dimension
                expect(selectClause).toContain('"table1_dim1"');
                // Should include the selected metric
                expect(selectClause).toContain('"table1_metric1"');
                // Should include the table calculation (this was the bug - it was missing)
                expect(selectClause).toContain('"calc1"');
                // Should NOT include the filter-only metric
                expect(selectClause).not.toContain('"table2_metric3"');
                // Should NOT be SELECT * (since we have filter-only metrics)
                expect(selectClause).not.toBe('*');
            }

            // Should have both metric and table calc filters in WHERE clause
            expect(result.query).toContain('("table2_metric3") IN (100)');
            expect(result.query).toContain('("calc1") IS NOT NULL');
        });
    });

    describe('Table Calculations', () => {
        test('Should build query with simple table calculations (no CTEs)', () => {
            const metricQueryWithSimpleTableCalcs = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} + 100',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} + 100',
                        compiledSql: '"table1_metric1" + 100',
                        dependsOn: [],
                        // No CTE since it doesn't reference other table calculations
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithSimpleTableCalcs,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have the simple table calculation inline in the final SELECT
            expect(result.query).toContain(
                '"table1_metric1" + 100 AS "simple_calc"',
            );

            // Should have basic metrics CTE but no table calculation CTEs
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).not.toContain('tc_simple_calc AS (');

            // Should select from metrics CTE with inline table calculation
            expect(result.query).toContain('FROM metrics');
        });

        test('Should build query with table calculation CTEs for dependent calculations', () => {
            const metricQueryWithDependentTableCalcs = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 50',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 2',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 50',
                        compiledSql: '"table1_metric1" + 50',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 2',
                        compiledSql: '"base_calc" * 2',
                        dependsOn: ['base_calc'],
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithDependentTableCalcs,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have CTEs for dependent table calculations
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_base_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_dependent_calc');

            // Should reference the base_calc
            expect(result.query).toContain('"base_calc" * 2');
        });

        test('Should build query with mixed table calculations (some with CTEs, some inline)', () => {
            const metricQueryWithMixedTableCalcs = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} / 10',
                    },
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 25',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 3',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_calc',
                        displayName: 'Simple Calc',
                        sql: '${table1.metric1} / 10',
                        compiledSql: '"table1_metric1" / 10',
                        dependsOn: [],
                        // No CTE - not referenced by others
                    },
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 25',
                        compiledSql: '"table1_metric1" + 25',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 3',
                        compiledSql: '"base_calc" * 3',
                        dependsOn: ['base_calc'],
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithMixedTableCalcs,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have CTEs for dependent calculations but include simple calc in table_calculations CTE
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('table_calculations AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should include simple calculation in the table_calculations CTE
            expect(result.query).toContain(
                '"table1_metric1" / 10 AS "simple_calc"',
            );

            // Should select from the final dependent CTE
            expect(result.query).toContain('FROM tc_dependent_calc');
        });

        test('Should build query with complex table calculation dependencies (referencing multiple calcs)', () => {
            const metricQueryWithComplexDeps = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'calc_a',
                        displayName: 'Calc A',
                        sql: '${table1.metric1} + 10',
                    },
                    {
                        name: 'calc_b',
                        displayName: 'Calc B',
                        sql: '${table1.metric1} * 2',
                    },
                    {
                        name: 'calc_c',
                        displayName: 'Calc C',
                        sql: '${calc_a} + ${calc_b}',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'calc_a',
                        displayName: 'Calc A',
                        sql: '${table1.metric1} + 10',
                        compiledSql: '"table1_metric1" + 10',
                        dependsOn: [],
                    },
                    {
                        name: 'calc_b',
                        displayName: 'Calc B',
                        sql: '${table1.metric1} * 2',
                        compiledSql: '"table1_metric1" * 2',
                        dependsOn: [],
                    },
                    {
                        name: 'calc_c',
                        displayName: 'Calc C',
                        sql: '${calc_a} + ${calc_b}',
                        compiledSql: '"calc_a" + "calc_b"',
                        dependsOn: ['calc_a', 'calc_b'],
                    },
                ],
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithComplexDeps,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have all CTEs in correct order (no table_calculations CTE for this case)
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_calc_a AS (');
            expect(result.query).toContain('tc_calc_b AS (');
            expect(result.query).toContain('tc_calc_c AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_calc_c');

            // Should show the CTE reference resolution working correctly
            expect(result.query).toContain('"calc_a" + "calc_b"');
        });

        test('Should build query with table calculation filters using CTEs', () => {
            const metricQueryWithTableCalcFilter = {
                ...METRIC_QUERY,
                tableCalculations: [
                    {
                        name: 'filtered_calc',
                        displayName: 'Filtered Calc',
                        sql: '${table1.metric1} * 1.5',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${filtered_calc} + 100',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'filtered_calc',
                        displayName: 'Filtered Calc',
                        sql: '${table1.metric1} * 1.5',
                        compiledSql: '"table1_metric1" * 1.5',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${filtered_calc} + 100',
                        compiledSql: '"filtered_calc" + 100',
                        dependsOn: ['filtered_calc'],
                    },
                ],
                filters: {
                    tableCalculations: {
                        id: 'table-calc-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'filtered_calc' },
                                operator: FilterOperator.EQUALS,
                                values: ['100'],
                            },
                        ],
                    },
                },
            };

            const result = buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: metricQueryWithTableCalcFilter,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            });

            // Should have CTEs for the dependent table calculations
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_filtered_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from final CTE with table calculation filter applied
            expect(result.query).toContain('FROM tc_dependent_calc');

            // Should have the table calculation filter in the WHERE clause
            expect(result.query).toContain('WHERE');
            expect(result.query).toContain('"filtered_calc") IN (\'100\')');
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

// Query Structure Tests
describe('Query Structure Tests', () => {
    // Helper function to build query with default props
    const buildTestQuery = (
        props: Partial<BuildQueryProps> & { compiledMetricQuery: AnyType },
    ): CompiledQuery =>
        buildQuery({
            explore: EXPLORE,
            warehouseSqlBuilder: warehouseClientMock,
            intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
            timezone: QUERY_BUILDER_UTC_TIMEZONE,
            ...props,
        });

    test('Case 1: Just a metric', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: undefined,
                    tableCalculations: undefined,
                },
                tableCalculations: [], // Override existing table calculations
                compiledTableCalculations: [], // Override existing compiled table calculations
            },
        });

        // Should NOT have WITH clause
        expect(result.query).not.toContain('WITH');

        // Should have direct SELECT with metric
        expect(result.query).toContain('SELECT');
        expect(result.query).toContain(
            'MAX("table1".number_column) AS "table1_metric1"',
        );
        expect(result.query).toContain(
            'FROM "db"."schema"."table1" AS "table1"',
        );
        expect(result.query).toContain('GROUP BY');
    });

    test('Case 2: Metric + metric filter', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: undefined,
                },
                tableCalculations: [], // Override existing table calculations
                compiledTableCalculations: [], // Override existing compiled table calculations
            },
        });

        // Should have WITH metrics CTE only (no metric_filters CTE)
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');
        expect(result.query).not.toContain('metric_filters AS (');

        // TODO: should not contain table_calculations CTE
        // TODO: should contain no tc_ ctes
        // TODO: should not contain metric_filters CTE

        // Should not contain table_calculations CTE (no table calculations)
        expect(result.query).not.toContain('table_calculations AS (');

        // Should contain no tc_ CTEs (no dependent table calculations)
        expect(result.query).not.toContain('tc_');

        // Should not contain metric_filters CTE (handled inline)
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have final SELECT directly FROM metrics with WHERE (not from metric_filters)
        expect(result.query).toContain('SELECT\n  *\nFROM metrics');
        expect(result.query).not.toContain('FROM metric_filters');
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('IS NOT NULL');
    });

    test('Case 3: Metric + metric filter + simple TC - should optimize simple TC to final SELECT', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: undefined,
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                ],
            },
        });

        // Should have WITH metrics CTE only
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');

        expect(result.query).not.toContain('table_calculations AS (');
        expect(result.query).not.toContain('tc_simple_tc AS (');

        // Should not contain metric_filters CTE (filters handled inline)
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have simple TC directly in final SELECT
        expect(result.query).toContain('"table1_metric1" AS "simple_tc"');
        expect(result.query).toContain('FROM metrics');
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('IS NOT NULL');
    });
    test('Case 4: Metric + metric filter + simple TC + simple TC filter', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'tc-filter-id',
                                target: { fieldId: 'simple_tc' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                ],
            },
        });

        // Should have WITH metrics and table_calculations CTE (needed because of TC filter)
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).not.toContain('metric_filters AS (');

        // Should not contain metric_filters CTE (metric filters included in table_calculations CTE)
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have simple TC in table_calculations CTE
        expect(result.query).toContain('"table1_metric1" AS "simple_tc"');
        expect(result.query).toContain('FROM table_calculations');

        // Should select from table_calculations CTE (not metrics)
        expect(result.query).toContain('SELECT\n  *\nFROM table_calculations');
        expect(result.query).toContain('WHERE');

        // Metric filter should be in table_calculations CTE, table calc filter in final WHERE
        expect(result.query).toContain('"table1_metric1"'); // metric filter

        // Should contain the specific table calculation filter
        expect(result.query).toContain('"simple_tc"'); // table calc filter
        expect(result.query).toContain('IS NOT NULL');
    });
    test('Case 5: Metric + metric filter + simple TC + dependent TCs - should create full CTE chain', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: undefined,
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: '"depended_on" + 10',
                        dependsOn: ['depended_on'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> table_calculations -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        expect(result.query).toContain('IS NOT NULL');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tableCalculationsIndex = result.query.indexOf(
            'table_calculations AS (',
        );
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tableCalculationsIndex);
        expect(tableCalculationsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });
    test('Case 6: Metric + metric filter + simple TC + simple TC filter + dependent TCs', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'tc-filter-id',
                                target: { fieldId: 'simple_tc' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: '"depended_on" + 10',
                        dependsOn: ['depended_on'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> table_calculations -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        const metricFiltersMatch = result.query.match(
            /metric_filters AS \(([\s\S]*?)\n\s*\),/,
        );
        expect(metricFiltersMatch).toBeTruthy();
        expect(metricFiltersMatch![1]).toContain('IS NOT NULL');

        // Should have table calc filter in final WHERE clause
        const finalWhereIndex = result.query.lastIndexOf('WHERE');
        const finalWhereClause = result.query.substring(finalWhereIndex);
        expect(finalWhereClause).toContain('"simple_tc"');
        expect(finalWhereClause).toContain('IS NOT NULL');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tableCalculationsIndex = result.query.indexOf(
            'table_calculations AS (',
        );
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tableCalculationsIndex);
        expect(tableCalculationsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });
    test('Case 7: Metric + metric filter + simple TC + simple TC filter + dependent TCs + dependent TC filter', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'simple-tc-filter-id',
                                target: { fieldId: 'simple_tc' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                            {
                                id: 'dependent-tc-filter-id',
                                target: { fieldId: 'dependent' },
                                operator: FilterOperator.NOT_NULL,
                                values: [],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'simple_tc',
                        displayName: 'Simple TC',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        dependsOn: [],
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: '"depended_on" + 10',
                        dependsOn: ['depended_on'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> table_calculations -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('table_calculations AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        const metricFiltersMatch = result.query.match(
            /metric_filters AS \(([\s\S]*?)\n\s*\),/,
        );
        expect(metricFiltersMatch).toBeTruthy();
        expect(metricFiltersMatch![1]).toContain('IS NOT NULL');

        // Should have table calc filters in final WHERE clause
        const finalWhereIndex = result.query.lastIndexOf('WHERE');
        const finalWhereClause = result.query.substring(finalWhereIndex);
        expect(finalWhereClause).toContain('"simple_tc"');
        expect(finalWhereClause).toContain('"dependent"');
        expect(finalWhereClause).toContain('IS NOT NULL');
        expect(finalWhereClause).toContain('AND'); // both table calc filters combined

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tableCalculationsIndex = result.query.indexOf(
            'table_calculations AS (',
        );
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tableCalculationsIndex);
        expect(tableCalculationsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });

    test('Case 8: Metric + metric filter + dependent TCs + TC filter - should create full chain with all filters', () => {
        const result = buildTestQuery({
            compiledMetricQuery: {
                ...METRIC_QUERY,
                filters: {
                    dimensions: undefined,
                    metrics: {
                        id: 'metric-filter-id',
                        and: [
                            {
                                id: 'filter-id',
                                target: { fieldId: 'table1_metric1' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [20],
                            },
                        ],
                    },
                    tableCalculations: {
                        id: 'tc-filter-id',
                        and: [
                            {
                                id: 'tc-filter-id',
                                target: { fieldId: 'tc_a' },
                                operator: FilterOperator.EQUALS,
                                values: [1],
                            },
                        ],
                    },
                },
                tableCalculations: [
                    {
                        name: 'tc_a',
                        displayName: 'TC A',
                        sql: '${table1.metric1} + 1',
                    },
                    {
                        name: 'tc_b',
                        displayName: 'TC B',
                        sql: '${tc_a} + 1',
                    },
                ],
                compiledTableCalculations: [
                    {
                        name: 'tc_a',
                        displayName: 'TC A',
                        sql: '${table1.metric1} + 1',
                        compiledSql: '"table1_metric1" + 1',
                        dependsOn: [],
                    },
                    {
                        name: 'tc_b',
                        displayName: 'TC B',
                        sql: '${tc_a} + 1',
                        compiledSql: '"tc_a" + 1',
                        dependsOn: ['tc_a'],
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> tc_a -> tc_b
        expect(result.query).toContain('WITH metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('tc_tc_a AS (');
        expect(result.query).toContain('tc_tc_b AS (');

        // Should select from the final dependent CTE
        expect(result.query).toContain('FROM tc_tc_b');

        // Should have metric filter in metric_filters CTE
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('"table1_metric1"');
        expect(result.query).toContain('> (20)');

        // Should have table calculation filter in final WHERE clause
        expect(result.query).toContain('"tc_a"');
        expect(result.query).toContain("IN ('1')");

        // Should properly reference tc_a in tc_b
        expect(result.query).toContain('"tc_a" + 1');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const tcAIndex = result.query.indexOf('tc_tc_a AS (');
        const tcBIndex = result.query.indexOf('tc_tc_b AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(tcAIndex);
        expect(tcAIndex).toBeLessThan(tcBIndex);
    });
});
