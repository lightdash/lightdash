import {
    DimensionType,
    isExploreError,
    PartitionType,
    WarehouseTableType,
    WarehouseTypes,
    type TablePartitioning,
    type WarehouseTablesCatalog,
} from '@lightdash/common';
import { user } from '../../../services/ProjectService/ProjectService.mock';
import { DraftChecker, usesAnyModel } from './DraftChecker';

const compiles = vi.hoisted(() => ({ count: 0 }));

vi.mock('@lightdash/common', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lightdash/common')>();
    return {
        ...actual,
        compileLightdashModels: (
            args: Parameters<typeof actual.compileLightdashModels>[0],
        ) => {
            compiles.count += 1;
            return actual.compileLightdashModels(args);
        },
    };
});

const model = (name: string) => `type: model
name: ${name}
sql_from: public.${name}
dimensions:
  - name: id
    type: number
    sql: \${TABLE}.id
`;

/** The types the warehouse reports for the columns a check selects, by alias. */
const columnTypes: { fields: Record<string, { type: DimensionType }> } = {
    fields: {},
};

/** What the query builder reports for every query it compiles. */
const queryBuilder: { errors: string[] } = { errors: [] };

/** What the warehouse was asked, and what a key check comes back with. */
const warehouse: {
    queries: string[];
    keyRow: Record<string, number>;
    /** Set to make every key check fail, as a budget or a timeout would. */
    keyError: string | null;
    /** What the warehouse's metadata says a table holds; null when it has no answer. */
    rowCount: number | null;
    catalog: WarehouseTablesCatalog;
    /** What the catalog says every table it knows holds. */
    columns: Record<string, DimensionType>;
    partitioning: TablePartitioning | null;
    /** Why the warehouse refuses to plan a query, or null when it plans it. */
    planError: (sql: string) => string | null;
} = {
    queries: [],
    keyRow: {},
    keyError: null,
    rowCount: null,
    catalog: {},
    columns: { id: DimensionType.NUMBER },
    partitioning: null,
    planError: () => null,
};

const checker = (type: WarehouseTypes = WarehouseTypes.POSTGRES) =>
    new DraftChecker({
        getWarehouseSqlBuilderSettings: async () => ({
            type,
            startOfWeek: null,
            columnTimezone: 'UTC',
            dataTimezone: null,
        }),
        runSqlQuery: async (_user, _projectUuid, sql) => {
            warehouse.queries.push(sql);
            const planError = warehouse.planError(sql);
            if (planError) throw new Error(planError);
            if (sql.includes('row_count')) {
                return {
                    fields: {},
                    rows: warehouse.rowCount
                        ? [{ row_count: warehouse.rowCount }]
                        : [],
                };
            }
            if (warehouse.keyError && sql.includes('duplicate_keys')) {
                throw new Error(warehouse.keyError);
            }
            return {
                fields: columnTypes.fields,
                rows: sql.includes('duplicate_keys') ? [warehouse.keyRow] : [],
            };
        },
        getWarehouseTables: async () => warehouse.catalog,
        describeWarehouseTable: async () => ({
            fields: warehouse.columns,
            nativeTypes: {},
            partitioning: warehouse.partitioning,
            warehouseType: WarehouseTypes.POSTGRES,
        }),
        compileQuery: async () => ({
            query: '',
            compilationErrors: queryBuilder.errors,
        }),
    });

describe('DraftChecker.compile', () => {
    beforeEach(() => {
        compiles.count = 0;
        columnTypes.fields = {};
        warehouse.queries = [];
        warehouse.keyRow = {};
        warehouse.keyError = null;
        warehouse.rowCount = null;
        warehouse.catalog = {};
        warehouse.columns = { id: DimensionType.NUMBER };
        warehouse.partitioning = null;
        warehouse.planError = () => null;
        queryBuilder.errors = [];
    });

    test('the same documents compile once, and each caller gets its own copy', async () => {
        const drafts = checker();
        const documents = new Map([['orders', model('orders')]]);
        const first = await drafts.compile('project', documents);
        first.explores.length = 0;
        const second = await drafts.compile('project', new Map(documents));
        expect(second.explores.map(({ name }) => name)).toEqual(['orders']);
        expect(compiles.count).toBe(1);
    });

    test("a model's pre-aggregates stay on its explore", async () => {
        const document = `${model('orders')}metrics:
  order_count:
    type: count
    sql: \${TABLE}.id
pre_aggregates:
  - name: by_id
    dimensions:
      - id
    metrics:
      - order_count
`;
        const { explores } = await checker().compile(
            'project',
            new Map([['orders', document]]),
        );
        const [orders] = explores;
        expect(
            'preAggregates' in orders
                ? orders.preAggregates?.map(({ name }) => name)
                : orders,
        ).toEqual(['by_id']);
    });

    test('changed documents compile again, and a failed compile is not kept', async () => {
        const drafts = checker();
        await drafts.compile('project', new Map([['orders', model('orders')]]));
        await drafts.compile('project', new Map([['orders', model('items')]]));
        expect(compiles.count).toBe(2);

        const broken = new Map([['orders', 'not: [a model']]);
        await expect(drafts.compile('project', broken)).rejects.toThrow();
        await expect(drafts.compile('project', broken)).rejects.toThrow();
    });

    test('checking a draft that passes compiles it once', async () => {
        const check = await checker().check(
            user,
            'project',
            new Map(),
            new Map([['orders', model('orders')]]),
        );
        expect(check.rejected.size).toBe(0);
        expect(check.explores?.map(({ name }) => name)).toEqual(['orders']);
        expect(compiles.count).toBe(1);
    });

    test('a change that breaks a model joining it is rejected for that model', async () => {
        warehouse.planError = (sql) =>
            sql.includes('LEFT JOIN') && sql.includes('public.moved')
                ? 'cannot join moved'
                : null;
        const joined = `${model('orders')}joins:
  - join: customers
    relationship: many-to-one
    sql_on: \${orders.id} = \${customers.id}
`;
        const { rejected } = await checker().check(
            user,
            'project',
            new Map([
                ['orders', joined],
                ['customers', model('customers')],
            ]),
            new Map([
                [
                    'customers',
                    model('customers').replace(
                        'public.customers',
                        'public.moved',
                    ),
                ],
            ]),
        );
        expect(rejected.get('customers')).toEqual({
            kind: 'breaks_joining_model',
            models: ['orders'],
            detail: 'cannot join moved',
        });
    });

    test('an explore uses a model it joins under an alias', async () => {
        const joined = `${model('orders')}joins:
  - join: customers
    alias: buyer
    sql_on: \${orders.id} = \${buyer.id}
`;
        const { explores } = await checker().compile(
            'project',
            new Map([
                ['orders', joined],
                ['customers', model('customers')],
            ]),
        );
        const orders = explores.find(({ name }) => name === 'orders');
        if (!orders || isExploreError(orders)) throw new Error('not compiled');
        expect(usesAnyModel(orders, new Map([['customers', null]]))).toBe(true);
        expect(usesAnyModel(orders, new Map([['payments', null]]))).toBe(false);
    });

    describe('rules for new work', () => {
        const withMetrics = (metrics: string) =>
            `${model('orders')}metrics:\n${metrics}`;
        const RATIO = `  per_order:
    type: number
    sql: SUM(\${TABLE}.id) / COUNT(\${TABLE}.id)
`;
        const check = (live: Map<string, string>, contents: string) =>
            checker().check(
                user,
                'project',
                live,
                new Map([['orders', contents]]),
            );

        test('a rewrite that drops who can see a field is rejected', async () => {
            const guarded = `${model('orders')}    required_attributes:\n      team: hr\n`;
            const { rejected } = await check(
                new Map([['orders', guarded]]),
                model('orders'),
            );
            expect(rejected.get('orders')).toEqual({
                kind: 'access_change',
                fields: ['dimensions.id'],
                detail: null,
            });
        });

        test('a number metric that aggregates in its own sql is rejected', async () => {
            const { rejected } = await check(new Map(), withMetrics(RATIO));
            expect(rejected.get('orders')).toEqual({
                kind: 'query_builder',
                detail: expect.stringContaining(
                    'per_order is a number metric that aggregates in its own sql',
                ),
            });
        });

        test('a number metric that combines other metrics passes', async () => {
            const { rejected } = await check(
                new Map(),
                withMetrics(`  total:
    type: sum
    sql: \${TABLE}.id
  per_order:
    type: number
    sql: \${total} / 2
`),
            );
            expect(rejected.size).toBe(0);
        });

        test('what is already live is not held to the new rules', async () => {
            const live = withMetrics(RATIO);
            const { rejected } = await check(
                new Map([['orders', live]]),
                `${live}  total:
    type: sum
    sql: \${TABLE}.id
`,
            );
            expect(rejected.size).toBe(0);
        });

        test('a dimension typed differently from its column is rejected, unless it casts', async () => {
            columnTypes.fields = { C0: { type: DimensionType.TIMESTAMP } };
            const { rejected } = await check(new Map(), model('orders'));
            expect(rejected.get('orders')).toEqual({
                kind: 'query_builder',
                detail: "id reads a timestamp column, but is typed differently. Use the column's type, or cast in sql to change it.",
            });

            const cast = model('orders').replace(
                '${TABLE}.id',
                'CAST(${TABLE}.id AS INT)',
            );
            expect((await check(new Map(), cast)).rejected.size).toBe(0);
        });
    });

    describe('key checks', () => {
        const joined = `${model('orders')}joins:
  - join: customers
    sql_on: \${orders.id} = \${customers.id}
`;
        const proposed = () =>
            new Map([
                ['orders', joined],
                ['customers', model('customers')],
            ]);
        const keyChecks = () =>
            warehouse.queries.filter((sql) => sql.includes('duplicate_keys'));

        test('read a capped number of rows', async () => {
            await checker().check(user, 'project', new Map(), proposed());
            expect(keyChecks()).toHaveLength(2);
            keyChecks().forEach((sql) =>
                expect(sql).toContain('LIMIT 1000000'),
            );
        });

        test('say so when a table is larger than what was read', async () => {
            warehouse.keyRow = { duplicate_keys: 0, CHECKED_ROWS: 1_000_000 };
            const { rejected, notes, writes } = await checker().check(
                user,
                'project',
                new Map(),
                proposed(),
            );
            expect(rejected.size).toBe(0);
            expect(writes.get('orders')).toContain('relationship: one-to-one');
            expect(notes.get('orders')).toEqual([
                'The join to customers was measured on the first 1,000,000 rows only, so its one-to-one relationship is an estimate. Confirm it before applying.',
            ]);
        });

        test('have nothing to add when the whole table was read', async () => {
            warehouse.keyRow = { duplicate_keys: 0, checked_rows: 200 };
            const { notes } = await checker().check(
                user,
                'project',
                new Map(),
                proposed(),
            );
            expect(notes.size).toBe(0);
        });

        test('leave the model in with a note when the warehouse refuses them', async () => {
            warehouse.keyError = 'Query exceeded limit for bytes billed';
            const { rejected, notes, writes } = await checker().check(
                user,
                'project',
                new Map(),
                proposed(),
            );
            expect(rejected.size).toBe(0);
            expect(writes.get('orders')).not.toContain('relationship:');
            expect(notes.get('orders')).toEqual([
                'The join to customers was not measured on the warehouse, so its relationship is not set. Set it yourself before applying. The warehouse said: Query exceeded limit for bytes billed',
            ]);
        });

        test('are skipped for a table the warehouse says is over the cap', async () => {
            const table = { tableType: WarehouseTableType.TABLE };
            warehouse.catalog = {
                shop: { public: { orders: table, customers: table } },
            };
            warehouse.rowCount = 5_000_000;
            const { rejected, notes, writes } = await checker().check(
                user,
                'project',
                new Map(),
                proposed(),
            );
            expect(rejected.size).toBe(0);
            expect(keyChecks()).toHaveLength(0);
            expect(writes.get('orders')).not.toContain('relationship:');
            expect(notes.get('orders')?.[0]).toContain(
                'has about 5,000,000 rows, more than a check reads.',
            );
        });

        test('set many-to-one without reading a large model whose joined table is unique', async () => {
            const table = { tableType: WarehouseTableType.TABLE };
            // Only orders is in the catalog, so only orders is known to be large.
            warehouse.catalog = { shop: { public: { orders: table } } };
            warehouse.rowCount = 5_000_000;
            const { notes, writes } = await checker().check(
                user,
                'project',
                new Map(),
                proposed(),
            );
            expect(keyChecks()).toHaveLength(1);
            expect(writes.get('orders')).toContain('relationship: many-to-one');
            expect(notes.get('orders')?.[0]).toContain(
                "is set as many-to-one because customers is unique on its key; this model's side was not read.",
            );
        });

        test('still read a table the catalog does not know', async () => {
            warehouse.rowCount = 5_000_000;
            await checker().check(user, 'project', new Map(), proposed());
            expect(keyChecks()).toHaveLength(2);
        });

        test('are not repeated when the same draft is checked again', async () => {
            const drafts = checker();
            await drafts.check(user, 'project', new Map(), proposed());
            await drafts.check(user, 'project', new Map(), proposed());
            expect(keyChecks()).toHaveLength(2);
        });
    });

    describe('a model that already fails on the warehouse', () => {
        // A date dimension over a text column: the warehouse refuses to truncate it.
        const broken = `${model('orders')}  - name: born
    type: date
    sql: \${TABLE}.born
`;
        const withMetric = (sql: string) =>
            `${broken}metrics:\n  total:\n    type: sum\n    sql: ${sql}\n`;
        const check = (
            live: string | null,
            contents: string,
            truncateError = 'cannot truncate text',
        ) => {
            warehouse.planError = (sql) => {
                if (/date_trunc/i.test(sql)) return truncateError;
                return sql.includes('NO_SUCH_FN') ? 'no such function' : null;
            };
            return checker().check(
                user,
                'project',
                new Map(live === null ? [] : [['orders', live]]),
                new Map([['orders', contents]]),
            );
        };
        const inCatalog = () => {
            warehouse.catalog = {
                shop: {
                    public: { orders: { tableType: WarehouseTableType.TABLE } },
                },
            };
            warehouse.columns = {
                id: DimensionType.NUMBER,
                born: DimensionType.STRING,
            };
        };

        test('a change that leaves the failing field alone joins the draft, with a note about it', async () => {
            const { rejected, notes } = await check(
                broken,
                withMetric('${TABLE}.id'),
            );
            expect(rejected.size).toBe(0);
            expect(notes.get('orders')?.[0]).toBe(
                'orders already had a problem before this change, which leaves it as it was. The warehouse rejected this model: cannot truncate text',
            );
        });

        test('the note names the field when the catalog shows its column is typed differently and the warehouse points at it', async () => {
            inCatalog();
            const { rejected, notes } = await check(
                broken,
                withMetric('${TABLE}.id'),
                'cannot truncate text column born',
            );
            expect(rejected.size).toBe(0);
            expect(notes.get('orders')?.[0]).toBe(
                'orders already had a problem before this change, which leaves it as it was. born reads a string column but is typed date.',
            );
        });

        test('the note keeps the warehouse error when it does not point at the mistyped field', async () => {
            inCatalog();
            const { notes } = await check(broken, withMetric('${TABLE}.id'));
            expect(notes.get('orders')?.[0]).toBe(
                'orders already had a problem before this change, which leaves it as it was. The warehouse rejected this model: cannot truncate text',
            );
        });

        test('a change to the table plans every field, so one it breaks is rejected', async () => {
            warehouse.planError = (sql) => {
                if (sql.includes('orders_v2') && sql.includes('.id')) {
                    return 'orders_v2 has no id';
                }
                return /date_trunc/i.test(sql) ? 'cannot truncate text' : null;
            };
            const { rejected } = await checker().check(
                user,
                'project',
                new Map([['orders', broken]]),
                new Map([
                    [
                        'orders',
                        broken.replace('public.orders', 'public.orders_v2'),
                    ],
                ]),
            );
            expect(rejected.get('orders')).toEqual({
                kind: 'warehouse_refused',
                detail: 'orders_v2 has no id',
            });
        });

        test('a change to a join plans the fields that read the joined model', async () => {
            const customers = `${model('customers')}  - name: name
    type: string
    sql: \${TABLE}.name
`;
            const joined = (on: string) => `${broken}  - name: buyer
    type: string
    sql: \${customers.name}
joins:
  - join: customers
    sql_on: ${on}
`;
            warehouse.planError = (sql) => {
                if (sql.includes('JOIN_FN') && sql.includes('.name')) {
                    return 'the join cannot read name';
                }
                return /date_trunc/i.test(sql) ? 'cannot truncate text' : null;
            };
            const { rejected } = await checker().check(
                user,
                'project',
                new Map([
                    ['orders', joined('${orders.id} = ${customers.id}')],
                    ['customers', customers],
                ]),
                new Map([
                    [
                        'orders',
                        joined('${orders.id} = JOIN_FN(${customers.id})'),
                    ],
                ]),
            );
            expect(rejected.get('orders')).toEqual({
                kind: 'warehouse_refused',
                detail: 'the join cannot read name',
            });
        });

        test('a change to a dimension type alone is checked, though its sql is the same', async () => {
            columnTypes.fields = {
                c0: { type: DimensionType.STRING },
                c1: { type: DimensionType.STRING },
            };
            warehouse.planError = (sql) =>
                sql.includes('NO_SUCH_FN') ? 'no such function' : null;
            const labelled = (
                type: string,
            ) => `${model('orders')}  - name: label
    type: ${type}
    sql: \${TABLE}.label
metrics:
  total:
    type: sum
    sql: NO_SUCH_FN(\${TABLE}.id)
`;
            const { rejected } = await checker().check(
                user,
                'project',
                new Map([['orders', labelled('string')]]),
                new Map([['orders', labelled('number')]]),
            );
            expect(rejected.get('orders')).toEqual({
                kind: 'query_builder',
                detail: "label reads a string column, but is typed differently. Use the column's type, or cast in sql to change it.",
            });
        });

        test('a join that already fails does not block a change that does not read it', async () => {
            const joined = (metrics: string) => `${model('orders')}joins:
  - join: customers
    sql_on: \${orders.id} = BAD_JOIN(\${customers.id})
${metrics}`;
            warehouse.planError = (sql) =>
                sql.includes('BAD_JOIN')
                    ? 'column missing does not exist'
                    : null;
            const { rejected, notes } = await checker().check(
                user,
                'project',
                new Map([
                    ['orders', joined('')],
                    ['customers', model('customers')],
                ]),
                new Map([
                    [
                        'orders',
                        joined(
                            'metrics:\n  total:\n    type: count\n    sql: ${TABLE}.id\n',
                        ),
                    ],
                ]),
            );
            expect(rejected.size).toBe(0);
            expect(notes.get('orders')?.[0]).toBe(
                'orders already had a problem before this change, which leaves it as it was. The warehouse rejected this model: column missing does not exist',
            );
        });

        test('a change that adds its own failure behind the old one is still rejected', async () => {
            const { rejected } = await check(
                broken,
                withMetric('NO_SUCH_FN(${TABLE}.id)'),
            );
            expect(rejected.get('orders')).toEqual({
                kind: 'warehouse_refused',
                detail: 'no such function',
            });
        });

        test.each(Object.values(WarehouseTypes))(
            'on %s, only a change that touches the failing field is rejected',
            async (type) => {
                // Whatever the dialect writes around it, any SQL that reads the column fails.
                warehouse.planError = (sql) =>
                    /\bborn\b/.test(sql) ? 'cannot read born' : null;
                const run = (sql: string) =>
                    checker(type).check(
                        user,
                        'project',
                        new Map([['orders', broken]]),
                        new Map([['orders', withMetric(sql)]]),
                    );
                const untouched = await run('${TABLE}.id');
                expect(untouched.rejected.size).toBe(0);
                expect(untouched.notes.get('orders')?.[0]).toContain(
                    'already had a problem before this change',
                );
                expect(
                    (await run('${TABLE}.born')).rejected.get('orders'),
                ).toEqual({
                    kind: 'already_failing',
                    detail: 'cannot read born',
                });
            },
        );

        test('a change that brings the failure is rejected for it', async () => {
            const { rejected } = await check(model('orders'), broken);
            expect(rejected.get('orders')).toEqual({
                kind: 'warehouse_refused',
                detail: 'cannot truncate text',
            });
            expect((await check(null, broken)).rejected.size).toBe(1);
        });
    });

    describe('an edit that only changes metadata', () => {
        const withCount = `${model('orders')}metrics:
  order_count:
    type: count
    sql: \${TABLE}.id
`;

        beforeEach(() => {
            warehouse.planError = (sql) =>
                sql.includes('public.orders') ? 'cannot plan orders' : null;
        });

        test.each([
            ['a description', `${model('orders')}description: Every order\n`],
            [
                'an AI hint',
                model('orders').replace(
                    '    sql: ${TABLE}.id\n',
                    '    sql: ${TABLE}.id\n    ai_hint: The order number\n',
                ),
            ],
            [
                'a format',
                model('orders').replace(
                    '    sql: ${TABLE}.id\n',
                    "    sql: ${TABLE}.id\n    format: '#,##0'\n",
                ),
            ],
        ])(
            'to %s is kept without asking the warehouse',
            async (_edit, contents) => {
                const { rejected, writes } = await checker().check(
                    user,
                    'project',
                    new Map([['orders', model('orders')]]),
                    new Map([['orders', contents]]),
                );
                expect(rejected.size).toBe(0);
                expect(writes.get('orders')).toBe(contents);
                expect(warehouse.queries).toEqual([]);
            },
        );

        test('is still refused when the compiler refuses it, with no warehouse query', async () => {
            const { rejected } = await checker().check(
                user,
                'project',
                new Map([['orders', model('orders')]]),
                new Map([
                    [
                        'orders',
                        model('orders').replace(
                            '    sql: ${TABLE}.id\n',
                            "    sql: ${TABLE}.id\n    format: '${lightdash.parameters.missing}'\n",
                        ),
                    ],
                ]),
            );
            expect(rejected.get('orders')).toContain('missing');
            expect(warehouse.queries).toEqual([]);
        });

        test('is still refused when it does not work in a query, with no warehouse query', async () => {
            queryBuilder.errors = ['cannot group by id'];
            const { rejected } = await checker().check(
                user,
                'project',
                new Map([['orders', withCount]]),
                new Map([['orders', `${withCount}description: Every order\n`]]),
            );
            expect(rejected.get('orders')).toContain('cannot group by id');
            expect(warehouse.queries).toEqual([]);
        });

        test('still plans a model that joins one the draft redefines', async () => {
            const joined = `${model('customers')}joins:
  - join: orders
    relationship: many-to-one
    sql_on: \${customers.id} = \${orders.id}
`;
            const { rejected } = await checker().check(
                user,
                'project',
                new Map([
                    ['customers', joined],
                    [
                        'orders',
                        model('orders').replace('public.orders', 'public.old'),
                    ],
                ]),
                new Map([
                    ['customers', `${joined}description: Every customer\n`],
                    ['orders', model('orders')],
                ]),
            );
            expect(rejected.get('customers')).toContain('cannot plan orders');
        });
    });

    describe('with the table in the catalog', () => {
        const table = { tableType: WarehouseTableType.TABLE };
        const check = (contents: string) => {
            warehouse.catalog = { shop: { public: { orders: table } } };
            return checker().check(
                user,
                'project',
                new Map(),
                new Map([['orders', contents]]),
            );
        };

        test('a column that is not there is named, with the ones that are, before any query', async () => {
            warehouse.columns = {
                id: DimensionType.NUMBER,
                total: DimensionType.NUMBER,
            };
            const { rejected } = await check(
                model('orders').replace('${TABLE}.id', '${TABLE}.amount'),
            );
            expect(rejected.get('orders')).toEqual({
                kind: 'query_builder',
                detail: 'orders reads amount, which is not a column of its table. Its columns: id, total.',
            });
            expect(warehouse.queries).toEqual([]);
        });

        test('a dimension typed differently from its column is rejected before any query', async () => {
            warehouse.columns = { id: DimensionType.TIMESTAMP };
            const { rejected } = await check(model('orders'));
            expect(rejected.get('orders')).toEqual({
                kind: 'query_builder',
                detail: expect.stringContaining(
                    'id reads a timestamp column, but is typed differently.',
                ),
            });
            expect(warehouse.queries).toEqual([]);
        });

        test('a table that requires a partition filter gets one in the dry run and is not read for its keys', async () => {
            warehouse.partitioning = {
                partitionColumn: {
                    field: 'created_on',
                    partitionType: PartitionType.DATE,
                },
                granularity: null,
                requiresPartitionFilter: true,
            };
            const { rejected, notes } = await check(
                `${model('orders')}primary_key: id\n`,
            );
            expect(rejected.size).toBe(0);
            expect(warehouse.queries[0]).toContain(
                'WHERE 1 = 0 AND no_rows."created_on" IS NOT NULL',
            );
            expect(
                warehouse.queries.filter((sql) =>
                    sql.includes('duplicate_keys'),
                ),
            ).toEqual([]);
            expect(notes.get('orders')?.[0]).toContain(
                'orders requires a partition filter, so it is not read for a check.',
            );
        });
    });
});
