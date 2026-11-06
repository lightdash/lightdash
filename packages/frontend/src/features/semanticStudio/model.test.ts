import { describe, expect, it } from 'vitest';
import {
    buildProjectTree,
    findNode,
    pageNodes,
    refExists,
    resolveRef,
    searchProject,
    summaryOf,
    trailTo,
    type Explore,
    type Project,
    type Source,
} from './model';

const source = (overrides: Partial<Source> & Pick<Source, 'id' | 'kind'>) =>
    ({
        type: 'dbt',
        name: overrides.id,
        origin: '',
        onWarehouse: overrides.kind === 'modelled',
        status: null,
        settingsPath: null,
        ...overrides,
    }) satisfies Source;

const explore = (
    id: string,
    sourceId: string,
    overrides: Partial<Explore> = {},
): Explore => ({
    id,
    name: id,
    label: id,
    sourceId,
    groupPath: [],
    description: '',
    warnings: [],
    ...overrides,
});

const warehouse = source({ id: 'warehouse', kind: 'modelled', name: 'Shop' });
const virtualViews = source({
    id: 'virtual-views',
    kind: 'sqlViews',
    type: 'sqlView',
});
const posthog = source({ id: 'posthog', kind: 'live', type: 'live' });
const stripe = source({ id: 'stripe', kind: 'live', type: 'live' });

const project = (sources: Source[], explores: Explore[]): Project => ({
    id: 'project',
    name: 'Shop',
    warehouse: { type: 'postgres', label: 'PostgreSQL' },
    sources,
    explores,
});

describe('summaryOf', () => {
    it.each([
        ['', ''],
        ['Plain one', 'Plain one'],
        ['First line\nsame paragraph', 'First line same paragraph'],
        ['First paragraph\n\nSecond', 'First paragraph'],
        ['# Orders\n\nAll **orders** placed.', 'All orders placed.'],
        ['Title\n===\n\nBody text', 'Body text'],
        [
            "# First name\n---\nCustomer's first name. PII.\n---\nSupports URLs",
            "Customer's first name. PII.",
        ],
        ['Intro line\n\n| a | b |\n|---|---|', 'Intro line'],
        ['Only heading\n---', 'Only heading'],
        [
            'Use `amount_usd`, see [docs](https://x.y)',
            'Use amount_usd, see docs',
        ],
        ['---\n\n***', ''],
    ])('summarises %j as %j', (markdown, expected) => {
        expect(summaryOf(markdown)).toBe(expected);
    });

    it('returns the same summary on repeat calls (cached)', () => {
        const markdown = '# T\n\nCached body';
        expect(summaryOf(markdown)).toBe('Cached body');
        expect(summaryOf(markdown)).toBe('Cached body');
    });
});

describe('buildProjectTree', () => {
    it('opens a warehouse-only project straight on its explores', () => {
        const tree = buildProjectTree(
            project(
                [warehouse],
                [explore('orders', 'warehouse'), explore('items', 'warehouse')],
            ),
        );
        expect(tree.nodes.map(({ label }) => label)).toEqual([
            'items',
            'orders',
        ]);
        expect(tree.rootSource?.id).toBe('warehouse');
    });

    it('groups explores by their group path, folders first then by label', () => {
        const tree = buildProjectTree(
            project(
                [warehouse, virtualViews],
                [
                    explore('zeta', 'warehouse'),
                    explore('payments', 'warehouse', {
                        groupPath: ['finance', 'billing'],
                    }),
                    explore('alpha', 'warehouse'),
                    explore('big_orders', 'virtual-views'),
                ],
            ),
        );
        expect(tree.nodes.map(({ label }) => label)).toEqual([
            'Warehouse',
            'Virtual views',
        ]);
        const pg = tree.nodes[0].children[0];
        expect(pg.label).toBe('PostgreSQL');
        expect(pg.children.map(({ label }) => label)).toEqual([
            'finance',
            'alpha',
            'zeta',
        ]);
        const billing = findNode(tree.nodes, 'group:warehouse:finance/billing');
        expect(billing?.path).toEqual([
            'Warehouse',
            'PostgreSQL',
            'finance',
            'billing',
        ]);
        expect(billing?.children[0].label).toBe('payments');
        // A one-source kind other than Warehouse shows its explores directly.
        expect(tree.nodes[1].children.map(({ label }) => label)).toEqual([
            'big_orders',
        ]);
    });

    it('keeps a group named a/b apart from group a and its child b', () => {
        const tree = buildProjectTree(
            project(
                [warehouse],
                [
                    explore('one', 'warehouse', { groupPath: ['a/b'] }),
                    explore('two', 'warehouse', { groupPath: ['a', 'b'] }),
                ],
            ),
        );
        expect(tree.nodes.map(({ label }) => label)).toEqual(['a', 'a/b']);
        expect(
            findNode(tree.nodes, 'group:warehouse:a%2Fb')?.children,
        ).toHaveLength(1);
    });

    it('folds a source with one explore into the explore', () => {
        const tree = buildProjectTree(
            project(
                [warehouse, posthog, stripe],
                [
                    explore('orders', 'warehouse'),
                    explore('posthog_events', 'posthog'),
                    explore('stripe_charges', 'stripe'),
                    explore('stripe_refunds', 'stripe'),
                ],
            ),
        );
        const live = tree.nodes[1];
        expect(live.label).toBe('Live data sources');
        expect(live.children.map(({ ref }) => ref.type)).toEqual([
            'explore',
            'source',
        ]);
        expect(live.exploreCount).toBe(3);
    });

    it('folds a warehouse with one explore into that explore', () => {
        const tree = buildProjectTree(
            project([warehouse], [explore('orders', 'warehouse')]),
        );
        expect(tree.nodes.map(({ ref }) => ref.type)).toEqual(['explore']);
    });

    it('leaves out sources without explores', () => {
        const tree = buildProjectTree(
            project([warehouse, posthog], [explore('orders', 'warehouse')]),
        );
        expect(findNode(tree.nodes, 'source:posthog')).toBeUndefined();
    });

    it('has no nodes for an empty project', () => {
        expect(buildProjectTree(project([], [])).nodes).toEqual([]);
    });
});

describe('refs', () => {
    const shop = project(
        [warehouse, posthog],
        [
            explore('orders', 'warehouse'),
            explore('items', 'warehouse'),
            explore('posthog_events', 'posthog'),
        ],
    );
    const tree = buildProjectTree(shop);

    it('knows which links still point somewhere', () => {
        expect(refExists(shop, null)).toBe(true);
        expect(refExists(shop, { type: 'kind', kind: 'live' })).toBe(true);
        expect(refExists(shop, { type: 'kind', kind: 'files' })).toBe(false);
        expect(refExists(shop, { type: 'source', sourceId: 'gone' })).toBe(
            false,
        );
        expect(
            refExists(shop, {
                type: 'field',
                exploreId: 'orders',
                fieldId: 'orders_x',
            }),
        ).toBe(true);
        expect(refExists(shop, { type: 'explore', exploreId: 'gone' })).toBe(
            false,
        );
    });

    it('sends a folded source to its only explore', () => {
        expect(
            resolveRef(shop, tree.nodes, {
                type: 'source',
                sourceId: 'posthog',
            }),
        ).toEqual({ type: 'explore', exploreId: 'posthog_events' });
        expect(
            resolveRef(shop, tree.nodes, {
                type: 'source',
                sourceId: 'warehouse',
            }),
        ).toEqual({ type: 'source', sourceId: 'warehouse' });
    });

    it('builds the breadcrumb trail', () => {
        expect(
            trailTo(tree.nodes, 'explore:orders').map(({ label }) => label),
        ).toEqual(['Warehouse', 'PostgreSQL', 'orders']);
    });
});

describe('searchProject', () => {
    const shop = project(
        [warehouse, posthog],
        [
            explore('orders', 'warehouse', {
                label: 'Orders',
                groupPath: ['sales'],
            }),
            explore('order_items', 'warehouse', { label: 'Order items' }),
            explore('posthog_events', 'posthog', { label: 'Events' }),
        ],
    );
    const tree = buildProjectTree(shop);

    it('finds nothing for blank text', () => {
        expect(searchProject(tree, '   ', [])).toEqual({
            results: [],
            total: 0,
        });
    });

    it('groups matches: folders, explores, then fields', () => {
        const { results } = searchProject(tree, 'sales', [
            {
                name: 'sales_total',
                label: 'Sales total',
                tableName: 'orders',
                fieldType: 'metric',
            },
        ]);
        expect(results.map(({ group, label }) => `${group}:${label}`)).toEqual([
            'Folders:sales',
            'Fields:Sales total',
        ]);
        expect(results[1].ref).toEqual({
            type: 'field',
            exploreId: 'orders',
            fieldId: 'orders_sales_total',
        });
        expect(results[1].path).toEqual([
            'Warehouse',
            'PostgreSQL',
            'sales',
            'Orders',
        ]);
    });

    it('matches explores by name as well as label, case-insensitively', () => {
        const { results } = searchProject(tree, 'POSTHOG_ev', []);
        expect(results.map(({ label }) => label)).toEqual(['Events']);
    });

    it('drops fields whose table is not an explore here', () => {
        const { results } = searchProject(tree, 'x', [
            {
                name: 'x',
                label: 'x',
                tableName: 'not_an_explore',
                fieldType: 'dimension',
            },
        ]);
        expect(results).toEqual([]);
    });

    it('caps the results but reports the total', () => {
        const { results, total } = searchProject(tree, 'order', [], 1);
        expect(results).toHaveLength(1);
        expect(total).toBe(2);
    });
});

describe('pageNodes', () => {
    const labels = (nodes: { label: string }[]) => nodes.map((n) => n.label);

    it('lists a source the tree folded into its kind', () => {
        const shop = project(
            [warehouse, posthog],
            [
                explore('orders', 'warehouse'),
                explore('events', 'posthog'),
                explore('persons', 'posthog'),
            ],
        );
        const tree = buildProjectTree(shop);
        const ref = { type: 'source', sourceId: 'posthog' } as const;
        expect(findNode(tree.nodes, 'source:posthog')).toBeUndefined();
        expect(labels(pageNodes(shop, tree, ref))).toEqual([
            'events',
            'persons',
        ]);
    });

    it('lists a kind and source folded into the root', () => {
        const shop = project(
            [posthog],
            [explore('events', 'posthog'), explore('persons', 'posthog')],
        );
        const tree = buildProjectTree(shop);
        const all = ['events', 'persons'];
        expect(
            labels(pageNodes(shop, tree, { type: 'kind', kind: 'live' })),
        ).toEqual(all);
        expect(
            labels(
                pageNodes(shop, tree, { type: 'source', sourceId: 'posthog' }),
            ),
        ).toEqual(all);
    });

    it('lists nothing for a source without explores', () => {
        const shop = project(
            [warehouse, posthog, stripe],
            [explore('orders', 'warehouse'), explore('events', 'posthog')],
        );
        const tree = buildProjectTree(shop);
        expect(
            pageNodes(shop, tree, { type: 'source', sourceId: 'stripe' }),
        ).toEqual([]);
        expect(pageNodes(shop, tree, { type: 'kind', kind: 'files' })).toEqual(
            [],
        );
    });

    it('lists the root for no page', () => {
        const shop = project([warehouse], [explore('orders', 'warehouse')]);
        const tree = buildProjectTree(shop);
        expect(pageNodes(shop, tree, null)).toBe(tree.nodes);
    });
});

describe('buildProjectTree with several warehouses', () => {
    const main = source({
        id: 'warehouse',
        kind: 'modelled',
        name: 'Main',
        warehouse: { type: 'postgres', label: 'PostgreSQL' },
    });
    const analytics = source({
        id: 'warehouse:wc-2',
        kind: 'modelled',
        name: 'Analytics',
        warehouse: { type: 'snowflake', label: 'Snowflake' },
    });
    const empty = source({
        id: 'warehouse:wc-3',
        kind: 'modelled',
        name: 'Empty',
        warehouse: { type: 'postgres', label: 'PostgreSQL' },
    });
    const oneWarehouse = [
        explore('orders', 'warehouse'),
        explore('customers', 'warehouse'),
        explore('big_orders', 'virtual-views'),
    ];
    const several = [
        ...oneWarehouse,
        explore('events', 'warehouse:wc-2'),
        explore('sessions', 'warehouse:wc-2'),
    ];

    it('reads Warehouse with the flag off', () => {
        const { nodes } = buildProjectTree(
            project([warehouse, virtualViews], oneWarehouse),
        );
        expect(nodes.map(({ label }) => label)).toEqual([
            'Warehouse',
            'Virtual views',
        ]);
        expect(nodes[0].children.map(({ label }) => label)).toEqual([
            'PostgreSQL',
        ]);
    });

    it('reads Warehouses and lists each connection by name', () => {
        const { nodes } = buildProjectTree({
            ...project([main, analytics, empty, virtualViews], several),
            multipleWarehouses: true,
        });
        const warehouses = nodes.find(({ label }) => label === 'Warehouses');
        expect(warehouses?.exploreCount).toBe(4);
        expect(
            warehouses?.children.map(({ label, exploreCount, children }) => [
                label,
                exploreCount,
                children.map((child) => child.label),
            ]),
        ).toEqual([
            ['Analytics', 2, ['events', 'sessions']],
            ['Empty', 0, []],
            ['Main', 2, ['customers', 'orders']],
        ]);
    });

    it('reads Warehouses for a project still on one connection', () => {
        const { nodes } = buildProjectTree({
            ...project([warehouse, virtualViews], oneWarehouse),
            multipleWarehouses: true,
        });
        expect(nodes.map(({ label }) => label)).toEqual([
            'Warehouses',
            'Virtual views',
        ]);
    });
});
