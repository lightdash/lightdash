import {
    JoinRelationship,
    type CompiledExploreJoin,
    type CompiledTable,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    formatJoinKeys,
    layoutJoinGraph,
    pathToBase,
    toJoinGraph,
} from './joinGraph';

const table = (name: string, extra: Partial<CompiledTable> = {}) =>
    ({
        name,
        label: name.replace(/^./, (c) => c.toUpperCase()),
        ...extra,
    }) as CompiledTable;

const join = (
    tableName: string,
    sqlOn: string,
    extra: Partial<CompiledExploreJoin> = {},
): CompiledExploreJoin => ({
    table: tableName,
    sqlOn,
    compiledSqlOn: sqlOn,
    ...extra,
});

const explore = (
    baseTable: string,
    joinedTables: CompiledExploreJoin[],
    tables: CompiledTable[],
): Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'> => ({
    baseTable,
    joinedTables,
    tables: Object.fromEntries(tables.map((t) => [t.name, t])),
});

describe('toJoinGraph', () => {
    it('shows only the base table for an explore without joins', () => {
        const graph = toJoinGraph(explore('orders', [], [table('orders')]));
        expect(graph.links).toEqual([]);
        expect(graph.tables).toEqual([
            {
                id: 'orders',
                label: 'Orders',
                description: null,
                modelName: null,
                isBase: true,
                isHidden: false,
                parent: null,
                relationship: null,
                keys: null,
                keyColumns: [],
                joinType: null,
            },
        ]);
    });

    it('maps each join to a table with its keys, type and relationship', () => {
        const graph = toJoinGraph(
            explore(
                'orders',
                [
                    join(
                        'customers',
                        '${orders.customer_id} = ${customers.customer_id}',
                        {
                            type: 'left',
                            relationship: JoinRelationship.MANY_TO_ONE,
                            tablesReferences: ['orders', 'customers'],
                        },
                    ),
                    join('payments', '${payments.order_id} = ${orders.id}', {
                        relationship: JoinRelationship.ONE_TO_MANY,
                        hidden: true,
                    }),
                ],
                [table('orders'), table('customers'), table('payments')],
            ),
        );
        expect(graph.tables.slice(1)).toEqual([
            {
                id: 'customers',
                label: 'Customers',
                description: null,
                modelName: null,
                isBase: false,
                isHidden: false,
                parent: 'orders',
                relationship: JoinRelationship.MANY_TO_ONE,
                keys: 'orders.customer_id = customers.customer_id',
                keyColumns: ['customer_id'],
                joinType: 'left',
            },
            {
                id: 'payments',
                label: 'Payments',
                description: null,
                modelName: null,
                isBase: false,
                isHidden: true,
                parent: 'orders',
                relationship: JoinRelationship.ONE_TO_MANY,
                keys: 'payments.order_id = orders.id',
                keyColumns: ['order_id'],
                joinType: null,
            },
        ]);
        expect(graph.links).toEqual([
            { id: 'orders->customers', source: 'orders', target: 'customers' },
            { id: 'orders->payments', source: 'orders', target: 'payments' },
        ]);
    });

    it('links a join to the joined table its condition references', () => {
        const graph = toJoinGraph(
            explore(
                'orders',
                [
                    join(
                        'customers',
                        '${orders.customer_id} = ${customers.customer_id}',
                    ),
                    join(
                        'regions',
                        '${customers.region_id} = ${regions.region_id}',
                    ),
                ],
                [table('orders'), table('customers'), table('regions')],
            ),
        );
        expect(
            graph.links.map(({ source, target }) => [source, target]),
        ).toEqual([
            ['orders', 'customers'],
            ['customers', 'regions'],
        ]);
    });

    it('falls back to the base table when the condition names no known table', () => {
        const graph = toJoinGraph(
            explore(
                'orders',
                [join('fx', 'fx.currency = orders_currency')],
                [table('orders'), table('fx')],
            ),
        );
        expect(graph.links[0]).toMatchObject({
            source: 'orders',
            target: 'fx',
        });
    });

    it('names the model behind an aliased join', () => {
        const graph = toJoinGraph(
            explore(
                'orders',
                [
                    join(
                        'shipping_address',
                        '${orders.shipping_address_id} = ${shipping_address.id}',
                    ),
                ],
                [
                    table('orders'),
                    table('shipping_address', {
                        label: 'Shipping address',
                        originalName: 'addresses',
                    }),
                ],
            ),
        );
        expect(graph.tables[1]).toMatchObject({
            id: 'shipping_address',
            label: 'Shipping address',
            modelName: 'addresses',
        });
    });
});

describe('table descriptions', () => {
    it('keeps written descriptions and drops ones that only name the table', () => {
        const graph = toJoinGraph(
            explore(
                'orders',
                [join('customers', '${orders.c} = ${customers.c}')],
                [
                    table('orders', { description: 'orders table' }),
                    table('customers', {
                        description: 'One row per customer',
                    }),
                ],
            ),
        );
        expect(graph.tables.map(({ description }) => description)).toEqual([
            null,
            'One row per customer',
        ]);
    });
});

describe('pathToBase', () => {
    it('walks from a chained join back to the base table', () => {
        const { tables } = toJoinGraph(
            explore(
                'orders',
                [
                    join('customers', '${orders.c} = ${customers.c}'),
                    join('regions', '${customers.r} = ${regions.r}'),
                    join('payments', '${orders.id} = ${payments.order_id}'),
                ],
                [
                    table('orders'),
                    table('customers'),
                    table('regions'),
                    table('payments'),
                ],
            ),
        );
        expect([...pathToBase(tables, 'regions')]).toEqual([
            'regions',
            'customers',
            'orders',
        ]);
        expect([...pathToBase(tables, 'orders')]).toEqual(['orders']);
    });
});

describe('formatJoinKeys', () => {
    it('drops template braces and collapses whitespace', () => {
        expect(
            formatJoinKeys('${a.x} = ${b.y}\n   AND ${ a.z } = ${b.z}'),
        ).toBe('a.x = b.y AND a.z = b.z');
    });
});

describe('layoutJoinGraph', () => {
    it('places joined tables to the right of the base table', () => {
        const graph = toJoinGraph(
            explore(
                'orders',
                [
                    join('customers', '${orders.c} = ${customers.c}'),
                    join('payments', '${orders.id} = ${payments.order_id}'),
                ],
                [table('orders'), table('customers'), table('payments')],
            ),
        );
        const positions = layoutJoinGraph(graph);
        const base = positions.get('orders')!;
        expect(positions.get('customers')!.x).toBeGreaterThan(base.x);
        expect(positions.get('payments')!.x).toBeGreaterThan(base.x);
        expect(positions.get('customers')!.y).not.toBe(
            positions.get('payments')!.y,
        );
    });
});
