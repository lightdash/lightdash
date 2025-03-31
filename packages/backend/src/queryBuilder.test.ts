import {
    BinType,
    CustomDimensionType,
    ForbiddenError,
    isCustomBinDimension,
    WeekDay,
} from '@lightdash/common';
import {
    applyLimitToSqlQuery,
    assertValidDimensionRequiredAttribute,
    buildQuery,
    getCustomBinDimensionSql,
    getCustomSqlDimensionSql,
    replaceUserAttributesAsStrings,
    sortDayOfWeekName,
    sortMonthName,
} from './queryBuilder';
import {
    bigqueryClientMock,
    COMPILED_DIMENSION,
    COMPILED_MONTH_NAME_DIMENSION,
    COMPILED_WEEK_NAME_DIMENSION,
    CUSTOM_SQL_DIMENSION,
    EXPLORE,
    EXPLORE_ALL_JOIN_TYPES_CHAIN,
    EXPLORE_BIGQUERY,
    EXPLORE_JOIN_CHAIN,
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
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL,
    METRIC_QUERY_WITH_NESTED_METRIC_FILTERS,
    METRIC_QUERY_WITH_NESTED_METRIC_FILTERS_SQL,
    METRIC_QUERY_WITH_SQL_FILTER,
    METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
    METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER_SQL,
    METRIC_QUERY_WITH_TABLE_REFERENCE,
    METRIC_QUERY_WITH_TABLE_REFERENCE_SQL,
    MONTH_NAME_SORT_DESCENDING_SQL,
    MONTH_NAME_SORT_SQL,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
    WEEK_NAME_SORT_DESCENDING_SQL,
    WEEK_NAME_SORT_SQL,
} from './queryBuilder.mock';

describe('Query builder', () => {
    test('Should build simple metric query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL);
    });

    test('Should build simple metric query in BigQuery', () => {
        expect(
            buildQuery({
                explore: EXPLORE_BIGQUERY,
                compiledMetricQuery: METRIC_QUERY,
                warehouseClient: bigqueryClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_BIGQUERY);
    });

    test('Should build metric query across two tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_TWO_TABLES_SQL);
    });

    test('Should build metric query where a field references another table', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TABLE_REFERENCE,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_TABLE_REFERENCE_SQL);
    });

    test('Should join table from filter dimension', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_FILTER_SQL);
    });

    test('should join chain of intermediary tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE_JOIN_CHAIN,
                compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_JOIN_CHAIN_SQL);
    });

    test('should join chain of intermediary tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE_ALL_JOIN_TYPES_CHAIN,
                compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_ALL_JOIN_TYPES_CHAIN_SQL);
    });

    test('Should build query with filter OR operator', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_FILTER_OR_OPERATOR_SQL);
    });

    test('Should build query with disabled filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_DISABLED_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_DISABLED_FILTER_SQL);
    });

    test('Should build query with a filter and one disabled filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_FILTER_AND_DISABLED_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_METRIC_FILTER_AND_ONE_DISABLED_SQL);
    });

    test('Should build query with nested filter operators', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL);
    });

    test('Should build query with no filter when there are only empty filter groups ', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER_GROUPS,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL);
    });

    test('Should build second query with metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_METRIC_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_METRIC_FILTER_SQL);
    });

    test('Should build query with metric filter (where filter is disabled) and metric references a dimension from a joined table', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(
            METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM_SQL,
        );
    });

    test('Should build second query with nested metric filters', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_NESTED_METRIC_FILTERS,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_NESTED_METRIC_FILTERS_SQL);
    });

    test('Should build query with additional metric', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_ADDITIONAL_METRIC,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_ADDITIONAL_METRIC_SQL);
    });

    test('Should build query with empty filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_EMPTY_FILTER_SQL);
    });

    test('Should build query with empty metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_EMPTY_METRIC_FILTER_SQL);
    });

    test('Should build query with cte in table calculations filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
                warehouseClient: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER_SQL);
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
        ).toThrowError(ForbiddenError);
    });

    test('Should replace user attributes from sql filter', () => {
        expect(
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
        ).toStrictEqual(METRIC_QUERY_WITH_SQL_FILTER);
    });
});

describe('replaceUserAttributes', () => {
    it('method with no user attribute should return same sqlFilter', async () => {
        expect(
            replaceUserAttributesAsStrings(
                '${dimension} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toEqual('${dimension} > 1');
        expect(
            replaceUserAttributesAsStrings(
                '${table.dimension} = 1',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toEqual('${table.dimension} = 1');
        expect(
            replaceUserAttributesAsStrings(
                '${dimension} = ${TABLE}.dimension',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toEqual('${dimension} = ${TABLE}.dimension');
    });

    it('method with missing user attribute should throw error', async () => {
        expect(() =>
            replaceUserAttributesAsStrings(
                '${lightdash.attribute.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toThrowError(ForbiddenError);

        expect(() =>
            replaceUserAttributesAsStrings(
                '${ld.attr.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toThrowError(ForbiddenError);
    });

    it('method with no user attribute value should throw error', async () => {
        expect(() =>
            replaceUserAttributesAsStrings(
                '${lightdash.attribute.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                {
                    test: [],
                },
                warehouseClientMock,
            ),
        ).toThrowError(ForbiddenError);
    });

    it('method should replace sqlFilter with user attribute', async () => {
        const userAttributes = { test: ['1'] };
        const expected = "('1' > 1)";
        expect(
            replaceUserAttributesAsStrings(
                '${lightdash.attribute.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);

        expect(
            replaceUserAttributesAsStrings(
                '${ld.attr.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);
    });

    it('method should replace sqlFilter with user attribute with multiple values', async () => {
        expect(
            replaceUserAttributesAsStrings(
                "'1' IN (${lightdash.attribute.test})",
                INTRINSIC_USER_ATTRIBUTES,
                {
                    test: ['1', '2'],
                },
                warehouseClientMock,
            ),
        ).toEqual("('1' IN ('1', '2'))");
    });

    it('method should replace sqlFilter with multiple user attributes', async () => {
        const userAttributes = { test: ['1'], another: ['2'] };
        const sqlFilter =
            '${dimension} IS NOT NULL OR (${lightdash.attribute.test} > 1 AND ${lightdash.attribute.another} = 2)';
        const expected = "(${dimension} IS NOT NULL OR ('1' > 1 AND '2' = 2))";
        expect(
            replaceUserAttributesAsStrings(
                sqlFilter,
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);
    });

    it('method should replace sqlFilter using short aliases', async () => {
        const userAttributes = { test: ['1'], another: ['2'] };
        const expected = "('1' > 1)";
        expect(
            replaceUserAttributesAsStrings(
                '${ld.attribute.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);
        expect(
            replaceUserAttributesAsStrings(
                '${lightdash.attr.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);
        expect(
            replaceUserAttributesAsStrings(
                '${ld.attr.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);

        expect(
            replaceUserAttributesAsStrings(
                '${lightdash.attributes.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                userAttributes,
                warehouseClientMock,
            ),
        ).toEqual(expected);
    });

    it('method should not replace any invalid attribute', async () => {
        expect(
            replaceUserAttributesAsStrings(
                '${lightdash.foo.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toEqual('${lightdash.foo.test} > 1');
    });

    it('should replace `email` intrinsic user attribute', async () => {
        expect(
            replaceUserAttributesAsStrings(
                '${lightdash.user.email} = "mock@lightdash.com"',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toEqual('(\'mock@lightdash.com\' = "mock@lightdash.com")');
    });
});

describe('assertValidDimensionRequiredAttribute', () => {
    it('should not throw errors if no user attributes are required', async () => {
        const result = assertValidDimensionRequiredAttribute(
            COMPILED_DIMENSION,
            {},
            '',
        );

        expect(result).toBeUndefined();
    });

    it('should throw errors if required attributes are required and user attributes are missing', async () => {
        expect(() =>
            assertValidDimensionRequiredAttribute(
                {
                    ...COMPILED_DIMENSION,
                    requiredAttributes: {
                        is_admin: 'true',
                    },
                },
                {},
                '',
            ),
        ).toThrowError(ForbiddenError);

        expect(() =>
            assertValidDimensionRequiredAttribute(
                {
                    ...COMPILED_DIMENSION,
                    requiredAttributes: {
                        is_admin: 'true',
                    },
                },
                { is_admin: ['false'] },
                '',
            ),
        ).toThrowError(ForbiddenError);
    });

    it('should not throw errors if required attributes are required and user attributes exist', async () => {
        const result = assertValidDimensionRequiredAttribute(
            {
                ...COMPILED_DIMENSION,
                requiredAttributes: {
                    is_admin: 'true',
                },
            },
            { is_admin: ['true'] },
            '',
        );

        expect(result).toBeUndefined();
    });
});

describe('with custom dimensions', () => {
    it('getCustomDimensionSql with empty custom dimension', () => {
        expect(
            getCustomBinDimensionSql({
                warehouseClient: bigqueryClientMock,
                explore: EXPLORE,
                customDimensions: undefined,
                userAttributes: {},
                intrinsicUserAttributes: {},
                sorts: [],
            }),
        ).toStrictEqual(undefined);
    });

    it('getCustomSqlDimensionSql with custom sql dimension', () => {
        expect(
            getCustomSqlDimensionSql({
                warehouseClient: bigqueryClientMock,
                customDimensions: [CUSTOM_SQL_DIMENSION],
            }),
        ).toStrictEqual({
            selects: ['  ("table1".dim1 < 18) AS `is_adult`'],
            tables: ['table1'],
        });
    });

    it('getCustomDimensionSql with custom dimension', () => {
        expect(
            getCustomBinDimensionSql({
                warehouseClient: bigqueryClientMock,

                explore: EXPLORE,
                customDimensions:
                    METRIC_QUERY_WITH_CUSTOM_DIMENSION.compiledCustomDimensions?.filter(
                        isCustomBinDimension,
                    ),
                userAttributes: {},
                intrinsicUserAttributes: {},
                sorts: [],
            }),
        ).toStrictEqual({
            ctes: [
                ` age_range_cte AS (
                    SELECT
                        FLOOR(MIN("table1".dim1)) AS min_id,
                        CEIL(MAX("table1".dim1)) AS max_id,
                        FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                    FROM "db"."schema"."table1" AS \`table1\`
                )`,
            ],
            joins: ['age_range_cte'],
            selects: [
                `CASE
                        WHEN "table1".dim1 IS NULL THEN NULL
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 0, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 1)
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 1, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 2)
ELSE CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 2, ' - ', age_range_cte.max_id)
                        END
                        AS \`age_range\`
                    `,
            ],
            tables: ['table1'],
        });
    });

    it('getCustomDimensionSql with only 1 bin', () => {
        expect(
            getCustomBinDimensionSql({
                warehouseClient: bigqueryClientMock,

                explore: EXPLORE,
                customDimensions: [
                    {
                        id: 'age_range',
                        name: 'Age range',
                        type: CustomDimensionType.BIN,
                        dimensionId: 'table1_dim1',
                        table: 'table1',
                        binType: BinType.FIXED_NUMBER,
                        binNumber: 1,
                    },
                ],
                userAttributes: {},
                intrinsicUserAttributes: {},
                sorts: [],
            }),
        ).toStrictEqual({
            ctes: [
                ` age_range_cte AS (
                    SELECT
                        FLOOR(MIN("table1".dim1)) AS min_id,
                        CEIL(MAX("table1".dim1)) AS max_id,
                        FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 1) AS bin_width
                    FROM "db"."schema"."table1" AS \`table1\`
                )`,
            ],
            joins: ['age_range_cte'],
            selects: [
                `CONCAT(age_range_cte.min_id, ' - ', age_range_cte.max_id) AS \`age_range\``,
            ],
            tables: ['table1'],
        });
    });

    it('buildQuery with custom dimension bin number', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                warehouseClient: bigqueryClientMock,
                userAttributes: {},
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
            }).query,
        ).toStrictEqual(`WITH  age_range_cte AS (
                    SELECT
                        FLOOR(MIN("table1".dim1)) AS min_id,
                        CEIL(MAX("table1".dim1)) AS max_id,
                        FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                    FROM "db"."schema"."table1" AS \`table1\`
                )
SELECT
  "table1".dim1 AS \`table1_dim1\`,
CASE
                        WHEN "table1".dim1 IS NULL THEN NULL
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 0, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 1)
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 1, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 2)
ELSE CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 2, ' - ', age_range_cte.max_id)
                        END
                        AS \`age_range\`
                    ,
  MAX("table1".number_column) AS \`table1_metric1\`
FROM "db"."schema"."table1" AS \`table1\`

CROSS JOIN age_range_cte

GROUP BY 1,2
ORDER BY \`table1_metric1\` DESC
LIMIT 10`);
    });

    it('buildQuery with custom dimension bin width', () => {
        expect(
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
        ).toStrictEqual(`SELECT
  "table1".dim1 AS \`table1_dim1\`,
CONCAT(FLOOR("table1".dim1 / 10) * 10, ' - ', (FLOOR("table1".dim1 / 10) + 1) * 10 - 1) AS \`age_range\`,
  MAX("table1".number_column) AS \`table1_metric1\`
FROM "db"."schema"."table1" AS \`table1\`


GROUP BY 1,2
ORDER BY \`table1_metric1\` DESC
LIMIT 10`);
    });

    it('buildQuery with custom dimension and table calculation', () => {
        expect(
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
        ).toStrictEqual(`WITH  age_range_cte AS (
                    SELECT
                        FLOOR(MIN("table1".dim1)) AS min_id,
                        CEIL(MAX("table1".dim1)) AS max_id,
                        FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                    FROM "db"."schema"."table1" AS \`table1\`
                ),
metrics AS (
SELECT
  "table1".dim1 AS \`table1_dim1\`,
CASE
                        WHEN "table1".dim1 IS NULL THEN NULL
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 0, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 1)
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 1, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 2)
ELSE CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 2, ' - ', age_range_cte.max_id)
                        END
                        AS \`age_range\`
                    ,
  MAX("table1".number_column) AS \`table1_metric1\`
FROM "db"."schema"."table1" AS \`table1\`

CROSS JOIN age_range_cte

GROUP BY 1,2
)
SELECT
  *,
  table1_dim1 + 1 AS \`calc3\`
FROM metrics

ORDER BY \`table1_metric1\` DESC
LIMIT 10`);
    });

    it('getCustomDimensionSql with sorted custom dimension ', () => {
        expect(
            getCustomBinDimensionSql({
                warehouseClient: bigqueryClientMock,
                explore: EXPLORE,
                customDimensions:
                    METRIC_QUERY_WITH_CUSTOM_DIMENSION.compiledCustomDimensions?.filter(
                        isCustomBinDimension,
                    ),
                userAttributes: {},
                intrinsicUserAttributes: {},
                sorts: [{ fieldId: 'age_range', descending: true }],
            }),
        ).toStrictEqual({
            ctes: [
                ` age_range_cte AS (
                    SELECT
                        FLOOR(MIN("table1".dim1)) AS min_id,
                        CEIL(MAX("table1".dim1)) AS max_id,
                        FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                    FROM "db"."schema"."table1" AS \`table1\`
                )`,
            ],
            joins: ['age_range_cte'],
            selects: [
                `CASE
                            WHEN "table1".dim1 IS NULL THEN NULL
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 0, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 1)
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 1, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 2)
ELSE CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 2, ' - ', age_range_cte.max_id)
                            END
                            AS \`age_range\``,
                `CASE
                            WHEN "table1".dim1 IS NULL THEN 3
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN 0
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN 1
ELSE 2
                            END
                            AS \`age_range_order\``,
            ],
            tables: ['table1'],
        });
    });

    it('buildQuery with sorted custom dimension', () => {
        expect(
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
        ).toStrictEqual(`WITH  age_range_cte AS (
                    SELECT
                        FLOOR(MIN("table1".dim1)) AS min_id,
                        CEIL(MAX("table1".dim1)) AS max_id,
                        FLOOR((MAX("table1".dim1) - MIN("table1".dim1)) / 3) AS bin_width
                    FROM "db"."schema"."table1" AS \`table1\`
                )
SELECT
  "table1".dim1 AS \`table1_dim1\`,
CASE
                            WHEN "table1".dim1 IS NULL THEN NULL
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 0, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 1)
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 1, ' - ', age_range_cte.min_id + age_range_cte.bin_width * 2)
ELSE CONCAT(age_range_cte.min_id + age_range_cte.bin_width * 2, ' - ', age_range_cte.max_id)
                            END
                            AS \`age_range\`,
CASE
                            WHEN "table1".dim1 IS NULL THEN 3
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 0 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 1 THEN 0
WHEN "table1".dim1 >= age_range_cte.min_id + age_range_cte.bin_width * 1 AND "table1".dim1 < age_range_cte.min_id + age_range_cte.bin_width * 2 THEN 1
ELSE 2
                            END
                            AS \`age_range_order\`,
  MAX("table1".number_column) AS \`table1_metric1\`
FROM "db"."schema"."table1" AS \`table1\`

CROSS JOIN age_range_cte

GROUP BY 1,2,3
ORDER BY \`age_range_order\` DESC
LIMIT 10`);
    });

    it('buildQuery with custom dimension bin width on postgres', () => {
        // Concat function is different in postgres/redshift
        expect(
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
        ).toStrictEqual(`SELECT
  "table1".dim1 AS "table1_dim1",
(FLOOR("table1".dim1 / 10) * 10 || ' - ' || (FLOOR("table1".dim1 / 10) + 1) * 10 - 1) AS "age_range",
  MAX("table1".number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS "table1"


GROUP BY 1,2
ORDER BY "table1_metric1" DESC
LIMIT 10`);
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
});

const ignoreIndentation = (sql: string) => sql.replace(/\s+/g, ' ');
describe('Time frame sorting', () => {
    it('sortMonthName SQL', () => {
        expect(
            ignoreIndentation(
                sortMonthName(COMPILED_MONTH_NAME_DIMENSION, '"', false),
            ),
        ).toStrictEqual(ignoreIndentation(MONTH_NAME_SORT_SQL));
    });
    it('sortMonthName Descending SQL', () => {
        expect(
            ignoreIndentation(
                sortMonthName(COMPILED_MONTH_NAME_DIMENSION, '"', true),
            ),
        ).toStrictEqual(ignoreIndentation(MONTH_NAME_SORT_DESCENDING_SQL));
    });
    it('sortDayOfWeekName SQL for Saturday startOfWeek', () => {
        expect(
            ignoreIndentation(
                sortDayOfWeekName(
                    COMPILED_WEEK_NAME_DIMENSION,
                    undefined,
                    `"`,
                    true,
                ),
            ),
        ).toStrictEqual(ignoreIndentation(WEEK_NAME_SORT_DESCENDING_SQL));
    });
    it('sortDayOfWeekName SQL for Sunday startOfWeek', () => {
        expect(
            ignoreIndentation(
                sortDayOfWeekName(
                    COMPILED_WEEK_NAME_DIMENSION,
                    WeekDay.SUNDAY,
                    `"`,
                    false,
                ),
            ),
        ).toStrictEqual(ignoreIndentation(WEEK_NAME_SORT_SQL)); // same as undefined
    });

    it('sortDayOfWeekName SQL for Wednesday startOfWeek', () => {
        expect(
            ignoreIndentation(
                sortDayOfWeekName(
                    COMPILED_WEEK_NAME_DIMENSION,
                    WeekDay.WEDNESDAY,
                    `"`,
                    false,
                ),
            ),
        ).toStrictEqual(
            ignoreIndentation(`(
            CASE
                WHEN "table1_dim1" = 'Sunday' THEN 5
                WHEN "table1_dim1" = 'Monday' THEN 6
                WHEN "table1_dim1" = 'Tuesday' THEN 7
                WHEN "table1_dim1" = 'Wednesday' THEN 1
                WHEN "table1_dim1" = 'Thursday' THEN 2
                WHEN "table1_dim1" = 'Friday' THEN 3
                WHEN "table1_dim1" = 'Saturday' THEN 4
                ELSE 0
            END
        )`),
        );
    });
});

describe('applyLimitToSqlQuery', () => {
    it('should return the original query if limit is undefined', () => {
        const sqlQuery = 'SELECT * FROM users';
        const limit = undefined;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        expect(result).toBe(sqlQuery);
    });

    it('should strip semicolons from the end of the query', () => {
        const sqlQuery = 'SELECT * FROM users;';
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 10';

        expect(result).toBe(expectedQuery);
    });

    it('should not strip semicolons out from subqueries', () => {
        const sqlQuery = `
            WITH subquery AS (
                SELECT * FROM orders LIMIT 10;
            )
            SELECT * FROM subquery LIMIT 25
        `;
        const limit = 15;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'WITH subquery AS ( SELECT * FROM orders LIMIT 10; ) SELECT * FROM subquery LIMIT 15';

        expect(result).toBe(expectedQuery);
    });

    it('should decrease the limit if existing limit is greater than the provided limit', () => {
        const sqlQuery = 'SELECT * FROM users LIMIT 10;';
        const limit = 5;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 5';

        expect(result).toBe(expectedQuery);
    });

    it('should keep the existing limit if it is equal to the provided limit', () => {
        const sqlQuery = 'SELECT * FROM users LIMIT 10;';
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 10';

        expect(result).toBe(expectedQuery);
    });

    it('should keep the existing limit if it is less than the provided limit', () => {
        const sqlQuery = 'SELECT * FROM users LIMIT 5;';
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 5';

        expect(result).toBe(expectedQuery);
    });

    it('should apply limit if there is no existing limit', () => {
        const sqlQuery = 'SELECT * FROM users;';
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 10';

        expect(result).toBe(expectedQuery);
    });

    it('should handle complex SQL queries correctly', () => {
        const sqlQuery = `
            SELECT name, age FROM users
            WHERE age > 18
            ORDER BY age DESC
        `;
        const limit = 5;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'SELECT name, age FROM users WHERE age > 18 ORDER BY age DESC LIMIT 5';

        expect(result).toBe(expectedQuery);
    });

    it('should decrease the outer limit when existing limit is greater than the provided limit, even in subqueries', () => {
        const sqlQuery = `
            WITH subquery AS (
                SELECT * FROM orders LIMIT 10
            )
            SELECT * FROM subquery LIMIT 25;
        `;
        const limit = 20;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'WITH subquery AS ( SELECT * FROM orders LIMIT 10 ) SELECT * FROM subquery LIMIT 20';

        expect(result).toBe(expectedQuery);
    });

    it('should keep the existing outer limit when it is less than the provided limit, even in subqueries', () => {
        const sqlQuery = `
            WITH subquery AS (
                SELECT * FROM orders LIMIT 5
            )
            SELECT * FROM subquery LIMIT 10;
        `;
        const limit = 20;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'WITH subquery AS ( SELECT * FROM orders LIMIT 5 ) SELECT * FROM subquery LIMIT 10';

        expect(result).toBe(expectedQuery);
    });

    it('should not remove LIMIT in table or field names', () => {
        const sqlQuery = `
            SELECT limit_column FROM limit_table WHERE limit_table.id = 10;
        `;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'SELECT limit_column FROM limit_table WHERE limit_table.id = 10 LIMIT 10';

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries where LIMIT is inline and with a break line', () => {
        const sqlQuery = `
            SELECT * FROM users
            LIMIT
            10
        `;
        const limit = 5;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 5';

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries with LIMIT in strings', () => {
        const sqlQuery = `
            SELECT * FROM users WHERE name = 'LIMIT 10';
        `;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = `SELECT * FROM users WHERE name = 'LIMIT 10' LIMIT 10`;

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries with LIMIT in comments', () => {
        const sqlQuery = `
            -- This is a comment with LIMIT 10
            SELECT * FROM users; /* Another comment LIMIT 20 */
        `;
        const limit = 15;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 15';

        expect(result).toBe(expectedQuery);
    });

    it('should not remove semicolons inside strings', () => {
        const sqlQuery = `SELECT * FROM users WHERE name = 'John;Doe';`;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = `SELECT * FROM users WHERE name = 'John;Doe' LIMIT 10`;

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries with LIMIT and OFFSET', () => {
        const sqlQuery = `
            SELECT * FROM users LIMIT 20 OFFSET 5;
        `;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 10 OFFSET 5';

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries with OFFSET without a LIMIT', () => {
        const sqlQuery = `
            SELECT * FROM users OFFSET 10;
        `;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users OFFSET 10 LIMIT 10';

        expect(result).toBe(expectedQuery);
    });

    it('should adjust the LIMIT but retain the original OFFSET', () => {
        const sqlQuery = `
            SELECT * FROM users LIMIT 15 OFFSET 5;
        `;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 10 OFFSET 5';

        expect(result).toBe(expectedQuery);
    });

    it('should retain OFFSET when no LIMIT is provided', () => {
        const sqlQuery = `
            SELECT * FROM users OFFSET 20;
        `;
        const limit = undefined;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users OFFSET 20';

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries with OFFSET in subqueries', () => {
        const sqlQuery = `
            WITH subquery AS (
                SELECT * FROM orders OFFSET 5
            )
            SELECT * FROM subquery LIMIT 20 OFFSET 10;
        `;
        const limit = 15;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'WITH subquery AS ( SELECT * FROM orders OFFSET 5 ) SELECT * FROM subquery LIMIT 15 OFFSET 10';

        expect(result).toBe(expectedQuery);
    });

    it('should handle queries with both LIMIT and OFFSET in strings', () => {
        const sqlQuery = `
            SELECT * FROM users WHERE name = 'LIMIT 10 OFFSET 5';
        `;
        const limit = 10;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = `SELECT * FROM users WHERE name = 'LIMIT 10 OFFSET 5' LIMIT 10`;

        expect(result).toBe(expectedQuery);
    });

    it('should correctly handle OFFSET when LIMIT and OFFSET are in comments', () => {
        const sqlQuery = `
            -- This is a comment with LIMIT 10 OFFSET 5
            SELECT * FROM users; /* Another comment LIMIT 20 OFFSET 10 */
        `;
        const limit = 15;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery = 'SELECT * FROM users LIMIT 15';

        expect(result).toBe(expectedQuery);
    });

    it('should strip semicolons and correctly handle LIMIT and OFFSET in subqueries', () => {
        const sqlQuery = `
            WITH subquery AS (
                SELECT * FROM orders LIMIT 10 OFFSET 5;
            )
            SELECT * FROM subquery LIMIT 25 OFFSET 10;
        `;
        const limit = 20;

        const result = applyLimitToSqlQuery({ sqlQuery, limit });

        const expectedQuery =
            'WITH subquery AS ( SELECT * FROM orders LIMIT 10 OFFSET 5; ) SELECT * FROM subquery LIMIT 20 OFFSET 10';

        expect(result).toBe(expectedQuery);
    });
});
