import {
    DashboardFilterRule,
    DimensionType,
    FilterOperator,
} from '@lightdash/common';
import { SqlQueryBuilder } from './SqlQueryBuilder';
import {
    DEFAULT_CONFIG,
    MULTI_FIELD_REFERENCE_MAP,
    QUERY_WITH_EMPTY_SELECT_SQL,
    QUERY_WITH_FILTER_SQL,
    QUERY_WITH_LIMIT_OFFSET_MIN_SQL,
    QUERY_WITH_LIMIT_OFFSET_SQL,
    QUERY_WITH_LIMIT_ONLY_LIMIT_SQL,
    QUERY_WITH_LIMIT_SQL,
    QUERY_WITH_NESTED_FILTERS_SQL,
    QUERY_WITH_SUBQUERY_SEMICOLON_COMMENTS_SQL,
    QUERY_WITH_SUBQUERY_SQL,
    QUERY_WITH_TWO_FILTERS_SQL,
    SECOND_FILTER_RULE,
    SIMPLE_FILTER_RULE,
    SIMPLE_QUERY_SQL,
    SIMPLE_REFERENCE_MAP,
} from './SqlQueryBuilder.mocks';

describe('SqlQueryBuilder class', () => {
    describe('constructor', () => {
        it('should initialize with minimal arguments', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {},
                    select: [],
                    from: { name: 'test_table' },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder).toBeDefined();
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_EMPTY_SELECT_SQL);
        });

        it('should initialize with all arguments', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    filters: {
                        id: 'filter_group_1',
                        and: [SIMPLE_FILTER_RULE, SECOND_FILTER_RULE],
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder).toBeDefined();
            // We're not testing the SQL output here as it will be covered in other tests
        });
    });

    describe('SQL generation', () => {
        it('should generate correct SQL for a simple query', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(SIMPLE_QUERY_SQL);
        });

        it('should generate correct SQL for a query with filters', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    filters: {
                        id: 'filter_group_1',
                        and: [SIMPLE_FILTER_RULE],
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_FILTER_SQL);
        });

        it('should generate correct SQL for a query with two filters', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    filters: {
                        id: 'filter_group_1',
                        and: [SIMPLE_FILTER_RULE, SECOND_FILTER_RULE],
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_TWO_FILTERS_SQL);
        });

        it('should generate correct SQL for a query with a subquery in FROM', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        test_field: {
                            type: DimensionType.STRING,
                            sql: '"test_field"',
                        },
                    },
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT test_field FROM source_table WHERE test_field IS NOT NULL',
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_SUBQUERY_SQL);
        });

        it('should handle SQL with semicolons and comments in FROM', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        test_field: {
                            type: DimensionType.STRING,
                            sql: '"test_field"',
                        },
                    },
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT test_field FROM source_table WHERE test_field IS NOT NULL; -- This is a comment\n/* This is a\n   multi-line comment */',
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(
                QUERY_WITH_SUBQUERY_SEMICOLON_COMMENTS_SQL,
            );
        });
    });

    // toSql tests have been moved to the 'SQL generation' section

    describe('complex scenarios', () => {
        it('should generate SQL with nested filter groups', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: MULTI_FIELD_REFERENCE_MAP,
                    select: ['field1', 'field2', 'field3'],
                    from: { name: 'table' },
                    filters: {
                        id: 'filter_group_4',
                        and: [
                            {
                                id: 'filter1',
                                target: { fieldId: 'field1' },
                                operator: FilterOperator.EQUALS,
                                values: ['value1'],
                                settings: {},
                                disabled: false,
                            } as DashboardFilterRule,
                            {
                                id: 'nested_or_group',
                                or: [
                                    {
                                        id: 'filter2',
                                        target: { fieldId: 'field2' },
                                        operator: FilterOperator.GREATER_THAN,
                                        values: [10],
                                        settings: {},
                                        disabled: false,
                                    } as DashboardFilterRule,
                                    {
                                        id: 'filter3',
                                        target: { fieldId: 'field3' },
                                        operator: FilterOperator.EQUALS,
                                        values: [true],
                                        settings: {},
                                        disabled: false,
                                    } as DashboardFilterRule,
                                ],
                            },
                        ],
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_NESTED_FILTERS_SQL);
        });

        it('should handle empty select list by selecting all columns', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {},
                    select: [],
                    from: { name: 'test_table' },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_EMPTY_SELECT_SQL);
        });
    });

    describe('limit and offset functionality', () => {
        it('should return query without LIMIT when no limit is set', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );

            expect(queryBuilder.toSql()).toBe(SIMPLE_QUERY_SQL);
        });

        it('should generate simple LIMIT clause when only limit is set', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    limit: 100,
                },
                DEFAULT_CONFIG,
            );

            expect(queryBuilder.toSql()).toBe(QUERY_WITH_LIMIT_SQL);
        });

        it('should handle limit when limitOffset is found in subquery', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT * FROM source_table WHERE field IS NOT NULL LIMIT 200 OFFSET 10',
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );

            expect(queryBuilder.toSql()).toBe(QUERY_WITH_LIMIT_OFFSET_SQL);
        });

        it('should use the minimum of existing limit and new limit', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT * FROM source_table WHERE field IS NOT NULL LIMIT 30 OFFSET 5',
                    },
                    limit: 100,
                },
                DEFAULT_CONFIG,
            );

            expect(queryBuilder.toSql()).toBe(QUERY_WITH_LIMIT_OFFSET_MIN_SQL);
        });

        it('should handle limitOffset with only limit (no offset) in subquery', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT * FROM source_table WHERE field IS NOT NULL LIMIT 75',
                    },
                    limit: 100,
                },
                DEFAULT_CONFIG,
            );

            expect(queryBuilder.toSql()).toBe(QUERY_WITH_LIMIT_ONLY_LIMIT_SQL);
        });
    });

    describe('ORDER BY handling with ROW_NUMBER injection', () => {
        it('should inject ROW_NUMBER and order by it when subquery has ORDER BY', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        test_field: {
                            type: DimensionType.STRING,
                            sql: '"test_field"',
                        },
                    },
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT test_field FROM source_table ORDER BY test_field DESC',
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            // The subquery should contain ROW_NUMBER
            expect(result).toContain(
                'ROW_NUMBER() OVER (ORDER BY test_field DESC)',
            );
            expect(result).toContain('"__lightdash_row_number__"');
            // Outer query should ORDER BY the row number column
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
            // The subquery should NOT contain a standalone ORDER BY clause
            const fromMatch = result.match(
                /FROM \(\n([\s\S]*?)\n\) AS "subquery"/,
            );
            // The inner SQL should not have ORDER BY outside the OVER clause
            const innerSql = fromMatch?.[1] ?? '';
            const withoutOver = innerSql.replace(/OVER\s*\([^)]*\)/g, '');
            expect(withoutOver).not.toContain('ORDER BY');
        });

        it('should inject ROW_NUMBER with ORDER BY and LIMIT from subquery', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        test_field: {
                            type: DimensionType.STRING,
                            sql: '"test_field"',
                        },
                    },
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT test_field FROM source_table ORDER BY test_field ASC LIMIT 100',
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            // Should have ROW_NUMBER in subquery
            expect(result).toContain(
                'ROW_NUMBER() OVER (ORDER BY test_field ASC)',
            );
            // ORDER BY should be at outer level
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
            // LIMIT should also be at the outer level
            expect(result).toContain('LIMIT 50');
            // The subquery should have neither standalone ORDER BY nor LIMIT
            const fromMatch = result.match(
                /FROM \(\n([\s\S]*?)\n\) AS "subquery"/,
            );
            const innerSql = fromMatch?.[1] ?? '';
            expect(innerSql).not.toContain('LIMIT');
        });

        it('should not add ORDER BY when subquery has no ORDER BY', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        test_field: {
                            type: DimensionType.STRING,
                            sql: '"test_field"',
                        },
                    },
                    select: ['test_field'],
                    from: {
                        name: 'subquery',
                        sql: 'SELECT test_field FROM source_table WHERE test_field IS NOT NULL',
                    },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            expect(result).not.toContain('ORDER BY');
            expect(result).not.toContain('ROW_NUMBER');
        });

        it('should not add ORDER BY when FROM is a table name (no sql)', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            expect(result).not.toContain('ORDER BY');
            expect(result).not.toContain('ROW_NUMBER');
        });

        it('should handle complex ORDER BY expressions like CASE', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        date: {
                            type: DimensionType.STRING,
                            sql: '"date"',
                        },
                        revenue: {
                            type: DimensionType.NUMBER,
                            sql: '"revenue"',
                        },
                    },
                    select: ['date', 'revenue'],
                    from: {
                        name: 'sql_query',
                        sql: 'SELECT date, revenue FROM sales ORDER BY CASE WHEN revenue > 100 THEN 1 ELSE 2 END',
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            expect(result).toContain(
                'ROW_NUMBER() OVER (ORDER BY CASE WHEN revenue > 100 THEN 1 ELSE 2 END)',
            );
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
        });

        it('should handle ORDER BY with column not in SELECT', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        date: {
                            type: DimensionType.STRING,
                            sql: '"date"',
                        },
                    },
                    select: ['date'],
                    from: {
                        name: 'sql_query',
                        sql: 'SELECT date FROM sales ORDER BY revenue DESC',
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            // ROW_NUMBER can reference revenue even though it's not in SELECT
            expect(result).toContain(
                'ROW_NUMBER() OVER (ORDER BY revenue DESC)',
            );
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
        });

        it('should handle ORDER BY with dashboard filters', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        date: {
                            type: DimensionType.STRING,
                            sql: '"date"',
                        },
                        revenue: {
                            type: DimensionType.NUMBER,
                            sql: '"revenue"',
                        },
                    },
                    select: ['date', 'revenue'],
                    from: {
                        name: 'sql_query',
                        sql: 'SELECT date, revenue FROM sales ORDER BY revenue DESC',
                    },
                    filters: {
                        id: 'filter_group_1',
                        and: [
                            {
                                id: 'filter1',
                                target: { fieldId: 'date' },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-01-01'],
                                settings: {},
                                disabled: false,
                            } as DashboardFilterRule,
                        ],
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            // Should have WHERE, ORDER BY, and LIMIT in correct order
            expect(result).toContain('WHERE');
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
            expect(result).toContain('LIMIT 50');
            // WHERE should come before the outer ORDER BY (the one with __lightdash_row_number__)
            const whereIdx = result.indexOf('WHERE');
            const outerOrderByIdx = result.indexOf(
                'ORDER BY "__lightdash_row_number__"',
            );
            const limitIdx = result.indexOf('LIMIT');
            expect(whereIdx).toBeLessThan(outerOrderByIdx);
            expect(outerOrderByIdx).toBeLessThan(limitIdx);
        });

        it('should normalize ORDER BY ordinal positions', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        date: {
                            type: DimensionType.STRING,
                            sql: '"date"',
                        },
                        revenue: {
                            type: DimensionType.NUMBER,
                            sql: '"revenue"',
                        },
                    },
                    select: ['date', 'revenue'],
                    from: {
                        name: 'sql_query',
                        sql: 'SELECT date, revenue FROM sales ORDER BY 2 DESC',
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            expect(result).toContain(
                'ROW_NUMBER() OVER (ORDER BY (revenue) DESC)',
            );
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
        });

        it('should normalize ORDER BY ordinals that reference aliased expressions', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {
                        doubled: {
                            type: DimensionType.NUMBER,
                            sql: '"doubled"',
                        },
                    },
                    select: ['doubled'],
                    from: {
                        name: 'sql_query',
                        sql: 'SELECT amount * 2 AS doubled FROM sales ORDER BY 1 DESC',
                    },
                    limit: 50,
                },
                DEFAULT_CONFIG,
            );
            const result = queryBuilder.toSql();
            expect(result).toContain(
                'ROW_NUMBER() OVER (ORDER BY (amount * 2) DESC)',
            );
            expect(result).toContain('ORDER BY "__lightdash_row_number__"');
        });
    });

    describe('error handling', () => {
        it('should throw an error for unknown reference', () => {
            const queryBuilder = new SqlQueryBuilder(
                {
                    referenceMap: {},
                    select: ['unknown_field'],
                    from: { name: 'test_table' },
                    limit: undefined,
                },
                DEFAULT_CONFIG,
            );
            expect(() => queryBuilder.toSql()).toThrow(
                'Unknown reference: unknown_field',
            );
        });
    });
});
