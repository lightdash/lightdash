import { isExploreError, WarehouseTypes } from '@lightdash/common';
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

const checker = () =>
    new DraftChecker({
        getWarehouseSqlBuilderSettings: async () => ({
            type: WarehouseTypes.POSTGRES,
            startOfWeek: null,
            columnTimezone: 'UTC',
            dataTimezone: null,
        }),
        runSqlQuery: vi.fn(),
        compileQuery: vi.fn(),
    });

describe('DraftChecker.compile', () => {
    beforeEach(() => {
        compiles.count = 0;
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
});
