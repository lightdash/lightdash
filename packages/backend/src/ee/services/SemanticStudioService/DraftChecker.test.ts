import {
    DimensionType,
    isExploreError,
    WarehouseTypes,
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
const warehouse: { queries: string[]; keyRow: Record<string, number> } = {
    queries: [],
    keyRow: {},
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
            return {
                fields: columnTypes.fields,
                rows: sql.includes('duplicate_keys') ? [warehouse.keyRow] : [],
            };
        },
        compileQuery: async () => ({ query: '', compilationErrors: [] }),
    });

describe('DraftChecker.compile', () => {
    beforeEach(() => {
        compiles.count = 0;
        columnTypes.fields = {};
        warehouse.queries = [];
        warehouse.keyRow = {};
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

        test('are not repeated when the same draft is checked again', async () => {
            const drafts = checker();
            await drafts.check(user, 'project', new Map(), proposed());
            await drafts.check(user, 'project', new Map(), proposed());
            expect(keyChecks()).toHaveLength(2);
        });
    });
});
