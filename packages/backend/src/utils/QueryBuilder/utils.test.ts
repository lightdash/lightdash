import {
    BinType,
    CompiledExploreJoin,
    CustomDimensionType,
    ForbiddenError,
    isCustomBinDimension,
    JoinRelationship,
    MetricType,
    WeekDay,
} from '@lightdash/common';
import {
    bigqueryClientMock,
    COMPILED_DIMENSION,
    COMPILED_MONTH_NAME_DIMENSION,
    COMPILED_WEEK_NAME_DIMENSION,
    CUSTOM_SQL_DIMENSION,
    EXPLORE,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY_WITH_CUSTOM_DIMENSION,
    MONTH_NAME_SORT_DESCENDING_SQL,
    MONTH_NAME_SORT_SQL,
    warehouseClientMock,
    WEEK_NAME_SORT_DESCENDING_SQL,
    WEEK_NAME_SORT_SQL,
} from './queryBuilder.mock';
import {
    applyLimitToSqlQuery,
    assertValidDimensionRequiredAttribute,
    findMetricInflationWarnings,
    getCustomBinDimensionSql,
    getCustomSqlDimensionSql,
    replaceUserAttributesAsStrings,
    sortDayOfWeekName,
    sortMonthName,
} from './utils';

describe('replaceUserAttributes', () => {
    it('method with no user attribute should return same sqlFilter', () => {
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

    it('method with missing user attribute should throw error', () => {
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

    it('method with no user attribute value should throw error', () => {
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

    it('method should replace sqlFilter with user attribute', () => {
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

    it('method should replace sqlFilter with user attribute with multiple values', () => {
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

    it('method should replace sqlFilter with multiple user attributes', () => {
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

    it('method should replace sqlFilter using short aliases', () => {
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

    it('method should not replace any invalid attribute', () => {
        expect(
            replaceUserAttributesAsStrings(
                '${lightdash.foo.test} > 1',
                INTRINSIC_USER_ATTRIBUTES,
                {},
                warehouseClientMock,
            ),
        ).toEqual('${lightdash.foo.test} > 1');
    });

    it('should replace `email` intrinsic user attribute', () => {
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
    it('should not throw errors if no user attributes are required', () => {
        const result = assertValidDimensionRequiredAttribute(
            COMPILED_DIMENSION,
            {},
            '',
        );

        expect(result).toBeUndefined();
    });

    it('should throw errors if required attributes are required and user attributes are missing', () => {
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

    it('should not throw errors if required attributes are required and user attributes exist', () => {
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
            join: 'CROSS JOIN age_range_cte',
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
            join: 'CROSS JOIN age_range_cte',
            selects: [
                `CONCAT(age_range_cte.min_id, ' - ', age_range_cte.max_id) AS \`age_range\``,
            ],
            tables: ['table1'],
        });
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
            join: 'CROSS JOIN age_range_cte',
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

describe('findMetricInflationWarnings', () => {
    it('should return no warnings when there are no metrics', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    tablesReferences: ['users', 'orders'],
                    relationship: JoinRelationship.ONE_TO_MANY,
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['orders']),
            metrics: [],
        });

        expect(result).toEqual([]);
    });

    it('should return no warnings when there are no joined tables', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
            },
            possibleJoins: [],
            baseTable: 'users',
            joinedTables: new Set([]),
            metrics: [
                {
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    table: 'users',
                    label: 'Total Revenue',
                },
            ],
        });

        expect(result).toEqual([]);
    });

    it('should not warn for inflation-proof metrics (COUNT_DISTINCT, MIN, MAX)', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    tablesReferences: ['users', 'orders'],
                    relationship: JoinRelationship.ONE_TO_MANY,
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['users', 'orders']),
            metrics: [
                {
                    name: 'count_users',
                    type: MetricType.COUNT_DISTINCT,
                    table: 'users',
                    label: 'count users',
                },
                {
                    name: 'min_user',
                    type: MetricType.MIN,
                    table: 'users',
                    label: 'Min user',
                },
                {
                    name: 'max_user',
                    type: MetricType.MAX,
                    table: 'users',
                    label: 'Max user',
                },
            ],
        });

        expect(result).toEqual([]);
    });

    it('should warn for metrics with single one-to-many joins', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['users', 'orders'],
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['orders']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: 'Total users',
                },
                {
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    table: 'orders',
                    label: 'total revenue',
                },
            ],
        });

        expect(result).toHaveLength(1);
        expect(result[0].fields?.[0]).toBe('users_total_users');
    });

    it('should warn for metrics with chained one-to-many joins', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
                order_items: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['users', 'orders'],
                },
                {
                    table: 'order_items',
                    sqlOn: 'orders.id = order_items.order_id',
                    compiledSqlOn: 'orders.id = order_items.order_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['order_items', 'orders'],
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['orders', 'order_items']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: '',
                },
                {
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    table: 'orders',
                    label: '',
                },
                {
                    name: 'total_items',
                    type: MetricType.SUM,
                    table: 'order_items',
                    label: '',
                },
            ],
        });

        expect(result).toHaveLength(2);
        expect(result[0].fields?.[0]).toBe('users_total_users');
        expect(result[1].fields?.[0]).toBe('orders_total_revenue');
    });

    it('should warn for metrics with multiple one-to-many joins', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
                tickets: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['users', 'orders'],
                },
                {
                    table: 'tickets',
                    sqlOn: 'users.id = tickets.user_id',
                    compiledSqlOn: 'users.id = tickets.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['users', 'tickets'],
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['orders', 'tickets']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: '',
                },
                {
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    table: 'orders',
                    label: '',
                },
                {
                    name: 'total_tickets',
                    type: MetricType.SUM,
                    table: 'tickets',
                    label: '',
                },
            ],
        });

        expect(result).toHaveLength(3);
        expect(result[0].fields?.[0]).toBe('users_total_users');
        expect(result[1].fields?.[0]).toBe('orders_total_revenue');
        expect(result[2].fields?.[0]).toBe('tickets_total_tickets');
    });

    it('should warn for joins with undefined relationship', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    tablesReferences: ['users', 'orders'],
                    // relationship not specified, should default to one-to-one
                    compiledSqlOn: 'users.id = orders.user_id',
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['orders']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: '',
                },
                {
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    table: 'orders',
                    label: '',
                },
            ],
        });

        expect(result).toHaveLength(1);
        expect(result[0].tables?.[0]).toBe('orders');
        expect(result[0].message).toContain('missing a join relationship type');
    });

    it('should not warn for metrics with one-to-one relationships', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                user_profiles: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'user_profiles',
                    sqlOn: 'users.id = user_profiles.user_id',
                    compiledSqlOn: 'users.id = user_profiles.user_id',
                    tablesReferences: ['users', 'user_profiles'],
                    relationship: JoinRelationship.ONE_TO_ONE,
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['user_profiles']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: '',
                },
                {
                    name: 'profile_completeness',
                    type: MetricType.SUM,
                    table: 'user_profiles',
                    label: '',
                },
            ],
        });

        expect(result).toEqual([]);
    });

    it('should warn for metrics with one-to-one and one-to-many joins', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                user_profiles: { primaryKey: ['id'] },
                orders: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'user_profiles',
                    sqlOn: 'users.id = user_profiles.user_id',
                    compiledSqlOn: 'users.id = user_profiles.user_id',
                    relationship: JoinRelationship.ONE_TO_ONE,
                    tablesReferences: ['users', 'user_profiles'],
                },
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['users', 'orders'],
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['user_profiles', 'orders']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: '',
                },
                {
                    name: 'total_orders',
                    type: MetricType.SUM,
                    table: 'orders',
                    label: '',
                },
                {
                    name: 'total_user_profiles',
                    type: MetricType.SUM,
                    table: 'user_profiles',
                    label: '',
                },
            ],
        });

        expect(result).toHaveLength(2);
        expect(result[0].fields?.[0]).toBe('users_total_users');
        expect(result[1].fields?.[0]).toBe('user_profiles_total_user_profiles');
    });

    // Example in SQL:
    // SELECT *
    // FROM table_A A
    // JOIN table_C C ON C.some_field = A.some_field
    // JOIN table_B B ON B.id = A.id AND B.user_id = C.user_id
    it('should warn for metrics with one-to-many complex join', () => {
        const result = findMetricInflationWarnings({
            tables: {
                table_A: { primaryKey: ['id'] },
                table_B: { primaryKey: ['id'] },
                table_C: { primaryKey: ['id'] },
            },
            possibleJoins: [
                {
                    table: 'table_C',
                    sqlOn: 'table_C.some_field = table_A.some_field',
                    compiledSqlOn: 'table_C.some_field = table_A.some_field',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['table_A', 'table_C'],
                },
                {
                    table: 'table_B',
                    sqlOn: 'table_B.id = table_A.id AND table_B.user_id = table_C.user_id',
                    compiledSqlOn:
                        'table_B.id = table_A.id AND table_B.user_id = table_C.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['table_A', 'table_B', 'table_C'],
                },
            ],
            baseTable: 'table_A',
            joinedTables: new Set(['table_B', 'table_C']),
            metrics: [
                {
                    name: 'metric_a',
                    type: MetricType.SUM,
                    table: 'table_A',
                    label: '',
                },
                {
                    name: 'metric_b',
                    type: MetricType.SUM,
                    table: 'table_B',
                    label: '',
                },
                {
                    name: 'metric_c',
                    type: MetricType.SUM,
                    table: 'table_C',
                    label: '',
                },
            ],
        });

        expect(result).toHaveLength(3);
        expect(result[0].fields?.[0]).toBe('table_A_metric_a');
        expect(result[1].fields?.[0]).toBe('table_B_metric_b');
        expect(result[2].fields?.[0]).toBe('table_C_metric_c');
    });

    it('should warn for tables with missing primary key', () => {
        const result = findMetricInflationWarnings({
            tables: {
                users: { primaryKey: ['id'] },
                orders: {}, // Missing primary key
            },
            possibleJoins: [
                {
                    table: 'orders',
                    sqlOn: 'users.id = orders.user_id',
                    compiledSqlOn: 'users.id = orders.user_id',
                    relationship: JoinRelationship.ONE_TO_MANY,
                    tablesReferences: ['users', 'orders'],
                },
            ],
            baseTable: 'users',
            joinedTables: new Set(['orders']),
            metrics: [
                {
                    name: 'total_users',
                    type: MetricType.SUM,
                    table: 'users',
                    label: 'Total users',
                },
                {
                    name: 'total_revenue',
                    type: MetricType.SUM,
                    table: 'orders',
                    label: 'Total revenue',
                },
            ],
        });

        // Should have warnings for both the missing primary key and the metric inflation
        expect(result).toHaveLength(2);

        // Check for the missing primary key warning
        const primaryKeyWarning = result.find((warning) =>
            warning.message.includes('missing a primary key definition'),
        );
        expect(primaryKeyWarning).toBeDefined();
        expect(primaryKeyWarning?.tables?.[0]).toBe('orders');

        // Check for the metric inflation warning
        const metricWarning = result.find(
            (warning) =>
                warning.fields && warning.fields[0] === 'users_total_users',
        );
        expect(metricWarning).toBeDefined();
    });
});
