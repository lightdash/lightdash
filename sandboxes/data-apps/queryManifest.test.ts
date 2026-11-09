// Run: pnpm test:manifest (tsx --test, needs the oxc-parser dev dependency).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeModule, buildQueryManifest } from './template/queryManifest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
    fs.readFileSync(
        path.join(here, 'testFixtures', 'queryManifest', name),
        'utf-8',
    );

type Entry = Record<string, unknown> & {
    id: string | null;
    kind: string;
    bucket: string;
    loc: string;
};
type Binding = {
    component: string | null;
    loc: string;
    query: string | null;
    queryLoc: string | null;
};

const byId = (queries: Entry[], id: string): Entry => {
    const found = queries.find((q) => q.id === id);
    assert.ok(found, `query ${id} missing from ${queries.map((q) => q.id)}`);
    return found;
};

test('demo app: 5 static semantic + 3 static composer queries', () => {
    const { queries, bindings } = analyzeModule(
        fixture('demoApp.jsx'),
        'src/App.jsx',
    ) as { queries: Entry[]; bindings: Binding[] };

    assert.equal(queries.length, 8);
    assert.deepEqual(
        queries.map((q) => [q.kind, q.bucket]),
        [
            ...Array(4).fill(['semantic', 'static']),
            ['composer', 'static'],
            ['composer', 'static'],
            ['semantic', 'static'],
            ['composer', 'static'],
        ],
    );

    assert.deepEqual(byId(queries, 'plays-by-platform'), {
        kind: 'semantic',
        id: 'plays-by-platform',
        title: 'Plays by platform',
        description: 'Where plays come from (order source).',
        explore: 'orders',
        dimensions: ['order_source'],
        metrics: ['unique_order_count'],
        filters: [],
        metricFilters: [],
        sorts: [{ field: 'unique_order_count', direction: 'desc' }],
        limit: 8,
        parameters: {},
        loc: 'src/App.jsx:127',
        bucket: 'static',
        slots: [],
    });

    const breakout = byId(queries, 'breakout-months');
    assert.equal(breakout.terminal, 'spikes');
    const nodes = breakout.nodes as Record<string, unknown>[];
    assert.deepEqual(
        nodes.map((n) => [n.kind, n.nodeId]),
        [
            ['semantic', 'monthly'],
            ['semantic', 'catalog'],
            ['python', 'spikes'],
        ],
    );
    assert.deepEqual(nodes[1], {
        kind: 'semantic',
        nodeId: 'catalog',
        title: 'Catalog chart (saved)',
        description:
            'A saved chart used as a second input, to show saved charts can feed a pipeline.',
        query: {
            kind: 'savedChart',
            id: null,
            title: null,
            description: null,
            chartUuid: 'dcfeaf86-4d9b-4b82-b125-fc3b22ef045e',
            limit: null,
            filters: [],
            parameters: {},
        },
    });
    assert.deepEqual(nodes[2].reads, ['monthly', 'catalog']);
    assert.equal(nodes[2].limit, null);
    assert.match(String(nodes[2].code), /^def run\(inputs, params\):/);

    const topArtists = byId(queries, 'top-artists');
    const duck = (topArtists.nodes as Record<string, unknown>[])[1];
    assert.equal(duck.kind, 'duckdb');
    assert.match(String(duck.sql), /from artist_plays/);
    assert.deepEqual(duck.reads, ['artist_plays']);

    // Module-scope queries passed as props resolve to no query at the hook.
    const stat = bindings.find((b) => b.component === 'Stat');
    assert.deepEqual(stat, {
        component: 'Stat',
        loc: 'src/App.jsx:180',
        query: null,
        queryLoc: null,
    });
    assert.deepEqual(
        bindings
            .filter((b) => b.component !== 'Stat')
            .map((b) => [b.component, b.query]),
        [
            ['PlaysOverTime', 'plays-over-time'],
            ['TopArtists', 'top-artists'],
            ['PlaysByPlatform', 'plays-by-platform'],
            ['BreakoutMonths', 'breakout-months'],
        ],
    );
});

test('template app: global filter slot, local state slot, linked chart, dynamic', () => {
    const { queries, bindings } = analyzeModule(
        fixture('templateApp.tsx'),
        'src/App.tsx',
    ) as { queries: Entry[]; bindings: Binding[] };

    assert.equal(queries.length, 4);

    // `base.filters(filtersFor(EXPLORE))` inside useMemo folds into one query.
    assert.deepEqual(byId(queries, 'revenue-by-segment'), {
        kind: 'semantic',
        id: 'revenue-by-segment',
        title: 'Revenue by Segment',
        description: null,
        explore: 'orders',
        dimensions: ['customer_segment'],
        metrics: ['total_revenue'],
        filters: [{ slot: 'globalFilters:orders' }],
        metricFilters: [],
        sorts: [],
        limit: 500,
        parameters: {},
        loc: 'src/App.tsx:18',
        bucket: 'parametric',
        slots: [
            {
                name: 'globalFilters:orders',
                kind: 'globalFilter',
                explore: 'orders',
                default: [],
            },
        ],
    });

    const trend = byId(queries, 'revenue-trend');
    assert.equal(trend.bucket, 'parametric');
    assert.deepEqual(trend.dimensions, [{ template: 'order_date_${grain}' }]);
    assert.deepEqual(trend.sorts, [
        { field: { template: 'order_date_${grain}' }, direction: 'asc' },
    ]);
    assert.deepEqual(trend.slots, [
        { name: 'grain', kind: 'local', explore: null, default: 'month' },
    ]);

    const linked = queries.find((q) => q.kind === 'savedChart');
    assert.deepEqual(linked, {
        kind: 'savedChart',
        id: null,
        title: 'Orders area',
        description: null,
        chartUuid: 'dcfeaf86-4d9b-4b82-b125-fc3b22ef045e',
        limit: null,
        filters: [{ slot: 'globalFilters:orders' }],
        parameters: {},
        loc: 'src/App.tsx:49',
        bucket: 'parametric',
        slots: [
            {
                name: 'globalFilters:orders',
                kind: 'globalFilter',
                explore: 'orders',
                default: [],
            },
        ],
    });

    const dynamic = queries.find((q) => q.bucket === 'dynamic');
    assert.ok(dynamic);
    assert.deepEqual(dynamic.explore, { source: 'props.explore' });
    assert.deepEqual(dynamic.filters, [
        { source: 'buildFilters(props.state)' },
    ]);
    assert.deepEqual(dynamic.metrics, ['count']);

    assert.deepEqual(
        bindings.map((b) => [b.component, b.query, b.queryLoc]),
        [
            ['RevenueBySegment', 'revenue-by-segment', 'src/App.tsx:18'],
            ['RevenueTrend', 'revenue-trend', 'src/App.tsx:29'],
            ['LinkedChart', null, 'src/App.tsx:49'],
            ['Dynamic', null, 'src/App.tsx:61'],
        ],
    );
});

test('buildQueryManifest never throws: parse errors land in `error`', () => {
    const manifest = buildQueryManifest([
        { code: 'const = ;', relPath: 'src/Broken.jsx' },
        {
            code: `import { query } from '@lightdash/query-sdk';
export const q = query('orders').metrics(['count']);`,
            relPath: 'src/Ok.js',
        },
    ]);
    assert.equal(manifest.version, 1);
    assert.equal(manifest.queries.length, 1);
    assert.deepEqual(manifest.bindings, []);
    assert.match(String(manifest.error), /src\/Broken\.jsx/);
});
