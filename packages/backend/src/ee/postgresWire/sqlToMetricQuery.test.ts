import {
    CustomDimensionType,
    FilterOperator,
    SupportedDbtAdapter,
    TimeFrames,
    type Filters,
} from '@lightdash/common';
import {
    compileSqlToMetricQuery,
    PGWIRE_DEFAULT_LIMIT,
    SqlCompileError,
} from './sqlToMetricQuery';
import { type PgWireTable } from './types';

const ORDERS: PgWireTable = {
    name: 'orders',
    description: null,
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    fields: [
        {
            fieldId: 'orders_status',
            table: 'orders',
            name: 'status',
            kind: 'dimension',
            type: 'string',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'orders_order_date',
            table: 'orders',
            name: 'order_date',
            kind: 'dimension',
            type: 'date',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'orders_created_at',
            table: 'orders',
            name: 'created_at',
            kind: 'dimension',
            type: 'timestamp',
            description: null,
            timeInterval: null,
        },
        // time-interval dimensions generated from orders_order_date
        {
            fieldId: 'orders_order_date_day',
            table: 'orders',
            name: 'order_date_day',
            kind: 'dimension',
            type: 'date',
            description: null,
            timeInterval: {
                frame: TimeFrames.DAY,
                baseDimensionName: 'order_date',
            },
        },
        {
            fieldId: 'orders_order_date_year',
            table: 'orders',
            name: 'order_date_year',
            kind: 'dimension',
            type: 'date',
            description: null,
            timeInterval: {
                frame: TimeFrames.YEAR,
                baseDimensionName: 'order_date',
            },
        },
        {
            fieldId: 'orders_order_date_month_num',
            table: 'orders',
            name: 'order_date_month_num',
            kind: 'dimension',
            type: 'number',
            description: null,
            timeInterval: {
                frame: TimeFrames.MONTH_NUM,
                baseDimensionName: 'order_date',
            },
        },
        {
            fieldId: 'orders_is_completed',
            table: 'orders',
            name: 'is_completed',
            kind: 'dimension',
            type: 'boolean',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'orders_amount',
            table: 'orders',
            name: 'amount',
            kind: 'dimension',
            type: 'number',
            description: null,
            timeInterval: null,
        },
        // fields from a joined table in the explore
        {
            fieldId: 'customers_first_name',
            table: 'customers',
            name: 'first_name',
            kind: 'dimension',
            type: 'string',
            description: null,
            timeInterval: null,
        },
        // same column name as orders_amount, different table
        {
            fieldId: 'customers_amount',
            table: 'customers',
            name: 'amount',
            kind: 'dimension',
            type: 'number',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'orders_total_order_amount',
            table: 'orders',
            name: 'total_order_amount',
            kind: 'metric',
            type: 'sum',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'orders_unique_order_count',
            table: 'orders',
            name: 'unique_order_count',
            kind: 'metric',
            type: 'count_distinct',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'orders_avg_amount',
            table: 'orders',
            name: 'avg_amount',
            kind: 'metric',
            type: 'average',
            description: null,
            timeInterval: null,
        },
    ],
};

const CUSTOMERS: PgWireTable = {
    name: 'customers',
    description: null,
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    fields: [
        {
            fieldId: 'customers_customer_id',
            table: 'customers',
            name: 'customer_id',
            kind: 'dimension',
            type: 'number',
            description: null,
            timeInterval: null,
        },
        {
            fieldId: 'customers_days_since_last_order',
            table: 'customers',
            name: 'days_since_last_order',
            kind: 'metric',
            type: 'min',
            description: null,
            timeInterval: null,
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
                'orders_created_at',
                'orders_order_date_day',
                'orders_order_date_year',
                'orders_order_date_month_num',
                'orders_is_completed',
                'orders_amount',
                'customers_first_name',
                'customers_amount',
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

        it('carries the first dimension when only table calculations are selected', () => {
            const compiled = compile('SELECT 1 + 1 AS two FROM orders');
            expect(compiled.metricQuery.dimensions).toEqual(['orders_status']);
            expect(compiled.columns.map((c) => c.name)).toEqual(['two']);
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

        it('names unaliased expressions like Postgres', () => {
            const compiled = compileSqlToMetricQuery(
                'SELECT 1, true, orders_amount, orders_amount + 1 AS amount_plus FROM orders',
                CATALOG,
            );
            expect(compiled.columns.map((c) => c.name)).toEqual([
                '?column?',
                '?column?_2',
                'orders_amount',
                'amount_plus',
            ]);
            // constants-only probes carry the first dimension without exposing it
            const probe = compileSqlToMetricQuery(
                'SELECT 1 FROM orders LIMIT 1',
                CATALOG,
            );
            expect(probe.columns.map((c) => c.name)).toEqual(['?column?']);
            expect(probe.metricQuery.dimensions).toEqual(['orders_status']);
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

describe('aggregate passthrough', () => {
    it('treats SUM over a metric column as the metric at the query grain', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT orders_status, SUM(orders_total_order_amount) AS orders_total_order_amount FROM orders GROUP BY orders_status ORDER BY orders_total_order_amount DESC',
            CATALOG,
        );
        expect(compiled.metricQuery.dimensions).toEqual(['orders_status']);
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_total_order_amount',
        ]);
        expect(compiled.metricQuery.tableCalculations).toEqual([]);
        expect(compiled.columns.map((c) => c.name)).toEqual([
            'orders_status',
            'orders_total_order_amount',
        ]);
        expect(compiled.metricQuery.sorts).toEqual([
            { fieldId: 'orders_total_order_amount', descending: true },
        ]);
    });

    it('passes min/max/avg through and keeps distinct aggregates rejected', () => {
        expect(
            compileSqlToMetricQuery(
                'SELECT max(orders_total_order_amount) AS m FROM orders',
                CATALOG,
            ).metricQuery.metrics,
        ).toEqual(['orders_total_order_amount']);
        expect(() =>
            compileSqlToMetricQuery(
                'SELECT sum(distinct orders_total_order_amount) AS s FROM orders',
                CATALOG,
            ),
        ).toThrow(/not supported/);
    });
});

describe('dimension aggregates', () => {
    it('compiles the Looker Studio date-range probe', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT MIN(DATE(orders_order_date)) AS min_date, MAX(DATE(orders_order_date)) AS max_date FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.dimensions).toEqual([]);
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_order_date_pgwire_min',
            'orders_order_date_pgwire_max',
        ]);
        expect(compiled.metricQuery.additionalMetrics).toEqual([
            {
                name: 'order_date_pgwire_min',
                table: 'orders',
                sql: '${orders.order_date}',
                type: 'min',
                baseDimensionName: 'order_date',
            },
            {
                name: 'order_date_pgwire_max',
                table: 'orders',
                sql: '${orders.order_date}',
                type: 'max',
                baseDimensionName: 'order_date',
            },
        ]);
        expect(compiled.columns).toEqual([
            {
                name: 'min_date',
                source: 'orders_order_date_pgwire_min',
                kind: 'metric',
                type: 'date',
            },
            {
                name: 'max_date',
                source: 'orders_order_date_pgwire_max',
                kind: 'metric',
                type: 'date',
            },
        ]);
    });

    it('compiles SUM over a numeric dimension', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT SUM(orders_amount) AS amount FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_amount_pgwire_sum',
        ]);
        expect(compiled.metricQuery.additionalMetrics).toEqual([
            {
                name: 'amount_pgwire_sum',
                table: 'orders',
                sql: '${orders.amount}',
                type: 'sum',
                baseDimensionName: 'amount',
            },
        ]);
        expect(compiled.columns[0]).toEqual({
            name: 'amount',
            source: 'orders_amount_pgwire_sum',
            kind: 'metric',
            type: 'sum',
        });
    });

    it('compiles grouped dimension aggregates and sorts by their alias', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT orders_status, SUM(orders_amount) AS amount FROM orders GROUP BY orders_status ORDER BY amount DESC',
            CATALOG,
        );
        expect(compiled.metricQuery.dimensions).toEqual(['orders_status']);
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_amount_pgwire_sum',
        ]);
        expect(compiled.metricQuery.sorts).toEqual([
            { fieldId: 'orders_amount_pgwire_sum', descending: true },
        ]);
    });

    it('maps avg/count/count distinct/median to metric types', () => {
        const compiled = compileSqlToMetricQuery(
            `SELECT avg(orders_amount) AS a, count(orders_status) AS c,
                    count(distinct orders_status) AS cd, median(orders_amount) AS md
             FROM orders`,
            CATALOG,
        );
        expect(
            compiled.metricQuery.additionalMetrics?.map((m) => m.type),
        ).toEqual(['average', 'count', 'count_distinct', 'median']);
        expect(compiled.columns.map((c) => c.type)).toEqual([
            'average',
            'count',
            'count_distinct',
            'median',
        ]);
    });

    it('casts MIN(DATE(timestamp_dimension)) to a date', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT MIN(DATE(orders_created_at)) AS first_day FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.additionalMetrics).toEqual([
            {
                name: 'created_at_pgwire_min_date',
                table: 'orders',
                sql: 'CAST(${orders.created_at} AS DATE)',
                type: 'min',
            },
        ]);
        expect(compiled.columns[0].type).toBe('date');
    });

    it('unwraps ::date and CAST(... AS date) for min/max', () => {
        for (const sql of [
            'SELECT MAX(orders_created_at::date) AS d FROM orders',
            'SELECT MAX(CAST(orders_created_at AS date)) AS d FROM orders',
        ]) {
            const compiled = compileSqlToMetricQuery(sql, CATALOG);
            expect(compiled.metricQuery.additionalMetrics?.[0].sql).toBe(
                'CAST(${orders.created_at} AS DATE)',
            );
            expect(compiled.columns[0].type).toBe('date');
        }
    });

    it('keeps count(*) working alongside dimension aggregates', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT MIN(orders_order_date) AS m, COUNT(*) AS c FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_order_date_pgwire_min',
            'orders_pgwire_row_count',
        ]);
        expect(compiled.metricQuery.additionalMetrics).toHaveLength(2);
    });

    it('keeps same-named dimensions from different tables distinct', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT sum(orders_amount) AS a, sum(customers_amount) AS b FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_amount_pgwire_sum',
            'customers_amount_pgwire_sum',
        ]);
        expect(compiled.metricQuery.additionalMetrics).toHaveLength(2);
        expect(
            compiled.metricQuery.additionalMetrics?.map((m) => m.table),
        ).toEqual(['orders', 'customers']);
    });

    it('reuses one additional metric for repeated aggregates', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT MIN(DATE(orders_order_date)) AS a, MIN(orders_order_date) AS b FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.additionalMetrics).toHaveLength(1);
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_order_date_pgwire_min',
        ]);
        expect(compiled.columns.map((c) => c.name)).toEqual(['a', 'b']);
    });

    it('aggregates dimensions from joined explore tables', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT max(customers_first_name) AS m FROM orders',
            CATALOG,
        );
        expect(compiled.metricQuery.additionalMetrics).toEqual([
            {
                name: 'first_name_pgwire_max',
                table: 'customers',
                sql: '${customers.first_name}',
                type: 'max',
                baseDimensionName: 'first_name',
            },
        ]);
        expect(compiled.columns[0].type).toBe('string');
    });

    it('allows an alias matching the dimension name', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT orders_amount, sum(orders_amount) AS orders_amount FROM orders GROUP BY orders_amount',
            CATALOG,
        );
        expect(compiled.columns.map((c) => c.name)).toEqual([
            'orders_amount',
            'orders_amount',
        ]);
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_amount_pgwire_sum',
        ]);
    });

    it('names unaliased dimension aggregates like Postgres', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT min(orders_order_date) FROM orders',
            CATALOG,
        );
        expect(compiled.columns[0].name).toBe('min');
    });

    it('rejects aggregates that make no sense for the dimension type', () => {
        expect(() =>
            compileSqlToMetricQuery(
                'SELECT sum(orders_status) FROM orders',
                CATALOG,
            ),
        ).toThrow(/"sum" is not supported for string dimension/);
        expect(() =>
            compileSqlToMetricQuery(
                'SELECT avg(orders_order_date) FROM orders',
                CATALOG,
            ),
        ).toThrow(/"avg" is not supported for date dimension/);
        expect(() =>
            compileSqlToMetricQuery(
                'SELECT sum(orders_is_completed) FROM orders',
                CATALOG,
            ),
        ).toThrow(/"sum" is not supported for boolean dimension/);
    });
});

describe('row counts', () => {
    it('compiles count(*) to a system COUNT metric', () => {
        const compiled = compileSqlToMetricQuery(
            'SELECT count(*) FROM orders',
            CATALOG,
        );
        expect(compiled.columns).toEqual([
            {
                name: 'count',
                source: 'orders_pgwire_row_count',
                kind: 'metric',
                type: 'count',
            },
        ]);
        expect(compiled.metricQuery.metrics).toEqual([
            'orders_pgwire_row_count',
        ]);
        expect(compiled.metricQuery.additionalMetrics).toEqual([
            {
                name: 'pgwire_row_count',
                table: 'orders',
                sql: '*',
                type: 'count',
            },
        ]);
        expect(compiled.metricQuery.dimensions).toEqual([]);
    });

    it('supports count(1), aliases, filters and grouped counts', () => {
        expect(
            compileSqlToMetricQuery(
                "SELECT count(1) AS n FROM orders WHERE orders_status = 'completed'",
                CATALOG,
            ).columns[0],
        ).toMatchObject({ name: 'n', kind: 'metric' });
        const grouped = compileSqlToMetricQuery(
            'SELECT orders_status, count(*) FROM orders GROUP BY orders_status',
            CATALOG,
        );
        expect(grouped.metricQuery.dimensions).toEqual(['orders_status']);
        expect(grouped.metricQuery.metrics).toEqual([
            'orders_pgwire_row_count',
        ]);
    });
});

describe('schema probes', () => {
    it('folds a trivial subquery wrapper into the inner query', () => {
        const wrapped = compileSqlToMetricQuery(
            "SELECT * FROM (SELECT orders_status, orders_total_order_amount FROM orders WHERE orders_status = 'completed' LIMIT 10) AS t WHERE 1 = 0",
            CATALOG,
        );
        expect(wrapped.alwaysEmpty).toBe(true);
        expect(wrapped.columns.map((c) => c.name)).toEqual([
            'orders_status',
            'orders_total_order_amount',
        ]);
        expect(wrapped.metricQuery.filters.dimensions).toBeDefined();

        const limited = compileSqlToMetricQuery(
            'SELECT * FROM (SELECT orders_status FROM orders LIMIT 100) AS t LIMIT 5',
            CATALOG,
        );
        expect(limited.alwaysEmpty).toBe(false);
        expect(limited.metricQuery.limit).toBe(5);

        // a wrapper that does real work is still rejected
        expect(() =>
            compileSqlToMetricQuery(
                "SELECT * FROM (SELECT orders_status FROM orders) t WHERE orders_status = 'completed'",
                CATALOG,
            ),
        ).toThrow(/FROM must reference an explore/);
    });

    it('marks WHERE 1=0 and LIMIT 0 as always empty without dropping the shape', () => {
        const probe = compileSqlToMetricQuery(
            'SELECT orders_status FROM orders WHERE 1 = 0',
            CATALOG,
        );
        expect(probe.alwaysEmpty).toBe(true);
        expect(probe.columns.map((c) => c.name)).toEqual(['orders_status']);
        expect(probe.metricQuery.filters).toEqual({});

        expect(
            compileSqlToMetricQuery(
                'SELECT orders_status FROM orders LIMIT 0',
                CATALOG,
            ).alwaysEmpty,
        ).toBe(true);
        expect(
            compileSqlToMetricQuery(
                'SELECT orders_status FROM orders WHERE 1 != 1',
                CATALOG,
            ).alwaysEmpty,
        ).toBe(true);
        expect(
            compileSqlToMetricQuery(
                "SELECT orders_status FROM orders WHERE 1 = 0 AND orders_status = 'completed'",
                CATALOG,
            ).alwaysEmpty,
        ).toBe(true);
    });

    it('keeps real filters non-empty and still folds tautologies', () => {
        const query = compileSqlToMetricQuery(
            "SELECT orders_status FROM orders WHERE 1 = 1 AND orders_status = 'completed'",
            CATALOG,
        );
        expect(query.alwaysEmpty).toBe(false);
        expect(query.metricQuery.filters.dimensions).toBeDefined();
    });
});

describe('date parts', () => {
    const YEAR_NUM_ID = 'orders_order_date_pgwire_year_num';

    it('compiles the Looker Studio year column to a synthesised YEAR_NUM dimension', () => {
        const result = compile(
            `SELECT "T1"."orders_order_date_day",
                    CAST(EXTRACT(YEAR FROM "T1"."orders_order_date"::TIMESTAMP) AS INT) AS "Year"
             FROM orders "T1"
             WHERE "T1"."orders_order_date" IS NOT NULL
             ORDER BY CAST(EXTRACT(YEAR FROM "T1"."orders_order_date"::TIMESTAMP) AS INT)
             LIMIT 2`,
        );
        expect(result.metricQuery).toMatchObject({
            dimensions: ['orders_order_date_day', YEAR_NUM_ID],
            metrics: [],
            tableCalculations: [],
            customDimensions: [
                {
                    id: YEAR_NUM_ID,
                    name: 'order_date_pgwire_year_num',
                    table: 'orders',
                    type: CustomDimensionType.SQL,
                    sql: "DATE_PART('YEAR', ${orders.order_date})",
                    dimensionType: 'number',
                },
            ],
            sorts: [{ fieldId: YEAR_NUM_ID, descending: false }],
            limit: 2,
        });
        expect(result.columns[1]).toEqual({
            name: 'Year',
            source: YEAR_NUM_ID,
            kind: 'dimension',
            type: 'number',
        });
    });

    it('uses the explore warehouse dialect for the synthesised SQL', () => {
        const bigquery = compileSqlToMetricQuery(
            'SELECT EXTRACT(YEAR FROM orders_order_date) AS y FROM orders',
            [{ ...ORDERS, targetDatabase: SupportedDbtAdapter.BIGQUERY }],
        );
        expect(bigquery.metricQuery.customDimensions?.[0]).toMatchObject({
            sql: 'EXTRACT(YEAR FROM ${orders.order_date})',
        });
    });

    it('selects the existing interval dimension when the explore has one', () => {
        const result = compile(
            `SELECT EXTRACT(MONTH FROM orders_order_date) AS m,
                    DATE_TRUNC('year', orders_order_date) AS y
             FROM orders ORDER BY m`,
        );
        expect(result.metricQuery.dimensions).toEqual([
            'orders_order_date_month_num',
            'orders_order_date_year',
        ]);
        expect(result.metricQuery.customDimensions).toBeUndefined();
        expect(result.metricQuery.sorts).toEqual([
            { fieldId: 'orders_order_date_month_num', descending: false },
        ]);
        expect(result.columns.map((c) => c.name)).toEqual(['m', 'y']);
    });

    it('resolves sibling intervals when the part is taken from an interval dimension', () => {
        const result = compile(
            'SELECT EXTRACT(MONTH FROM orders_order_date_day) AS m FROM orders',
        );
        expect(result.metricQuery.dimensions).toEqual([
            'orders_order_date_month_num',
        ]);
    });

    it('synthesises truncating frames and date_part parts the explore lacks', () => {
        const result = compile(
            `SELECT DATE_TRUNC('quarter', orders_order_date)::DATE AS q,
                    date_part('doy', orders_order_date) AS d
             FROM orders`,
        );
        expect(result.metricQuery.customDimensions).toEqual([
            {
                id: 'orders_order_date_pgwire_quarter',
                name: 'order_date_pgwire_quarter',
                table: 'orders',
                type: CustomDimensionType.SQL,
                sql: "DATE_TRUNC('QUARTER', ${orders.order_date})",
                dimensionType: 'date',
            },
            {
                id: 'orders_order_date_pgwire_day_of_year_num',
                name: 'order_date_pgwire_day_of_year_num',
                table: 'orders',
                type: CustomDimensionType.SQL,
                sql: "DATE_PART('DOY', ${orders.order_date})",
                dimensionType: 'number',
            },
        ]);
        expect(result.columns.map((c) => c.type)).toEqual(['date', 'number']);
    });

    it('truncates timestamps to sub-day frames', () => {
        const result = compile(
            `SELECT DATE_TRUNC('second', orders_created_at) AS s,
                    DATE_TRUNC('milliseconds', orders_created_at) AS ms
             FROM orders`,
        );
        expect(result.metricQuery.dimensions).toEqual([
            'orders_created_at_pgwire_second',
            'orders_created_at_pgwire_millisecond',
        ]);
        expect(result.columns.map((c) => c.type)).toEqual([
            'timestamp',
            'timestamp',
        ]);
    });

    it('extracts time parts from timestamp dimensions', () => {
        const result = compile(
            'SELECT EXTRACT(HOUR FROM orders_created_at) AS h FROM orders',
        );
        expect(result.metricQuery.customDimensions?.[0]).toMatchObject({
            id: 'orders_created_at_pgwire_hour_of_day_num',
            sql: "DATE_PART('HOUR', ${orders.created_at})",
        });
    });

    it('selects the same date part once when repeated', () => {
        const result = compile(
            `SELECT EXTRACT(YEAR FROM orders_order_date) AS a,
                    EXTRACT(YEAR FROM orders_order_date) AS b
             FROM orders`,
        );
        expect(result.metricQuery.dimensions).toEqual([YEAR_NUM_ID]);
        expect(result.metricQuery.customDimensions).toHaveLength(1);
        expect(result.columns.map((c) => c.source)).toEqual([
            YEAR_NUM_ID,
            YEAR_NUM_ID,
        ]);
    });

    it('accepts GROUP BY on the date part expression', () => {
        const result = compile(
            `SELECT EXTRACT(YEAR FROM orders_order_date) AS y, orders_total_order_amount
             FROM orders GROUP BY EXTRACT(YEAR FROM orders_order_date)`,
        );
        expect(result.metricQuery.dimensions).toEqual([YEAR_NUM_ID]);
    });

    it('names unaliased date parts like Postgres', () => {
        const result = compile(
            "SELECT EXTRACT(YEAR FROM orders_order_date), DATE_TRUNC('month', orders_order_date) FROM orders",
        );
        expect(result.columns.map((c) => c.name)).toEqual([
            'extract',
            'date_trunc',
        ]);
    });

    it('rejects ORDER BY expressions that are not in the SELECT list', () => {
        expect(() =>
            compile(
                'SELECT orders_status FROM orders ORDER BY EXTRACT(YEAR FROM orders_order_date)',
            ),
        ).toThrow(/ORDER BY expression must appear in the SELECT list/);
    });

    it('rejects day-of-week parts explicitly', () => {
        expect(() =>
            compile('SELECT EXTRACT(DOW FROM orders_order_date) FROM orders'),
        ).toThrow(/EXTRACT\(DOW\) is not supported/);
        expect(() =>
            compile(
                'SELECT EXTRACT(ISODOW FROM orders_order_date) FROM orders',
            ),
        ).toThrow(/EXTRACT\(ISODOW\) is not supported/);
    });

    it('rejects time parts of date dimensions', () => {
        expect(() =>
            compile('SELECT EXTRACT(HOUR FROM orders_order_date) FROM orders'),
        ).toThrow(/has no time component/);
    });

    it('rejects date parts of non-date columns', () => {
        expect(() =>
            compile('SELECT EXTRACT(YEAR FROM orders_status) FROM orders'),
        ).toThrow(/is not a date or timestamp dimension/);
    });

    it('leaves parts without a time frame on the table calculation path', () => {
        expect(() =>
            compile('SELECT EXTRACT(EPOCH FROM orders_order_date) FROM orders'),
        ).toThrow(/not in the SELECT list/);
        const result = compile(
            'SELECT orders_order_date, EXTRACT(EPOCH FROM orders_order_date) AS e FROM orders',
        );
        expect(result.metricQuery.tableCalculations).toHaveLength(1);
    });
});
