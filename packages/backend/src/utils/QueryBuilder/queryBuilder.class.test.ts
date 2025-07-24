import {
    DashboardFilterRule,
    DimensionType,
    FilterOperator,
} from '@lightdash/common';
import { QueryBuilder } from './queryBuilder';
import {
    DEFAULT_CONFIG,
    MULTI_FIELD_REFERENCE_MAP,
    QUERY_WITH_EMPTY_SELECT_SQL,
    QUERY_WITH_FILTER_SQL,
    QUERY_WITH_NESTED_FILTERS_SQL,
    QUERY_WITH_SUBQUERY_SQL,
    QUERY_WITH_TWO_FILTERS_SQL,
    SECOND_FILTER_RULE,
    SIMPLE_FILTER_RULE,
    SIMPLE_QUERY_SQL,
    SIMPLE_REFERENCE_MAP,
} from './queryBuilder.class.mocks';

describe('QueryBuilder class', () => {
    describe('constructor', () => {
        it('should initialize with minimal arguments', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: {},
                    select: [],
                    from: { name: 'test_table' },
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder).toBeDefined();
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_EMPTY_SELECT_SQL);
        });

        it('should initialize with all arguments', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    filters: {
                        id: 'filter_group_1',
                        and: [SIMPLE_FILTER_RULE, SECOND_FILTER_RULE],
                    },
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder).toBeDefined();
            // We're not testing the SQL output here as it will be covered in other tests
        });
    });

    describe('SQL generation', () => {
        it('should generate correct SQL for a simple query', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(SIMPLE_QUERY_SQL);
        });

        it('should generate correct SQL for a query with filters', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    filters: {
                        id: 'filter_group_1',
                        and: [SIMPLE_FILTER_RULE],
                    },
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_FILTER_SQL);
        });

        it('should generate correct SQL for a query with two filters', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: SIMPLE_REFERENCE_MAP,
                    select: ['test_field'],
                    from: { name: 'test_table' },
                    filters: {
                        id: 'filter_group_1',
                        and: [SIMPLE_FILTER_RULE, SECOND_FILTER_RULE],
                    },
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_TWO_FILTERS_SQL);
        });

        it('should generate correct SQL for a query with a subquery in FROM', () => {
            const queryBuilder = new QueryBuilder(
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
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_SUBQUERY_SQL);
        });
    });

    // toSql tests have been moved to the 'SQL generation' section

    describe('complex scenarios', () => {
        it('should generate SQL with nested filter groups', () => {
            const queryBuilder = new QueryBuilder(
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
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_NESTED_FILTERS_SQL);
        });

        it('should handle empty select list by selecting all columns', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: {},
                    select: [],
                    from: { name: 'test_table' },
                },
                DEFAULT_CONFIG,
            );
            expect(queryBuilder.toSql()).toBe(QUERY_WITH_EMPTY_SELECT_SQL);
        });
    });

    describe('error handling', () => {
        it('should throw an error for unknown reference', () => {
            const queryBuilder = new QueryBuilder(
                {
                    referenceMap: {},
                    select: ['unknown_field'],
                    from: { name: 'test_table' },
                },
                DEFAULT_CONFIG,
            );
            expect(() => queryBuilder.toSql()).toThrow(
                'Unknown reference: unknown_field',
            );
        });
    });
});
