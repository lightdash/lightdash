import { FilterOperator, type Filters } from '@lightdash/common';
import {
    compileSqlToMetricQuery,
    PGWIRE_DEFAULT_LIMIT,
    SqlCompileError,
} from './sqlToMetricQuery';
import { type PgWireTable } from './types';

const ORDERS: PgWireTable = {
    name: 'orders',
    fields: [
        { fieldId: 'orders_status', kind: 'dimension', type: 'string' },
        { fieldId: 'orders_order_date', kind: 'dimension', type: 'date' },
        { fieldId: 'orders_is_completed', kind: 'dimension', type: 'boolean' },
        { fieldId: 'orders_amount', kind: 'dimension', type: 'number' },
        // fields from a joined table in the explore
        {
            fieldId: 'customers_first_name',
            kind: 'dimension',
            type: 'string',
        },
        {
            fieldId: 'orders_total_order_amount',
            kind: 'metric',
            type: 'sum',
        },
        {
            fieldId: 'orders_unique_order_count',
            kind: 'metric',
            type: 'count_distinct',
        },
        { fieldId: 'orders_avg_amount', kind: 'metric', type: 'average' },
    ],
};

const CUSTOMERS: PgWireTable = {
    name: 'customers',
    fields: [
        { fieldId: 'customers_customer_id', kind: 'dimension', type: 'number' },
        {
            fieldId: 'customers_days_since_last_order',
            kind: 'metric',
            type: 'min',
        },
    ],
};

const CATALOG = [ORDERS, CUSTOMERS];

const compile = (sql: string) => compileSqlToMetricQuery(sql, CATALOG);

/** Strip generated filter rule/group ids so tests compare structure only */
const stripIds = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripIds);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([key]) => key !== 'id')
                .map(([key, v]) => [key, stripIds(v)]),
        );
    }
    return value;
};

const filtersOf = (sql: string) => stripIds(compile(sql).metricQuery.filters);

describe('compileSqlToMetricQuery', () => {
    describe('basic selection', () => {
        it('compiles a single dimension', () => {
            const result = compile('SELECT orders_status FROM orders');
            expect(result.metricQuery).toEqual({
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: [],
                filters: {},
                sorts: [],
                limit: PGWIRE_DEFAULT_LIMIT,
                tableCalculations: [],
            });
            expect(result.columns).toEqual([
                {
                    name: 'orders_status',
                    source: 'orders_status',
                    kind: 'dimension',
                    type: 'string',
                },
            ]);
        });

        it('compiles dimensions and metrics', () => {
            const result = compile(
                'SELECT orders_status, orders_total_order_amount, orders_unique_order_count FROM orders',
            );
            expect(result.metricQuery.dimensions).toEqual(['orders_status']);
            expect(result.metricQuery.metrics).toEqual([
                'orders_total_order_amount',
                'orders_unique_order_count',
            ]);
        });

        it('selects fields from joined explore tables', () => {
            const result = compile(
                'SELECT customers_first_name, orders_total_order_amount FROM orders',
            );
            expect(result.metricQuery.dimensions).toEqual([
                'customers_first_name',
            ]);
        });

        it('deduplicates repeated fields but keeps both output columns', () => {
            const result = compile(
                'SELECT orders_status, orders_status AS again FROM orders',
            );
            expect(result.metricQuery.dimensions).toEqual(['orders_status']);
            expect(result.columns).toHaveLength(2);
            expect(result.columns[1].name).toBe('again');
            expect(result.columns[1].source).toBe('orders_status');
        });

        it('expands SELECT * to all fields in catalog order', () => {
            const result = compile('SELECT * FROM orders');
            expect(result.metricQuery.dimensions).toEqual([
                'orders_status',
                'orders_order_date',
                'orders_is_completed',
                'orders_amount',
                'customers_first_name',
            ]);
            expect(result.metricQuery.metrics).toEqual([
                'orders_total_order_amount',
                'orders_unique_order_count',
                'orders_avg_amount',
            ]);
            expect(result.columns).toHaveLength(ORDERS.fields.length);
        });

        it('expands table-qualified star', () => {
            const result = compile('SELECT orders.* FROM orders');
            expect(result.columns).toHaveLength(ORDERS.fields.length);
        });

        it('resolves table-qualified column names', () => {
            const result = compile(
                'SELECT orders.status, customers.first_name FROM orders',
            );
            expect(result.metricQuery.dimensions).toEqual([
                'orders_status',
                'customers_first_name',
            ]);
        });

        it('resolves columns qualified by the FROM alias', () => {
            const result = compile(
                'SELECT o.orders_status, o.status FROM orders o',
            );
            expect(result.metricQuery.dimensions).toEqual(['orders_status']);
        });

        it('uses the alias as the output column name', () => {
            const result = compile(
                'SELECT orders_status AS status FROM orders',
            );
            expect(result.columns[0].name).toBe('status');
            expect(result.columns[0].source).toBe('orders_status');
        });

        it('targets the requested explore from the catalog', () => {
            const result = compile(
                'SELECT customers_customer_id FROM customers',
            );
            expect(result.metricQuery.exploreName).toBe('customers');
            expect(result.table.name).toBe('customers');
        });

        it('throws on unknown table with available tables hint', () => {
            expect(() => compile('SELECT x FROM nope')).toThrow(
                /Table "nope" does not exist/,
            );
            try {
                compile('SELECT x FROM nope');
            } catch (e) {
                expect((e as SqlCompileError).hint).toContain('orders');
            }
        });

        it('throws on unknown column with available columns hint', () => {
            expect(() => compile('SELECT nope FROM orders')).toThrow(
                /Column "nope" does not exist/,
            );
        });

        it('throws on unknown qualified column', () => {
            expect(() => compile('SELECT payments.amount FROM orders')).toThrow(
                /Column "payments.amount" does not exist/,
            );
        });

        it('throws when only table calculations are selected', () => {
            expect(() => compile('SELECT 1 + 1 AS two FROM orders')).toThrow(
                /at least one dimension or metric/,
            );
        });
    });

    describe('WHERE filters on dimensions', () => {
        it('compiles equals', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status = 'completed'",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
            });
        });

        it('compiles not equals with != and <>', () => {
            for (const op of ['!=', '<>']) {
                expect(
                    filtersOf(
                        `SELECT orders_status FROM orders WHERE orders_status ${op} 'completed'`,
                    ),
                ).toEqual({
                    dimensions: {
                        and: [
                            {
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.NOT_EQUALS,
                                values: ['completed'],
                            },
                        ],
                    },
                });
            }
        });

        it('compiles numeric comparisons', () => {
            const cases: Array<[string, FilterOperator]> = [
                ['<', FilterOperator.LESS_THAN],
                ['<=', FilterOperator.LESS_THAN_OR_EQUAL],
                ['>', FilterOperator.GREATER_THAN],
                ['>=', FilterOperator.GREATER_THAN_OR_EQUAL],
            ];
            for (const [op, operator] of cases) {
                expect(
                    filtersOf(
                        `SELECT orders_amount FROM orders WHERE orders_amount ${op} 100`,
                    ),
                ).toEqual({
                    dimensions: {
                        and: [
                            {
                                target: { fieldId: 'orders_amount' },
                                operator,
                                values: [100],
                            },
                        ],
                    },
                });
            }
        });

        it('flips the operator when the literal is on the left', () => {
            expect(
                filtersOf(
                    'SELECT orders_amount FROM orders WHERE 100 < orders_amount',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [100],
                        },
                    ],
                },
            });
        });

        it('compiles negative and decimal numbers', () => {
            expect(
                filtersOf(
                    'SELECT orders_amount FROM orders WHERE orders_amount > -1.5',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [-1.5],
                        },
                    ],
                },
            });
        });

        it('compiles IN to equals with multiple values', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status IN ('completed', 'shipped')",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed', 'shipped'],
                        },
                    ],
                },
            });
        });

        it('compiles single-element IN lists', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status NOT IN ('returned')",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.NOT_EQUALS,
                            values: ['returned'],
                        },
                    ],
                },
            });
        });

        it('compiles NOT IN to notEquals with multiple values', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status NOT IN ('returned', 'refunded')",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.NOT_EQUALS,
                            values: ['returned', 'refunded'],
                        },
                    ],
                },
            });
        });

        it('compiles LIKE patterns to string operators', () => {
            const cases: Array<[string, FilterOperator, string]> = [
                ["'%ship%'", FilterOperator.INCLUDE, 'ship'],
                ["'ship%'", FilterOperator.STARTS_WITH, 'ship'],
                ["'%ship'", FilterOperator.ENDS_WITH, 'ship'],
                ["'ship'", FilterOperator.EQUALS, 'ship'],
            ];
            for (const [pattern, operator, value] of cases) {
                expect(
                    filtersOf(
                        `SELECT orders_status FROM orders WHERE orders_status LIKE ${pattern}`,
                    ),
                ).toEqual({
                    dimensions: {
                        and: [
                            {
                                target: { fieldId: 'orders_status' },
                                operator,
                                values: [value],
                            },
                        ],
                    },
                });
            }
        });

        it('treats ILIKE like LIKE', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status ILIKE '%ship%'",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.INCLUDE,
                            values: ['ship'],
                        },
                    ],
                },
            });
        });

        it('compiles NOT LIKE %value% to doesNotInclude', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status NOT LIKE '%ship%'",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.NOT_INCLUDE,
                            values: ['ship'],
                        },
                    ],
                },
            });
        });

        it('rejects unsupported LIKE patterns', () => {
            expect(() =>
                compile(
                    "SELECT orders_status FROM orders WHERE orders_status LIKE 'a%b'",
                ),
            ).toThrow(/Unsupported LIKE pattern/);
            expect(() =>
                compile(
                    "SELECT orders_status FROM orders WHERE orders_status LIKE 'a_b'",
                ),
            ).toThrow(/Unsupported LIKE pattern/);
            expect(() =>
                compile(
                    "SELECT orders_status FROM orders WHERE orders_status NOT LIKE 'ship%'",
                ),
            ).toThrow(/NOT LIKE with pattern/);
        });

        it('compiles IS NULL and IS NOT NULL', () => {
            expect(
                filtersOf(
                    'SELECT orders_status FROM orders WHERE orders_status IS NULL',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.NULL,
                        },
                    ],
                },
            });
            expect(
                filtersOf(
                    'SELECT orders_status FROM orders WHERE orders_status IS NOT NULL',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.NOT_NULL,
                        },
                    ],
                },
            });
        });

        it('compiles boolean column filters', () => {
            expect(
                filtersOf(
                    'SELECT orders_is_completed FROM orders WHERE orders_is_completed',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_is_completed' },
                            operator: FilterOperator.EQUALS,
                            values: [true],
                        },
                    ],
                },
            });
            expect(
                filtersOf(
                    'SELECT orders_is_completed FROM orders WHERE NOT orders_is_completed',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_is_completed' },
                            operator: FilterOperator.EQUALS,
                            values: [false],
                        },
                    ],
                },
            });
            expect(
                filtersOf(
                    'SELECT orders_is_completed FROM orders WHERE orders_is_completed IS TRUE',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_is_completed' },
                            operator: FilterOperator.EQUALS,
                            values: [true],
                        },
                    ],
                },
            });
            expect(
                filtersOf(
                    'SELECT orders_is_completed FROM orders WHERE orders_is_completed = true',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_is_completed' },
                            operator: FilterOperator.EQUALS,
                            values: [true],
                        },
                    ],
                },
            });
        });

        it('compiles BETWEEN to a >= and <= group', () => {
            expect(
                filtersOf(
                    'SELECT orders_amount FROM orders WHERE orders_amount BETWEEN 10 AND 20',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            and: [
                                {
                                    target: { fieldId: 'orders_amount' },
                                    operator:
                                        FilterOperator.GREATER_THAN_OR_EQUAL,
                                    values: [10],
                                },
                                {
                                    target: { fieldId: 'orders_amount' },
                                    operator: FilterOperator.LESS_THAN_OR_EQUAL,
                                    values: [20],
                                },
                            ],
                        },
                    ],
                },
            });
        });

        it('compiles NOT BETWEEN to a < or > group', () => {
            expect(
                filtersOf(
                    'SELECT orders_amount FROM orders WHERE orders_amount NOT BETWEEN 10 AND 20',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            or: [
                                {
                                    target: { fieldId: 'orders_amount' },
                                    operator: FilterOperator.LESS_THAN,
                                    values: [10],
                                },
                                {
                                    target: { fieldId: 'orders_amount' },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [20],
                                },
                            ],
                        },
                    ],
                },
            });
        });

        it('unwraps casts in filter values', () => {
            for (const literal of [
                "'2024-01-01'::date",
                "DATE '2024-01-01'",
                "CAST('2024-01-01' AS date)",
            ]) {
                expect(
                    filtersOf(
                        `SELECT orders_order_date FROM orders WHERE orders_order_date >= ${literal}`,
                    ),
                ).toEqual({
                    dimensions: {
                        and: [
                            {
                                target: { fieldId: 'orders_order_date' },
                                operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                                values: ['2024-01-01'],
                            },
                        ],
                    },
                });
            }
        });

        it('combines top-level AND conjuncts into one dimensions group', () => {
            expect(
                filtersOf(
                    "SELECT orders_status, orders_amount FROM orders WHERE orders_status = 'completed' AND orders_amount > 10",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                        {
                            target: { fieldId: 'orders_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [10],
                        },
                    ],
                },
            });
        });

        it('compiles OR groups', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE orders_status = 'completed' OR orders_status = 'shipped'",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            or: [
                                {
                                    target: { fieldId: 'orders_status' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['completed'],
                                },
                                {
                                    target: { fieldId: 'orders_status' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['shipped'],
                                },
                            ],
                        },
                    ],
                },
            });
        });

        it('compiles nested AND/OR groups', () => {
            expect(
                filtersOf(
                    `SELECT orders_status, orders_amount FROM orders
                     WHERE orders_amount > 0 AND (orders_status = 'completed' OR orders_status = 'shipped')`,
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [0],
                        },
                        {
                            or: [
                                {
                                    target: { fieldId: 'orders_status' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['completed'],
                                },
                                {
                                    target: { fieldId: 'orders_status' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['shipped'],
                                },
                            ],
                        },
                    ],
                },
            });
        });

        it('negates simple comparisons with NOT', () => {
            expect(
                filtersOf(
                    "SELECT orders_status FROM orders WHERE NOT (orders_status = 'completed')",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.NOT_EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
            });
            expect(
                filtersOf(
                    'SELECT orders_amount FROM orders WHERE NOT (orders_amount < 10)',
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_amount' },
                            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                            values: [10],
                        },
                    ],
                },
            });
        });

        it('allows filtering on fields that are not selected', () => {
            expect(
                filtersOf(
                    "SELECT orders_amount FROM orders WHERE orders_status = 'completed'",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
            });
        });

        it('allows filtering via select-list aliases', () => {
            expect(
                filtersOf(
                    "SELECT orders_status AS status FROM orders WHERE status = 'completed'",
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
            });
        });

        it('skips tautologies like WHERE TRUE and 1=1', () => {
            expect(
                filtersOf('SELECT orders_status FROM orders WHERE TRUE'),
            ).toEqual({});
            expect(
                filtersOf('SELECT orders_status FROM orders WHERE 1 = 1'),
            ).toEqual({});
        });

        it('rejects comparison to NULL', () => {
            expect(() =>
                compile(
                    'SELECT orders_status FROM orders WHERE orders_status = NULL',
                ),
            ).toThrow(/Cannot compare to NULL/);
        });

        it('rejects NULL inside IN lists', () => {
            expect(() =>
                compile(
                    "SELECT orders_status FROM orders WHERE orders_status IN ('a', NULL)",
                ),
            ).toThrow(/NULL is not supported inside IN/);
        });

        it('rejects column-to-column comparisons', () => {
            expect(() =>
                compile(
                    'SELECT orders_status FROM orders WHERE orders_amount > orders_total_order_amount',
                ),
            ).toThrow(/Unsupported filter/);
        });

        it('rejects subqueries in IN', () => {
            expect(() =>
                compile(
                    'SELECT orders_status FROM orders WHERE orders_status IN (SELECT x FROM y)',
                ),
            ).toThrow(SqlCompileError);
        });

        it('rejects NOT over AND/OR groups', () => {
            expect(() =>
                compile(
                    "SELECT orders_status FROM orders WHERE NOT (orders_status = 'a' AND orders_amount > 1)",
                ),
            ).toThrow(/NOT over AND\/OR/);
        });
    });

    describe('metric filters', () => {
        it('routes WHERE conditions on metrics to metric filters', () => {
            expect(
                filtersOf(
                    'SELECT orders_status, orders_total_order_amount FROM orders WHERE orders_total_order_amount > 1000',
                ),
            ).toEqual({
                metrics: {
                    and: [
                        {
                            target: { fieldId: 'orders_total_order_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [1000],
                        },
                    ],
                },
            });
        });

        it('splits mixed dimension and metric conjuncts', () => {
            expect(
                filtersOf(
                    `SELECT orders_status, orders_total_order_amount FROM orders
                     WHERE orders_status = 'completed' AND orders_total_order_amount > 1000`,
                ),
            ).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed'],
                        },
                    ],
                },
                metrics: {
                    and: [
                        {
                            target: { fieldId: 'orders_total_order_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [1000],
                        },
                    ],
                },
            });
        });

        it('compiles HAVING to metric filters', () => {
            expect(
                filtersOf(
                    `SELECT orders_status, orders_total_order_amount FROM orders
                     GROUP BY orders_status HAVING orders_total_order_amount > 1000`,
                ),
            ).toEqual({
                metrics: {
                    and: [
                        {
                            target: { fieldId: 'orders_total_order_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [1000],
                        },
                    ],
                },
            });
        });

        it('merges WHERE metric filters and HAVING filters', () => {
            const filters = filtersOf(
                `SELECT orders_status, orders_total_order_amount, orders_unique_order_count FROM orders
                 WHERE orders_total_order_amount > 1000
                 GROUP BY orders_status
                 HAVING orders_unique_order_count > 5`,
            ) as Filters;
            const metricGroup = filters.metrics as { and: unknown[] };
            expect(metricGroup.and).toHaveLength(2);
        });

        it('supports OR groups of metric filters', () => {
            expect(
                filtersOf(
                    `SELECT orders_status, orders_total_order_amount FROM orders
                     WHERE orders_total_order_amount > 1000 OR orders_total_order_amount < 10`,
                ),
            ).toEqual({
                metrics: {
                    and: [
                        {
                            or: [
                                {
                                    target: {
                                        fieldId: 'orders_total_order_amount',
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [1000],
                                },
                                {
                                    target: {
                                        fieldId: 'orders_total_order_amount',
                                    },
                                    operator: FilterOperator.LESS_THAN,
                                    values: [10],
                                },
                            ],
                        },
                    ],
                },
            });
        });

        it('rejects OR conditions mixing dimensions and metrics', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_total_order_amount FROM orders
                     WHERE orders_status = 'completed' OR orders_total_order_amount > 1000`,
                ),
            ).toThrow(/cannot mix dimensions, metrics/);
        });

        it('rejects dimension filters in HAVING', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_total_order_amount FROM orders
                     GROUP BY orders_status HAVING orders_status = 'completed'`,
                ),
            ).toThrow(/HAVING can only filter on metrics/);
        });
    });

    describe('table calculations', () => {
        it('compiles arithmetic expressions to table calculations', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount, orders_unique_order_count,
                        orders_total_order_amount / orders_unique_order_count AS aov
                 FROM orders`,
            );
            expect(result.metricQuery.tableCalculations).toEqual([
                {
                    name: 'aov',
                    displayName: 'aov',
                    sql: '(${orders_total_order_amount} / ${orders_unique_order_count})',
                },
            ]);
            expect(result.columns[3]).toEqual({
                name: 'aov',
                source: 'aov',
                kind: 'table_calculation',
                type: null,
            });
        });

        it('compiles function calls in table calculations', () => {
            const result = compile(
                `SELECT orders_status, orders_avg_amount,
                        round(orders_avg_amount, 2) AS rounded
                 FROM orders`,
            );
            expect(result.metricQuery.tableCalculations[0].name).toBe(
                'rounded',
            );
            const calc = result.metricQuery.tableCalculations[0];
            expect('sql' in calc && calc.sql).toContain('${orders_avg_amount}');
        });

        it('compiles CASE expressions', () => {
            const result = compile(
                `SELECT orders_status, orders_amount,
                        CASE WHEN orders_amount > 100 THEN 'big' ELSE 'small' END AS size
                 FROM orders`,
            );
            const calc = result.metricQuery.tableCalculations[0];
            expect('sql' in calc && calc.sql).toMatch(
                /CASE\s+WHEN \(\$\{orders_amount\} > \(100\)\) THEN \('big'\) ELSE \('small'\) END/,
            );
        });

        it('allows window functions and rewrites refs inside OVER', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount,
                        sum(orders_total_order_amount) OVER (PARTITION BY orders_status ORDER BY orders_status) AS running
                 FROM orders`,
            );
            const calc = result.metricQuery.tableCalculations[0];
            const sql = 'sql' in calc ? calc.sql : '';
            expect(sql).toContain('over');
            // refs inside the OVER clause must also be rewritten
            expect(sql).toMatch(/PARTITION BY \$\{orders_status\}/);
            expect(sql).toMatch(/ORDER BY \$\{orders_status\}/);
        });

        it('allows referencing other table calculations', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount,
                        orders_total_order_amount * 2 AS doubled,
                        doubled + 1 AS doubled_plus_one
                 FROM orders`,
            );
            expect(result.metricQuery.tableCalculations).toHaveLength(2);
            const second = result.metricQuery.tableCalculations[1];
            expect('sql' in second && second.sql).toContain('${doubled}');
        });

        it('compiles string concatenation', () => {
            const result = compile(
                `SELECT orders_status, customers_first_name,
                        customers_first_name || ' - ' || orders_status AS label
                 FROM orders`,
            );
            const calc = result.metricQuery.tableCalculations[0];
            expect('sql' in calc && calc.sql).toBe(
                "((${customers_first_name} || (' - ')) || ${orders_status})",
            );
        });

        it('rejects expressions without an alias', () => {
            expect(() =>
                compile('SELECT orders_status, orders_amount * 2 FROM orders'),
            ).toThrow(/must have an alias/);
        });

        it('rejects plain aggregate functions with a helpful hint', () => {
            expect(() =>
                compile(
                    'SELECT orders_status, sum(orders_amount) AS total FROM orders',
                ),
            ).toThrow(/Aggregate function "sum" is not supported/);
            expect(() =>
                compile('SELECT orders_status, count(*) AS n FROM orders'),
            ).toThrow(SqlCompileError);
        });

        it('rejects references to fields not in the SELECT list', () => {
            expect(() =>
                compile(
                    'SELECT orders_status, orders_amount * 2 AS doubled FROM orders',
                ),
            ).toThrow(/not in the SELECT list/);
        });

        it('rejects aliases that conflict with column names', () => {
            expect(() =>
                compile(
                    'SELECT orders_status, orders_amount, orders_amount * 2 AS orders_status FROM orders',
                ),
            ).toThrow(/conflicts with an existing column/);
        });

        it('rejects duplicate aliases', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_amount,
                            orders_amount * 2 AS x, orders_amount * 3 AS x
                     FROM orders`,
                ),
            ).toThrow(/Duplicate alias/);
        });

        it('supports filtering on table calculations', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount,
                        orders_total_order_amount * 2 AS doubled
                 FROM orders WHERE doubled > 100`,
            );
            expect(stripIds(result.metricQuery.filters)).toEqual({
                tableCalculations: {
                    and: [
                        {
                            target: { fieldId: 'doubled' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [100],
                        },
                    ],
                },
            });
        });
    });

    describe('GROUP BY', () => {
        it('accepts GROUP BY listing all selected dimensions', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_order_date, orders_total_order_amount
                     FROM orders GROUP BY orders_status, orders_order_date`,
                ),
            ).not.toThrow();
        });

        it('accepts GROUP BY with ordinals', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_order_date, orders_total_order_amount
                     FROM orders GROUP BY 1, 2`,
                ),
            ).not.toThrow();
        });

        it('accepts queries without GROUP BY (grouping is implicit)', () => {
            const result = compile(
                'SELECT orders_status, orders_total_order_amount FROM orders',
            );
            expect(result.metricQuery.dimensions).toEqual(['orders_status']);
        });

        it('rejects GROUP BY missing a selected dimension', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_order_date, orders_total_order_amount
                     FROM orders GROUP BY orders_status`,
                ),
            ).toThrow(/must appear in GROUP BY: orders_order_date/);
        });

        it('rejects GROUP BY on metrics', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_total_order_amount
                     FROM orders GROUP BY orders_status, orders_total_order_amount`,
                ),
            ).toThrow(/only dimensions can be grouped/);
        });

        it('rejects GROUP BY on columns not selected', () => {
            expect(() =>
                compile(
                    `SELECT orders_status, orders_total_order_amount
                     FROM orders GROUP BY orders_order_date, orders_status`,
                ),
            ).toThrow(/must be in the SELECT list/);
        });

        it('rejects out-of-range GROUP BY ordinals', () => {
            expect(() =>
                compile('SELECT orders_status FROM orders GROUP BY 5'),
            ).toThrow(/position 5/);
        });
    });

    describe('ORDER BY', () => {
        it('compiles ascending and descending sorts', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount FROM orders
                 ORDER BY orders_total_order_amount DESC, orders_status`,
            );
            expect(result.metricQuery.sorts).toEqual([
                { fieldId: 'orders_total_order_amount', descending: true },
                { fieldId: 'orders_status', descending: false },
            ]);
        });

        it('compiles sorts by ordinal', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount FROM orders ORDER BY 2 DESC`,
            );
            expect(result.metricQuery.sorts).toEqual([
                { fieldId: 'orders_total_order_amount', descending: true },
            ]);
        });

        it('compiles sorts by alias', () => {
            const result = compile(
                `SELECT orders_status AS status FROM orders ORDER BY status DESC`,
            );
            expect(result.metricQuery.sorts).toEqual([
                { fieldId: 'orders_status', descending: true },
            ]);
        });

        it('compiles sorts on table calculations', () => {
            const result = compile(
                `SELECT orders_status, orders_total_order_amount,
                        orders_total_order_amount * 2 AS doubled
                 FROM orders ORDER BY doubled DESC`,
            );
            expect(result.metricQuery.sorts).toEqual([
                { fieldId: 'doubled', descending: true },
            ]);
        });

        it('compiles NULLS FIRST / NULLS LAST', () => {
            const result = compile(
                `SELECT orders_status FROM orders
                 ORDER BY orders_status ASC NULLS FIRST`,
            );
            expect(result.metricQuery.sorts).toEqual([
                {
                    fieldId: 'orders_status',
                    descending: false,
                    nullsFirst: true,
                },
            ]);
        });

        it('rejects sorts on columns not in the SELECT list', () => {
            expect(() =>
                compile(
                    'SELECT orders_status FROM orders ORDER BY orders_amount',
                ),
            ).toThrow(/must be in the SELECT list/);
        });

        it('rejects out-of-range ORDER BY ordinals', () => {
            expect(() =>
                compile('SELECT orders_status FROM orders ORDER BY 3'),
            ).toThrow(/position 3/);
        });
    });

    describe('LIMIT and OFFSET', () => {
        it('applies the default limit when none is given', () => {
            expect(
                compile('SELECT orders_status FROM orders').metricQuery.limit,
            ).toBe(PGWIRE_DEFAULT_LIMIT);
        });

        it('compiles LIMIT', () => {
            expect(
                compile('SELECT orders_status FROM orders LIMIT 42').metricQuery
                    .limit,
            ).toBe(42);
        });

        it('allows OFFSET 0', () => {
            expect(
                compile('SELECT orders_status FROM orders LIMIT 10 OFFSET 0')
                    .metricQuery.limit,
            ).toBe(10);
        });

        it('rejects non-zero OFFSET', () => {
            expect(() =>
                compile('SELECT orders_status FROM orders LIMIT 10 OFFSET 5'),
            ).toThrow(/OFFSET is not supported/);
        });
    });

    describe('unsupported statements', () => {
        it.each([
            ['INSERT', 'INSERT INTO orders (a) VALUES (1)'],
            ['UPDATE', 'UPDATE orders SET a = 1'],
            ['DELETE', 'DELETE FROM orders'],
        ])('rejects %s statements', (_, sql) => {
            expect(() => compile(sql)).toThrow(/not supported/);
        });

        it('rejects multiple statements', () => {
            expect(() =>
                compile(
                    'SELECT orders_status FROM orders; SELECT orders_status FROM orders',
                ),
            ).toThrow(/Exactly one SQL statement/);
        });

        it('rejects UNION', () => {
            expect(() =>
                compile(
                    'SELECT orders_status FROM orders UNION SELECT orders_status FROM orders',
                ),
            ).toThrow(/not supported/);
        });

        it('rejects CTEs', () => {
            expect(() =>
                compile(
                    'WITH x AS (SELECT orders_status FROM orders) SELECT * FROM x',
                ),
            ).toThrow(/not supported/);
        });

        it('rejects JOINs with a helpful hint', () => {
            try {
                compile(
                    'SELECT orders_status FROM orders JOIN customers ON true',
                );
                throw new Error('should have thrown');
            } catch (e) {
                expect(e).toBeInstanceOf(SqlCompileError);
                expect((e as SqlCompileError).message).toMatch(
                    /JOINs are not supported/,
                );
                expect((e as SqlCompileError).hint).toMatch(/explore/);
            }
        });

        it('rejects subqueries in FROM', () => {
            expect(() =>
                compile(
                    'SELECT x FROM (SELECT orders_status AS x FROM orders) sub',
                ),
            ).toThrow(/FROM must reference an explore/);
        });

        it('rejects SELECT DISTINCT', () => {
            expect(() =>
                compile('SELECT DISTINCT orders_status FROM orders'),
            ).toThrow(/DISTINCT is not supported/);
        });

        it('rejects queries without FROM', () => {
            expect(() => compile('SELECT orders_status')).toThrow(
                /Missing FROM clause/,
            );
        });

        it('rejects multiple tables in FROM', () => {
            expect(() =>
                compile('SELECT orders_status FROM orders, customers'),
            ).toThrow(/Only one table/);
        });

        it('wraps syntax errors', () => {
            expect(() => compile('SELECT FROM WHERE')).toThrow(
                /SQL syntax error/,
            );
        });
    });

    describe('end-to-end shapes', () => {
        it('compiles a realistic analytics query', () => {
            const result = compile(
                `SELECT
                    orders_status AS status,
                    orders_order_date,
                    orders_total_order_amount,
                    orders_unique_order_count,
                    orders_total_order_amount / orders_unique_order_count AS aov
                 FROM orders
                 WHERE orders_order_date >= '2024-01-01'::date
                   AND orders_status IN ('completed', 'shipped')
                   AND orders_total_order_amount > 100
                 GROUP BY 1, 2
                 HAVING orders_unique_order_count > 2
                 ORDER BY orders_total_order_amount DESC NULLS LAST
                 LIMIT 25`,
            );
            expect(result.metricQuery.exploreName).toBe('orders');
            expect(result.metricQuery.dimensions).toEqual([
                'orders_status',
                'orders_order_date',
            ]);
            expect(result.metricQuery.metrics).toEqual([
                'orders_total_order_amount',
                'orders_unique_order_count',
            ]);
            expect(result.metricQuery.limit).toBe(25);
            expect(result.metricQuery.sorts).toEqual([
                {
                    fieldId: 'orders_total_order_amount',
                    descending: true,
                    nullsFirst: false,
                },
            ]);
            expect(result.metricQuery.tableCalculations).toHaveLength(1);
            expect(stripIds(result.metricQuery.filters)).toEqual({
                dimensions: {
                    and: [
                        {
                            target: { fieldId: 'orders_order_date' },
                            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                            values: ['2024-01-01'],
                        },
                        {
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['completed', 'shipped'],
                        },
                    ],
                },
                metrics: {
                    and: [
                        {
                            target: { fieldId: 'orders_total_order_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [100],
                        },
                        {
                            target: { fieldId: 'orders_unique_order_count' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [2],
                        },
                    ],
                },
            });
            expect(result.columns.map((c) => c.name)).toEqual([
                'status',
                'orders_order_date',
                'orders_total_order_amount',
                'orders_unique_order_count',
                'aov',
            ]);
        });
    });
});
