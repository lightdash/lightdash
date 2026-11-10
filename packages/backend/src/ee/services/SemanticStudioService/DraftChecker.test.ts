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
} = {
    queries: [],
    keyRow: {},
    keyError: null,
    rowCount: null,
    catalog: {},
    columns: { id: DimensionType.NUMBER },
    partitioning: null,
};

const checker = () =>
    new DraftChecker({
        getWarehouseSqlBuilderSettings: async () => ({
            type: WarehouseTypes.POSTGRES,
            startOfWeek: null,
            columnTimezone: 'UTC',
            dataTimezone: null,
        }),
        runSqlQuery: async (_user, _projectUuid, sql) => {
            warehouse.queries.push(sql);
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
        compileQuery: async () => ({ query: '', compilationErrors: [] }),
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
            expect(rejected.get('orders')).toBe(
                'This would change who can see dimensions.id, which cannot be changed here.',
            );
        });

        test('a number metric that aggregates in its own sql is rejected', async () => {
            const { rejected } = await check(new Map(), withMetrics(RATIO));
            expect(rejected.get('orders')).toContain(
                'per_order is a number metric that aggregates in its own sql',
            );
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
            expect(rejected.get('orders')).toBe(
                "id reads a timestamp column, but is typed differently. Use the column's type, or cast in sql to change it.",
            );

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
            expect(rejected.get('orders')).toBe(
                'orders reads amount, which is not a column of its table. Its columns: id, total.',
            );
            expect(warehouse.queries).toEqual([]);
        });

        test('a dimension typed differently from its column is rejected before any query', async () => {
            warehouse.columns = { id: DimensionType.TIMESTAMP };
            const { rejected } = await check(model('orders'));
            expect(rejected.get('orders')).toContain(
                'id reads a timestamp column, but is typed differently.',
            );
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
