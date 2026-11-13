import {
    JoinRelationship,
    type CompiledExploreJoin,
    type CompiledTable,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    cardinalityOf,
    formatJoinKeys,
    isFanOut,
    layoutJoinGraph,
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
                modelName: null,
                isBase: true,
                isHidden: false,
                keys: null,
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
                modelName: null,
                isBase: false,
                isHidden: false,
                keys: 'orders.customer_id = customers.customer_id',
                joinType: 'left',
            },
            {
                id: 'payments',
                label: 'Payments',
                modelName: null,
                isBase: false,
                isHidden: true,
                keys: 'payments.order_id = orders.id',
                joinType: null,
            },
        ]);
        expect(graph.links).toEqual([
            {
                id: 'orders->customers',
                source: 'orders',
                target: 'customers',
                relationship: JoinRelationship.MANY_TO_ONE,
            },
            {
                id: 'orders->payments',
                source: 'orders',
                target: 'payments',
                relationship: JoinRelationship.ONE_TO_MANY,
            },
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

describe('formatJoinKeys', () => {
    it('drops template braces and collapses whitespace', () => {
        expect(
            formatJoinKeys('${a.x} = ${b.y}\n   AND ${ a.z } = ${b.z}'),
        ).toBe('a.x = b.y AND a.z = b.z');
    });
});

describe('relationships', () => {
    it('flags joins that fan out', () => {
        expect(isFanOut(JoinRelationship.ONE_TO_MANY)).toBe(true);
        expect(isFanOut(JoinRelationship.MANY_TO_MANY)).toBe(true);
        expect(isFanOut(JoinRelationship.MANY_TO_ONE)).toBe(false);
        expect(isFanOut(null)).toBe(false);
    });

    it('gives each side its cardinality', () => {
        expect(cardinalityOf(JoinRelationship.MANY_TO_ONE)).toEqual(['N', '1']);
        expect(cardinalityOf(null)).toBeNull();
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
