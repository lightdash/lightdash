import { type Explore } from '@lightdash/common';
import {
    rewriteAllocatedExplore,
    rewriteAllocatedSql,
} from './allocatedExploreReferences';

const names = new Map([['orders', 'finance__orders']]);

test('rewrites SQL aliases and templates without changing strings, comments or physical tables', () => {
    const sql = `orders.id + "orders"."amount" + \`orders\`.amount + [orders].amount + \${orders.amount} + 'orders.id' /* orders.id */ -- orders.id
+ $$orders.id$$ + $literal$orders.id$literal$ + "orders_id"`;
    expect(rewriteAllocatedSql(sql, names))
        .toBe(`finance__orders.id + "finance__orders"."amount" + \`finance__orders\`.amount + [finance__orders].amount + \${finance__orders.amount} + 'orders.id' /* orders.id */ -- orders.id
+ $$orders.id$$ + $literal$orders.id$literal$ + "orders_id"`);
});

test('rewrites nested tables, join aliases, filters, lineage and pre-aggregate fields', () => {
    const root = '__model_001abc';
    const nested = `${root}__items`;
    const source = {
        name: root,
        baseTable: root,
        label: 'Orders',
        tags: [],
        targetDatabase: 'postgres',
        joinedTables: [
            {
                table: 'buyer',
                sqlOn: `\${${root}.id} = \${buyer.id}`,
                compiledSqlOn: `"${root}"."id" = "buyer"."id"`,
                tablesReferences: [root, 'buyer'],
            },
            {
                table: nested,
                compiledSqlOn: `"${nested}"."id" = "${root}"."id"`,
            },
        ],
        tables: {
            [root]: {
                name: root,
                originalName: 'orders',
                sqlTable: '"public"."orders"',
                requiredFilters: [
                    { target: { fieldId: `${root}_id`, tableName: root } },
                ],
                dimensions: {
                    id: {
                        name: 'id',
                        table: root,
                        sql: '${TABLE}.id',
                        compiledSql: `"${root}"."id"`,
                        tablesReferences: [root],
                    },
                },
                metrics: {},
                lineageGraph: { [root]: [{ type: 'model', name: root }] },
            },
            buyer: {
                name: 'buyer',
                canonicalName: root,
                dimensions: {},
                metrics: {},
                sqlTable: '"public"."buyers"',
                lineageGraph: {},
            },
            [nested]: {
                name: nested,
                sqlTable: `UNNEST(\`${root}\`.items) AS \`${nested}\` WITH OFFSET AS \`${nested}__offset\``,
                nestedFrom: {
                    parentTable: root,
                    elementSql: `"${nested}".value`,
                    columnPath: 'items',
                },
                dimensions: {},
                metrics: {},
                lineageGraph: {},
            },
        },
        unfilteredTables: {
            [root]: {
                name: root,
                dimensions: {},
                metrics: {},
                lineageGraph: {},
            },
        },
        preAggregates: [
            {
                dimensions: [`${root}_id`],
                metrics: [`${root}_count`],
                sourceExploreName: root,
            },
        ],
        warnings: [
            { type: 'MISSING_TABLE', message: `Model "${root}" failed` },
        ],
    } as unknown as Explore;
    const result = rewriteAllocatedExplore(
        source,
        new Map([[root, 'finance__orders']]),
    );
    expect(result.baseTable).toBe('finance__orders');
    expect(Object.keys(result.tables)).toEqual([
        'finance__orders',
        'buyer',
        'finance__orders__items',
    ]);
    expect(result.tables.buyer.name).toBe('buyer');
    expect(result.tables.buyer.canonicalName).toBe('finance__orders');
    expect(result.tables.finance__orders.sqlTable).toBe('"public"."orders"');
    expect(result.tables.finance__orders.dimensions.id.compiledSql).toBe(
        '"finance__orders"."id"',
    );
    expect(result.joinedTables[0].compiledSqlOn).toBe(
        '"finance__orders"."id" = "buyer"."id"',
    );
    expect(result.tables.finance__orders.lineageGraph).toEqual({
        finance__orders: [{ type: 'model', name: 'finance__orders' }],
    });
    expect(JSON.stringify(result)).not.toContain('__model_');
    expect(source.baseTable).toBe(root);
});

test('uses a simultaneous rename when one name is the prefix of another', () => {
    expect(
        rewriteAllocatedSql(
            'orders.id + finance__orders.id + orders_extra.id',
            new Map([
                ['orders', 'finance__orders'],
                ['finance__orders', 'archived__orders'],
            ]),
        ),
    ).toBe('finance__orders.id + archived__orders.id + orders_extra.id');
});

test('keeps dollar-quoted literals intact when they contain different dollar tags', () => {
    const sql = '$a$contains $b$ orders.id $b$ still literal$a$ + orders.id';
    expect(rewriteAllocatedSql(sql, names)).toBe(
        '$a$contains $b$ orders.id $b$ still literal$a$ + finance__orders.id',
    );
});

test('uses the longest parent name for nested table keys and SQL aliases', () => {
    const nested = 'orders__history__items';
    const source = {
        name: 'orders',
        baseTable: 'orders',
        tables: {
            [nested]: {
                name: nested,
                dimensions: {
                    id: {
                        table: nested,
                        compiledSql: `"${nested}"."id"`,
                    },
                },
                metrics: {},
                lineageGraph: {},
            },
        },
    } as unknown as Explore;
    const result = rewriteAllocatedExplore(
        source,
        new Map([
            ['orders', 'first__orders'],
            ['orders__history', 'second__orders__history'],
        ]),
    );
    expect(Object.keys(result.tables)).toEqual([
        'second__orders__history__items',
    ]);
    expect(
        result.tables.second__orders__history__items.dimensions.id.compiledSql,
    ).toBe('"second__orders__history__items"."id"');
    expect(
        result.tables.second__orders__history__items.dimensions.id.table,
    ).toBe('second__orders__history__items');
});
