import {
    AnyType,
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
    });

    describe('Table Calculations with CTEs', () => {
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

            // Should have the table calculation in SELECT
            expect(result.query).toContain(
                '"table1_metric1" + 100 AS "simple_calc"',
            );
            // Should NOT have CTEs for simple table calculations
            expect(result.query).not.toContain('WITH tc_simple_calc');
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
                        cte: 'tc_base_calc AS (\n  SELECT\n*,\n  "table1_metric1" + 50 AS "base_calc"\n  FROM metrics\n)',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 2',
                        compiledSql: 'tc_base_calc."base_calc" * 2',
                        cte: 'tc_dependent_calc AS (\n  SELECT\n*,\n  tc_base_calc."base_calc" * 2 AS "dependent_calc"\n  FROM tc_base_calc\n)',
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

            // Should have CTEs for both table calculations
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_base_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_dependent_calc');

            // Should have table calculations in the CTEs (not in the final SELECT)
            expect(result.query).toContain('+ 50 AS "base_calc"');
            expect(result.query).toContain('* 2 AS "dependent_calc"');
            // But final SELECT should just select * from the last CTE
            expect(result.query).toContain(
                'SELECT\n  *\nFROM tc_dependent_calc',
            );
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
                        // No CTE - not referenced by others
                    },
                    {
                        name: 'base_calc',
                        displayName: 'Base Calc',
                        sql: '${table1.metric1} + 25',
                        compiledSql: '"table1_metric1" + 25',
                        cte: 'tc_base_calc AS (\n  SELECT\n*,\n  "table1_metric1" + 25 AS "base_calc"\n  FROM metrics\n)',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${base_calc} * 3',
                        compiledSql: 'tc_base_calc."base_calc" * 3',
                        cte: 'tc_dependent_calc AS (\n  SELECT\n*,\n  tc_base_calc."base_calc" * 3 AS "dependent_calc"\n  FROM tc_base_calc\n)',
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

            // Should have CTEs for dependent calculations
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_base_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_dependent_calc');

            // Should include inline calculation in SELECT
            expect(result.query).toContain(
                '"table1_metric1" / 10 AS "simple_calc"',
            );
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
                        cte: 'tc_calc_a AS (\n  SELECT\n*,\n  "table1_metric1" + 10 AS "calc_a"\n  FROM metrics\n)',
                    },
                    {
                        name: 'calc_b',
                        displayName: 'Calc B',
                        sql: '${table1.metric1} * 2',
                        compiledSql: '"table1_metric1" * 2',
                        cte: 'tc_calc_b AS (\n  SELECT\n*,\n  "table1_metric1" * 2 AS "calc_b"\n  FROM tc_calc_a\n)',
                    },
                    {
                        name: 'calc_c',
                        displayName: 'Calc C',
                        sql: '${calc_a} + ${calc_b}',
                        compiledSql: 'tc_calc_b."calc_a" + tc_calc_b."calc_b"',
                        cte: 'tc_calc_c AS (\n  SELECT\n*,\n  tc_calc_b."calc_a" + tc_calc_b."calc_b" AS "calc_c"\n  FROM tc_calc_b\n)',
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

            // Should have all CTEs in correct order
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_calc_a AS (');
            expect(result.query).toContain('tc_calc_b AS (');
            expect(result.query).toContain('tc_calc_c AS (');

            // Should select from the final CTE
            expect(result.query).toContain('FROM tc_calc_c');

            // Should show the CTE reference resolution working correctly
            expect(result.query).toContain(
                'tc_calc_b."calc_a" + tc_calc_b."calc_b"',
            );
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
                        cte: 'tc_filtered_calc AS (\n  SELECT\n*,\n  "table1_metric1" * 1.5 AS "filtered_calc"\n  FROM metrics\n)',
                    },
                    {
                        name: 'dependent_calc',
                        displayName: 'Dependent Calc',
                        sql: '${filtered_calc} + 100',
                        compiledSql: 'tc_filtered_calc."filtered_calc" + 100',
                        cte: 'tc_dependent_calc AS (\n  SELECT\n*,\n  tc_filtered_calc."filtered_calc" + 100 AS "dependent_calc"\n  FROM tc_filtered_calc\n)',
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

            // Should have CTEs
            expect(result.query).toContain('WITH metrics AS (');
            expect(result.query).toContain('tc_filtered_calc AS (');
            expect(result.query).toContain('tc_dependent_calc AS (');

            // Should select from final CTE with table calc filter applied
            expect(result.query).toContain('FROM tc_dependent_calc');
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

describe('Table Calculation Query Structure Tests', () => {
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

        // Should have final SELECT directly FROM metrics with WHERE (not from metric_filters)
        expect(result.query).toContain('SELECT\n  *\nFROM metrics');
        expect(result.query).not.toContain('FROM metric_filters');
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('IS NOT NULL');
    });

    // TODO: Add remaining test cases 3-7 to match expected SQL structures
    // These test cases should be added after refactoring is complete to validate:
    // - Case 3: Metric + metric filter + simple TC (should have simple TC in final SELECT)
    // - Case 4: Metric + metric filter + simple TC + simple TC filter (may need simple_calcs CTE)
    // - Case 5: Metric + metric filter + simple TC + dependent TCs (should have full CTE chain)
    // - Case 6: Metric + metric filter + simple TC + simple TC filter + dependent TCs
    // - Case 7: Metric + metric filter + simple TC + simple TC filter + dependent TCs + dependent TC filter

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
                        // No CTE - simple table calculation
                    },
                ],
            },
        });

        // Should have WITH metrics CTE only (no simple_calcs CTE)
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');
        expect(result.query).not.toContain('simple_calcs AS (');

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
                        // No CTE - simple table calculation
                    },
                ],
            },
        });

        // Should have WITH metrics and simple_calcs CTEs (but no metric_filters CTE)
        expect(result.query).toContain('WITH');
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('simple_calcs AS (');
        expect(result.query).not.toContain('metric_filters AS (');

        // Should have simple TC in simple_calcs CTE
        expect(result.query).toContain('"table1_metric1" AS "simple_tc"');
        expect(result.query).toContain('FROM metrics');

        // Should select from simple_calcs with both metric filter and table calc filter
        expect(result.query).toContain('SELECT\n  *\nFROM simple_calcs');
        expect(result.query).toContain('WHERE');

        // Should have both filters in the final WHERE clause
        const whereMatch = result.query.match(
            /WHERE\s+(.*?)(?:ORDER BY|LIMIT|$)/s,
        );
        expect(whereMatch).toBeTruthy();
        const whereClause = whereMatch![1].trim();

        // Should contain both metric filter and table calc filter
        expect(whereClause).toContain('"table1_metric1"'); // metric filter
        expect(whereClause).toContain('"simple_tc"'); // table calc filter
        expect(whereClause).toContain('AND'); // both filters combined
        expect(whereClause).toContain('IS NOT NULL');
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
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        cte: 'tc_depended_on AS (\n  SELECT\n*,\n  "table1_metric1" AS "depended_on"\n  FROM simple_calcs\n)',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: 'tc_depended_on."depended_on" + 10',
                        cte: 'tc_dependent AS (\n  SELECT\n*,\n  tc_depended_on."depended_on" + 10 AS "dependent"\n  FROM tc_depended_on\n)',
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> simple_calcs -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('simple_calcs AS (');
        expect(result.query).toContain('tc_depended_on AS (');
        expect(result.query).toContain('tc_dependent AS (');

        // Final SELECT should be from the last CTE
        expect(result.query).toContain('FROM tc_dependent');

        // Should have metric filter in metric_filters CTE
        expect(result.query).toContain('IS NOT NULL');

        // Verify CTE order is correct
        const metricsIndex = result.query.indexOf('metrics AS (');
        const metricFiltersIndex = result.query.indexOf('metric_filters AS (');
        const simpleCalcsIndex = result.query.indexOf('simple_calcs AS (');
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(simpleCalcsIndex);
        expect(simpleCalcsIndex).toBeLessThan(dependedOnIndex);
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
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        cte: 'tc_depended_on AS (\n  SELECT\n*,\n  "table1_metric1" AS "depended_on"\n  FROM simple_calcs\n)',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: 'tc_depended_on."depended_on" + 10',
                        cte: 'tc_dependent AS (\n  SELECT\n*,\n  tc_depended_on."depended_on" + 10 AS "dependent"\n  FROM tc_depended_on\n)',
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> simple_calcs -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('simple_calcs AS (');
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
        const simpleCalcsIndex = result.query.indexOf('simple_calcs AS (');
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(simpleCalcsIndex);
        expect(simpleCalcsIndex).toBeLessThan(dependedOnIndex);
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
                        // No CTE - simple table calculation
                    },
                    {
                        name: 'depended_on',
                        displayName: 'Depended On',
                        sql: '${table1.metric1}',
                        compiledSql: '"table1_metric1"',
                        cte: 'tc_depended_on AS (\n  SELECT\n*,\n  "table1_metric1" AS "depended_on"\n  FROM simple_calcs\n)',
                    },
                    {
                        name: 'dependent',
                        displayName: 'Dependent',
                        sql: '${depended_on} + 10',
                        compiledSql: 'tc_depended_on."depended_on" + 10',
                        cte: 'tc_dependent AS (\n  SELECT\n*,\n  tc_depended_on."depended_on" + 10 AS "dependent"\n  FROM tc_depended_on\n)',
                    },
                ],
            },
        });

        // Should have full CTE chain: metrics -> metric_filters -> simple_calcs -> tc_depended_on -> tc_dependent
        expect(result.query).toContain('metrics AS (');
        expect(result.query).toContain('metric_filters AS (');
        expect(result.query).toContain('simple_calcs AS (');
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
        const simpleCalcsIndex = result.query.indexOf('simple_calcs AS (');
        const dependedOnIndex = result.query.indexOf('tc_depended_on AS (');
        const dependentIndex = result.query.indexOf('tc_dependent AS (');

        expect(metricsIndex).toBeLessThan(metricFiltersIndex);
        expect(metricFiltersIndex).toBeLessThan(simpleCalcsIndex);
        expect(simpleCalcsIndex).toBeLessThan(dependedOnIndex);
        expect(dependedOnIndex).toBeLessThan(dependentIndex);
    });
});
