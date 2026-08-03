import { describe, expect, it } from 'vitest';
import {
    DATA_REFERENCE_EXTRACTOR_VERSION,
    extractDataAppDataReferences,
    type DataAppSourceFile,
    type ExtractedExternalFetchReference,
    type ExtractedGlobalFilterReference,
    type ExtractedQueryReference,
    type ExtractedSavedChartReference,
} from './dataReferences';

const file = (path: string, content: string): DataAppSourceFile => ({
    path,
    content,
});

const app = (content: string) => [file('src/App.jsx', content)];

const queries = (files: DataAppSourceFile[]): ExtractedQueryReference[] =>
    extractDataAppDataReferences(files).references.filter(
        (r): r is ExtractedQueryReference => r.kind === 'query',
    );

const savedCharts = (
    files: DataAppSourceFile[],
): ExtractedSavedChartReference[] =>
    extractDataAppDataReferences(files).references.filter(
        (r): r is ExtractedSavedChartReference => r.kind === 'savedChart',
    );

describe('extractDataAppDataReferences', () => {
    describe('query chains', () => {
        it('extracts a fully literal chain', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    const q = query('orders')
                        .label('Revenue')
                        .dimensions(['customer_segment', 'order_date'])
                        .metrics(['total_revenue', 'order_count'])
                        .filters([{ field: 'order_date', operator: 'inThePast', value: 90, unit: 'days' }])
                        .sorts([{ field: 'total_revenue', direction: 'desc' }])
                        .limit(10);
                `),
            );
            expect(ref).toMatchObject({
                explore: 'orders',
                dimensions: ['customer_segment', 'order_date'],
                metrics: ['order_count', 'total_revenue'],
                filterFields: ['order_date'],
                sortFields: ['total_revenue'],
                unresolved: [],
            });
            expect(ref.location.path).toBe('src/App.jsx');
        });

        it('keeps dot-notation joined fields verbatim', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    query('orders')
                        .dimensions(['order_date', 'customers.customer_name'])
                        .metrics(['customers.customer_count'])
                        .sorts([{ field: 'customers.customer_name', direction: 'asc' }]);
                `),
            );
            expect(ref.dimensions).toEqual([
                'customers.customer_name',
                'order_date',
            ]);
            expect(ref.metrics).toEqual(['customers.customer_count']);
            expect(ref.sortFields).toEqual(['customers.customer_name']);
        });

        it('resolves const identifiers and spread const arrays (d3.md patterns)', () => {
            const [a, b] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    const EXPLORE = 'orders';
                    const NODE_FIELD = 'source_segment';
                    const TARGET_FIELD = 'target_segment';
                    const LEVELS = ['region', 'customer_segment'];
                    const a = query(EXPLORE).dimensions([NODE_FIELD, TARGET_FIELD]).metrics(['total_revenue']);
                    const b = query(EXPLORE).dimensions([...LEVELS]).metrics(['total_revenue']);
                `),
            );
            expect(a).toMatchObject({
                explore: 'orders',
                dimensions: ['source_segment', 'target_segment'],
                unresolved: [],
            });
            expect(b).toMatchObject({
                explore: 'orders',
                dimensions: ['customer_segment', 'region'],
                unresolved: [],
            });
        });

        it('resolves `as const` arrays in TSX', () => {
            const [ref] = queries([
                file(
                    'src/App.tsx',
                    `
                        import { query } from '@lightdash/query-sdk';
                        const LEVELS = ['region', 'customer_segment'] as const;
                        query('orders').dimensions([...LEVELS]).metrics(['total_revenue']);
                    `,
                ),
            ]);
            expect(ref.dimensions).toEqual(['customer_segment', 'region']);
            expect(ref.unresolved).toEqual([]);
        });

        it('folds chain forks through a shared const base into the root (skill.md pattern)', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    const base = query('orders').metrics(['total_revenue']);
                    const bySegment = base.label('Revenue by Segment').dimensions(['customer_segment']);
                    const byRegion = base.label('Revenue by Region').dimensions(['region']);
                `),
            );
            expect(ref).toMatchObject({
                explore: 'orders',
                dimensions: ['customer_segment', 'region'],
                metrics: ['total_revenue'],
                unresolved: [],
            });
        });

        it('follows chains continued inside useMemo with benign filtersFor (canonical component pattern)', () => {
            const refs = queries(
                app(`
                    import { useMemo } from 'react';
                    import { query, useLightdash } from '@lightdash/query-sdk';
                    import { useGlobalFilters } from '@/lib/filters';

                    const EXPLORE = 'orders';
                    const baseQuery = query(EXPLORE)
                        .label('Revenue by Segment')
                        .dimensions(['customer_segment'])
                        .metrics(['total_revenue']);

                    function RevenueChart() {
                        const { filtersFor } = useGlobalFilters();
                        const chartQuery = useMemo(
                            () => baseQuery.filters(filtersFor(EXPLORE)),
                            [filtersFor],
                        );
                        const { data } = useLightdash(chartQuery);
                        return data;
                    }
                `),
            );
            expect(refs).toHaveLength(1);
            expect(refs[0]).toMatchObject({
                explore: 'orders',
                dimensions: ['customer_segment'],
                metrics: ['total_revenue'],
                unresolved: [],
            });
        });

        it('captures local field definitions (table calcs, additional metrics, custom dimensions)', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    query('orders')
                        .dimensions(['order_date'])
                        .metrics(['total_revenue', 'custom_avg_price'])
                        .tableCalculations([
                            { name: 'running_total', displayName: 'Running Total', sql: 'SUM(1)' },
                        ])
                        .additionalMetrics([
                            { name: 'custom_avg_price', table: 'order_items', type: 'average', sql: 'x' },
                        ])
                        .customDimensions([
                            { id: 'price_tier', name: 'Price tier', table: 'orders', sql: 'x', dimensionId: 'orders_price' },
                        ]);
                `),
            );
            expect(ref.localFields).toEqual([
                'Price tier',
                'custom_avg_price',
                'price_tier',
                'running_total',
            ]);
            expect(ref.unresolved).toEqual([]);
        });

        it('captures parameter keys including dotted model-level keys', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    query('deals')
                        .metrics(['selected_kpi'])
                        .parameters({ kpi_selector: 'total_revenue', 'orders.region': 'EMEA' })
                        .limit(1);
                `),
            );
            expect(ref.parameterKeys).toEqual([
                'kpi_selector',
                'orders.region',
            ]);
        });

        it('resolves ternary and options-map lookups to the set of possible fields', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    const VIEWS = {
                        region: { dim: 'orders.region' },
                        segment: { dim: 'orders.segment' },
                    };
                    function Chart({ mode, compact }) {
                        return query('orders')
                            .dimensions([VIEWS[mode].dim, compact ? 'order_month' : 'order_date'])
                            .metrics(['total_revenue']);
                    }
                `),
            );
            expect(ref.dimensions).toEqual([
                'order_date',
                'order_month',
                'orders.region',
                'orders.segment',
            ]);
            expect(ref.unresolved).toEqual([]);
        });

        it('resolves useState-driven fields from initial value and setter call sites', () => {
            const [ref] = queries(
                app(`
                    import { useState } from 'react';
                    import { query, useLightdash } from '@lightdash/query-sdk';
                    function Chart() {
                        const [groupBy, setGroupBy] = useState('customer_segment');
                        const { data } = useLightdash(
                            query('orders').dimensions([groupBy]).metrics(['total_revenue']),
                        );
                        return (
                            <div>
                                <button onClick={() => setGroupBy('region')}>By region</button>
                                {data}
                            </div>
                        );
                    }
                `),
            );
            expect(ref.dimensions).toEqual(['customer_segment', 'region']);
            expect(ref.unresolved).toEqual([]);
        });

        it('marks state unresolved when the setter escapes as a value', () => {
            const [ref] = queries(
                app(`
                    import { useState } from 'react';
                    import { query } from '@lightdash/query-sdk';
                    function Chart({ options }) {
                        const [groupBy, setGroupBy] = useState('customer_segment');
                        return (
                            <div>
                                <Select onChange={setGroupBy} options={options} />
                                {query('orders').dimensions([groupBy]).metrics(['total_revenue'])}
                            </div>
                        );
                    }
                `),
            );
            expect(ref.dimensions).toEqual(['customer_segment']);
            expect(ref.unresolved).toEqual(['dimensions']);
        });

        it('resolves useMemo-built filter objects with literal fields (dynamic values)', () => {
            const [ref] = queries(
                app(`
                    import { useMemo } from 'react';
                    import { query } from '@lightdash/query-sdk';
                    import { useGlobalFilters } from '@/lib/filters';
                    const base = query('data_app_versions').metrics(['versions']);
                    function Kpi({ pc }) {
                        const { filtersFor } = useGlobalFilters();
                        const buildsFilter = useMemo(() => ({
                            field: 'started_at_day', operator: 'inThePast', value: pc.value, unit: pc.unit,
                        }), [pc]);
                        return useMemo(
                            () => base.filters([buildsFilter, ...filtersFor('data_app_versions')]),
                            [buildsFilter, filtersFor],
                        );
                    }
                `),
            );
            expect(ref).toMatchObject({
                explore: 'data_app_versions',
                filterFields: ['started_at_day'],
                unresolved: [],
            });
        });

        it('resolves shared constants imported from another module (incl. @/ alias)', () => {
            const refs = queries([
                file(
                    'src/lib/constants.js',
                    `export const EXPLORE = 'orders';
                     export const CORE_FIELDS = ['order_date', 'region'];`,
                ),
                file(
                    'src/App.jsx',
                    `
                        import { query } from '@lightdash/query-sdk';
                        import { EXPLORE, CORE_FIELDS } from '@/lib/constants';
                        query(EXPLORE).dimensions(CORE_FIELDS).metrics(['total_revenue']);
                    `,
                ),
            ]);
            expect(refs).toHaveLength(1);
            expect(refs[0]).toMatchObject({
                explore: 'orders',
                dimensions: ['order_date', 'region'],
                unresolved: [],
            });
        });

        it('supports client.model() only when traced to an SDK client', () => {
            const refs = queries(
                app(`
                    import { createClient } from '@lightdash/query-sdk';
                    const lightdash = createClient();
                    lightdash.model('orders').dimensions(['status']).metrics(['order_count']);
                    someOtherLib.model('not-an-explore').dimensions(['x']);
                `),
            );
            expect(refs).toHaveLength(2);
            expect(refs[0]).toMatchObject({
                explore: 'orders',
                unresolved: [],
            });
            // Untraceable receiver with SDK-shaped methods degrades honestly.
            expect(refs[1]).toMatchObject({ explore: null });
            expect(refs[1].unresolved).toContain('explore');
        });

        it('degrades dynamic explores and computed fields to unresolved parts, keeping what resolved', () => {
            const [ref] = queries(
                app(`
                    import { query } from '@lightdash/query-sdk';
                    function Chart({ exploreName, extraField }) {
                        return query(exploreName)
                            .dimensions(['order_date', extraField])
                            .metrics(['total_revenue']);
                    }
                `),
            );
            expect(ref.explore).toBeNull();
            expect(ref.dimensions).toEqual(['order_date']);
            expect(ref.metrics).toEqual(['total_revenue']);
            expect(ref.unresolved).toEqual(['dimensions', 'explore']);
        });

        it('does not extract a locally shadowed query()', () => {
            const refs = queries(
                app(`
                    const query = (sql) => sql;
                    query('SELECT * FROM x');
                `),
            );
            expect(refs).toHaveLength(0);
        });

        it('honors aliased SDK imports', () => {
            const [ref] = queries(
                app(`
                    import { query as q } from '@lightdash/query-sdk';
                    q('orders').metrics(['total_revenue']);
                `),
            );
            expect(ref).toMatchObject({ explore: 'orders', unresolved: [] });
        });

        it('treats unbound query() as the SDK (doc snippets omit imports)', () => {
            const [ref] = queries(
                app(`query('orders').metrics(['total_revenue']);`),
            );
            expect(ref).toMatchObject({ explore: 'orders', unresolved: [] });
        });
    });

    describe('drillDown', () => {
        it('resolves the explore through a useMemo-built source query', () => {
            const refs = queries(
                app(`
                    import { useMemo } from 'react';
                    import { query, drillDown } from '@lightdash/query-sdk';
                    import { useGlobalFilters } from '@/lib/filters';
                    const EXPLORE = 'orders';
                    const baseQuery = query(EXPLORE).dimensions(['customer_segment']).metrics(['total_revenue']);
                    function Chart({ row }) {
                        const { filtersFor } = useGlobalFilters();
                        const chartQuery = useMemo(() => baseQuery.filters(filtersFor(EXPLORE)), [filtersFor]);
                        const dq = drillDown({
                            sourceQuery: chartQuery,
                            metric: 'total_revenue',
                            dimension: 'order_date',
                            row,
                        });
                        return dq;
                    }
                `),
            );
            const drill = refs.find((r) => r.dimensions.includes('order_date'));
            expect(drill).toMatchObject({
                explore: 'orders',
                dimensions: ['order_date'],
                metrics: ['total_revenue'],
                unresolved: [],
            });
        });

        it('degrades to unresolved explore when the source query cannot be traced', () => {
            const refs = queries(
                app(`
                    import { drillDown } from '@lightdash/query-sdk';
                    function Chart({ sourceQuery, row }) {
                        return drillDown({ sourceQuery, metric: 'total_revenue', dimension: 'order_date', row });
                    }
                `),
            );
            expect(refs).toHaveLength(1);
            expect(refs[0]).toMatchObject({
                explore: null,
                dimensions: ['order_date'],
                metrics: ['total_revenue'],
                unresolved: ['explore'],
            });
        });
    });

    describe('savedChart', () => {
        it('extracts the uuid and qualified filter fields', () => {
            const [ref] = savedCharts(
                app(`
                    import { savedChart } from '@lightdash/query-sdk';
                    savedChart('a1b2c3d4-0000-0000-0000-000000000000')
                        .label('Revenue chart')
                        .filters([{ field: 'orders_status', operator: 'equals', value: 'completed' }])
                        .limit(500);
                `),
            );
            expect(ref).toMatchObject({
                chartUuid: 'a1b2c3d4-0000-0000-0000-000000000000',
                filterFields: ['orders_status'],
                unresolved: [],
            });
        });

        it('ignores structural no-op methods and flags dynamic uuids', () => {
            const [ref] = savedCharts(
                app(`
                    import { savedChart } from '@lightdash/query-sdk';
                    function Chart({ uuid }) {
                        return savedChart(uuid).dimensions(['ignored']).metrics(['ignored_too']);
                    }
                `),
            );
            expect(ref.chartUuid).toBeNull();
            expect(ref.unresolved).toEqual(['chartUuid']);
        });
    });

    describe('externalFetch', () => {
        it('extracts alias and path from any receiver', () => {
            const result = extractDataAppDataReferences(
                app(`
                    async function load(lightdash) {
                        const res = await lightdash.externalFetch('stripe', {
                            method: 'GET',
                            path: '/v1/charges',
                            query: { limit: '10' },
                        });
                        return res.body;
                    }
                `),
            );
            const fetches = result.references.filter(
                (r): r is ExtractedExternalFetchReference =>
                    r.kind === 'externalFetch',
            );
            expect(fetches).toHaveLength(1);
            expect(fetches[0]).toMatchObject({
                alias: 'stripe',
                path: '/v1/charges',
                unresolved: [],
            });
        });

        it('flags dynamic aliases', () => {
            const result = extractDataAppDataReferences(
                app(`
                    function load(client, alias) {
                        return client.externalFetch(alias, { path: '/x' });
                    }
                `),
            );
            const [ref] = result.references.filter(
                (r): r is ExtractedExternalFetchReference =>
                    r.kind === 'externalFetch',
            );
            expect(ref.alias).toBeNull();
            expect(ref.unresolved).toEqual(['alias']);
        });
    });

    describe('global filters (addFilter)', () => {
        it('extracts field + explore from addFilter traced to useGlobalFilters', () => {
            const result = extractDataAppDataReferences(
                app(`
                    import { useGlobalFilters } from '@/lib/filters';
                    const EXPLORE = 'orders';
                    function Menu({ value }) {
                        const { addFilter } = useGlobalFilters();
                        return () => addFilter({
                            field: 'customer_segment',
                            operator: 'equals',
                            value,
                            explore: EXPLORE,
                        });
                    }
                `),
            );
            const filters = result.references.filter(
                (r): r is ExtractedGlobalFilterReference =>
                    r.kind === 'globalFilter',
            );
            expect(filters).toHaveLength(1);
            expect(filters[0]).toMatchObject({
                explore: 'orders',
                field: 'customer_segment',
                unresolved: [],
            });
        });

        it('ignores unrelated addFilter functions', () => {
            const result = extractDataAppDataReferences(
                app(`
                    import { addFilter } from './my-own-lib';
                    addFilter({ field: 'x', explore: 'y' });
                `),
            );
            expect(
                result.references.filter((r) => r.kind === 'globalFilter'),
            ).toHaveLength(0);
        });
    });

    describe('robustness & output shape', () => {
        it('records parse errors without failing the rest of the bundle', () => {
            const result = extractDataAppDataReferences([
                file('src/broken.js', 'const = = broken syntax %%%'),
                file(
                    'src/App.jsx',
                    `import { query } from '@lightdash/query-sdk';
                     query('orders').metrics(['total_revenue']);`,
                ),
            ]);
            expect(result.parseErrors).toHaveLength(1);
            expect(result.parseErrors[0].path).toBe('src/broken.js');
            expect(result.references).toHaveLength(1);
        });

        it('skips non-JS files', () => {
            const result = extractDataAppDataReferences([
                file('src/index.css', 'body { color: red; }'),
                file('README.md', "query('nope')"),
            ]);
            expect(result.references).toHaveLength(0);
            expect(result.parseErrors).toHaveLength(0);
        });

        it('reports the extractor version and coverage stats', () => {
            const result = extractDataAppDataReferences(
                app(`
                    import { query, savedChart } from '@lightdash/query-sdk';
                    query('orders').metrics(['total_revenue']);
                    function C({ uuid, f }) {
                        return [savedChart(uuid), query('orders').dimensions([f]).metrics(['order_count'])];
                    }
                `),
            );
            expect(result.extractorVersion).toBe(
                DATA_REFERENCE_EXTRACTOR_VERSION,
            );
            expect(result.stats).toEqual({
                callSites: 3,
                fullyResolved: 1,
                partiallyResolved: 1, // explore known, one dimension dynamic
                unresolved: 1, // dynamic savedChart uuid
            });
        });

        it('produces deterministic, sorted output', () => {
            const source = app(`
                import { query } from '@lightdash/query-sdk';
                query('orders').dimensions(['b_dim', 'a_dim']).metrics(['z_metric', 'a_metric']);
            `);
            const a = extractDataAppDataReferences(source);
            const b = extractDataAppDataReferences(source);
            expect(a).toEqual(b);
            const [ref] = a.references as ExtractedQueryReference[];
            expect(ref.dimensions).toEqual(['a_dim', 'b_dim']);
            expect(ref.metrics).toEqual(['a_metric', 'z_metric']);
        });
    });
});
