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

const checker = () =>
    new DraftChecker({
        getWarehouseSqlBuilderSettings: async () => ({
            type: WarehouseTypes.POSTGRES,
            startOfWeek: null,
            columnTimezone: 'UTC',
            dataTimezone: null,
        }),
        runSqlQuery: async () => ({ fields: columnTypes.fields, rows: [] }),
        compileQuery: async () => ({ query: '', compilationErrors: [] }),
    });

describe('DraftChecker.compile', () => {
    beforeEach(() => {
        compiles.count = 0;
        columnTypes.fields = {};
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
});
