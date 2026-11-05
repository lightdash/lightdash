import { MergeJoinType } from '../types/mergeQuery';
import { ChartType } from '../types/savedCharts';
import {
    DOCUMENT_SCHEMA_VERSION,
    getDocumentRuntimeChartConfig,
    getDocumentUrl,
    parseDocumentContent,
} from './document';
import { getDocumentSummaryMarkdown } from './documentMarkdown';

describe('getDocumentUrl', () => {
    test('prefers the document slug when its canonical UUID is provided', () => {
        expect(
            getDocumentUrl(
                'project',
                '36d4516a-3af0-48f6-9b47-d50956301501',
                'weekly-review',
            ),
        ).toBe('/projects/project/documents/weekly-review');
    });
    test('uses the canonical UUID for UUID-shaped slugs to avoid identity ambiguity', () => {
        expect(
            getDocumentUrl(
                'project',
                '36d4516a-3af0-48f6-9b47-d50956301501',
                '26eefd62-30f9-485c-81c4-3b814aa8032f',
            ),
        ).toBe(
            '/projects/project/documents/36d4516a-3af0-48f6-9b47-d50956301501',
        );
    });
    test.each([
        ['project-slug', 'document-slug'],
        ['3675b69e-8324-4110-bdca-059031aa8da3', 'document-slug'],
        ['project-slug', '36d4516a-3af0-48f6-9b47-d50956301501'],
        [
            '3675b69e-8324-4110-bdca-059031aa8da3',
            '36d4516a-3af0-48f6-9b47-d50956301501',
        ],
    ])('builds a link for %s / %s', (project, document) => {
        expect(getDocumentUrl(project, document)).toBe(
            `/projects/${project}/documents/${document}`,
        );
    });
    test('encodes path identifiers rather than allowing URL structure injection', () => {
        expect(
            getDocumentUrl('project/name', 'report?redirect=elsewhere'),
        ).toBe(
            '/projects/project%2Fname/documents/report%3Fredirect%3Delsewhere',
        );
    });
});

const query = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
};
const chart = {
    name: 'Orders',
    tableName: 'orders',
    metricQuery: query,
    chartConfig: { type: ChartType.TABLE },
};
const semantic = { source: 'semantic', chart };
const merge = {
    source: 'merge',
    chart: {
        ...chart,
        merge: {
            primarySourceId: 'a',
            sources: [
                { id: 'a', kind: 'chart' },
                { id: 'b', kind: 'query', metricQuery: query },
            ],
            joinType: MergeJoinType.FULL,
            joinKey: [
                {
                    name: 'status',
                    fieldIdBySourceId: {
                        a: 'orders_status',
                        b: 'orders_status',
                    },
                },
            ],
            tableCalculations: [],
        },
    },
};

/** One chart placed under a heading. */
const withChart = (content: unknown) => ({
    markdown: '# Findings\n\n<document-chart id="c1">',
    charts: { c1: content },
});

const withChartConfig = (
    content: typeof semantic | typeof merge,
    chartConfig: unknown,
) => withChart({ ...content, chart: { ...content.chart, chartConfig } });

describe('Document schema version 2', () => {
    test.each([semantic, merge])(
        'accepts a custom chart type binding inside a supported source',
        (content) => {
            const binding = {
                dataAppVizSlug: 'grouped-bars',
                dataAppVizVersion: 2,
                fieldMapping: { category: 'orders_status' },
                optionValues: { stacked: true },
            };
            const document = withChartConfig(content, {
                type: ChartType.DATA_APP_VIZ,
                config: binding,
            });
            expect(parseDocumentContent(2, document)).toEqual(document);
        },
    );

    test.each([semantic, merge])(
        'rejects a custom chart that references no chart type',
        (content) => {
            expect(() =>
                parseDocumentContent(
                    2,
                    withChartConfig(content, { type: ChartType.DATA_APP_VIZ }),
                ),
            ).toThrow('must reference a chart type');
        },
    );

    test('rejects a non-integer custom chart type version', () => {
        expect(() =>
            parseDocumentContent(
                2,
                withChartConfig(semantic, {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizSlug: 'grouped-bars',
                        dataAppVizVersion: 0,
                        fieldMapping: {},
                    },
                }),
            ),
        ).toThrow('Invalid Document content');
    });

    test('rejects otherwise valid three-source merges', () => {
        const definition = merge.chart.merge;
        expect(() =>
            parseDocumentContent(
                2,
                withChart({
                    ...merge,
                    chart: {
                        ...merge.chart,
                        merge: {
                            ...definition,
                            sources: [
                                ...definition.sources,
                                { id: 'c', kind: 'query', metricQuery: query },
                            ],
                            joinKey: [
                                {
                                    name: 'status',
                                    fieldIdBySourceId: {
                                        a: 'orders_status',
                                        b: 'orders_status',
                                        c: 'orders_status',
                                    },
                                },
                            ],
                        },
                    },
                }),
            ),
        ).toThrow('Invalid merge sources or join keys in chart "c1"');
    });

    test('rejects transient references on merge sources', () => {
        const definition = merge.chart.merge;
        expect(() =>
            parseDocumentContent(
                2,
                withChart({
                    ...merge,
                    chart: {
                        ...merge.chart,
                        merge: {
                            ...definition,
                            sources: definition.sources.map((source) => ({
                                ...source,
                                queryUuid: 'temporary-result',
                            })),
                        },
                    },
                }),
            ),
        ).toThrow('Invalid merge sources or join keys');
    });

    test.each([
        { markdown: '', charts: {} },
        { markdown: '# Findings', charts: {} },
        withChart(semantic),
        withChart(merge),
        {
            markdown:
                '<document-chart id="c2">\n\nBetween\n\n<document-chart id="c1">',
            charts: { c1: semantic, c2: merge },
        },
    ])('preserves valid canonical content: %j', (content) => {
        expect(parseDocumentContent(DOCUMENT_SCHEMA_VERSION, content)).toEqual(
            content,
        );
    });

    test('drops charts that are not placed in the markdown', () => {
        expect(
            parseDocumentContent(2, {
                markdown: '<document-chart id="c1">',
                charts: { c1: semantic, c2: merge },
            }),
        ).toEqual({
            markdown: '<document-chart id="c1">',
            charts: { c1: semantic },
        });
    });

    test('keeps only the id on chart tags', () => {
        expect(
            parseDocumentContent(2, {
                markdown: '<document-chart id="c1" title="Orders" />',
                charts: { c1: semantic },
            }).markdown,
        ).toBe('<document-chart id="c1">');
    });

    test.each([
        [
            'a tag without a chart',
            { markdown: '<document-chart id="c1">', charts: {} },
            'missing from charts',
        ],
        [
            'a chart placed twice',
            {
                markdown:
                    '<document-chart id="c1">\n\n<document-chart id="c1">',
                charts: { c1: semantic },
            },
            'placed more than once',
        ],
        [
            'a tag without an id',
            { markdown: '<document-chart title="x">', charts: {} },
            'needs an id',
        ],
    ])('rejects %s', (_label, content, message) => {
        expect(() => parseDocumentContent(2, content)).toThrow(message);
    });

    test.each([
        { cells: [] },
        { markdown: 1, charts: {} },
        { markdown: '' },
        { markdown: '', charts: {}, unexpected: true },
        withChart({ source: 'sql', chart }),
        withChart({ source: 'composer', chart }),
        withChart({ source: 'customChartType', chart }),
        withChart({
            ...semantic,
            chart: { ...chart, metricQuery: { ...query, metrics: 1 } },
        }),
        withChart({
            ...semantic,
            chart: {
                ...chart,
                metricQuery: { ...query, queryUuid: 'temporary' },
            },
        }),
        withChart({
            ...semantic,
            chart: { ...chart, chartConfig: { type: 'unknown' } },
        }),
        withChart({
            ...merge,
            chart: {
                ...merge.chart,
                merge: { ...merge.chart.merge, primarySourceId: 'missing' },
            },
        }),
        withChart({
            ...merge,
            chart: {
                ...merge.chart,
                merge: { ...merge.chart.merge, joinType: 'unknown' },
            },
        }),
        withChart({
            ...merge,
            chart: {
                ...merge.chart,
                merge: { ...merge.chart.merge, joinKey: [] },
            },
        }),
        withChart({ ...semantic, chart: merge.chart }),
        withChart({ ...semantic, title: 'Title' }),
    ])('rejects malformed or unsupported content: %j', (content) => {
        expect(() => parseDocumentContent(2, content)).toThrow();
    });

    test.each([0, 1, 3, -1])(
        'rejects unsupported schema version %s',
        (version) => {
            expect(() =>
                parseDocumentContent(version, { markdown: '', charts: {} }),
            ).toThrow('Unsupported Document schema version');
        },
    );

    test('does not mutate its input', () => {
        const content = {
            markdown: '<document-chart id="c1">',
            charts: { c1: semantic, c2: merge },
        };
        const snapshot = structuredClone(content);
        parseDocumentContent(2, content);
        expect(content).toEqual(snapshot);
    });
});

describe('getDocumentRuntimeChartConfig', () => {
    test('drops the portable slug from a stored custom chart', () => {
        expect(
            getDocumentRuntimeChartConfig({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz-uuid',
                    dataAppVizSlug: 'grouped-bars',
                    dataAppVizVersion: 3,
                    fieldMapping: { category: 'orders_status' },
                },
            }),
        ).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 3,
                fieldMapping: { category: 'orders_status' },
            },
        });
    });

    test('refuses a custom chart that was never linked to a chart type', () => {
        expect(() =>
            getDocumentRuntimeChartConfig({
                type: ChartType.DATA_APP_VIZ,
                config: { dataAppVizSlug: 'grouped-bars', fieldMapping: {} },
            }),
        ).toThrow('not linked to a chart type');
    });

    test('passes built-in chart configs through', () => {
        const table = { type: ChartType.TABLE } as const;
        expect(getDocumentRuntimeChartConfig(table)).toBe(table);
    });
});

describe('SQL charts', () => {
    const sqlChart = {
        source: 'sql',
        chart: {
            name: 'Revenue by region',
            sql: 'select region, sum(amount) as revenue from orders group by 1',
            limit: 500,
            chartKind: 'vertical_bar',
            config: {
                type: 'vertical_bar',
                metadata: { version: 1 },
                fieldConfig: {
                    x: { reference: 'region', type: 'category' },
                    y: [{ reference: 'revenue', aggregation: 'sum' }],
                    groupBy: [],
                },
                display: {},
            },
            connection: 'analytics',
        },
    };
    const content = (entry: unknown) => ({
        markdown: '<document-chart id="c1">',
        charts: { c1: entry },
    });

    test('accepts a SQL chart in its content-as-code shape', () => {
        expect(parseDocumentContent(2, content(sqlChart))).toEqual(
            content(sqlChart),
        );
    });

    test.each([
        ['an empty query', { sql: ' ' }, 'sql must be a non-empty string'],
        ['a zero limit', { limit: 0 }, 'limit must be a positive integer'],
        [
            'a chart kind SQL charts do not have',
            { chartKind: 'funnel', config: { type: 'funnel' } },
            'chartKind must be one of',
        ],
        [
            'a config of another kind',
            { config: { ...sqlChart.chart.config, type: 'line' } },
            'config must be an object whose type is chartKind',
        ],
        ['an unknown field', { metricQuery: {} }, 'unknown fields metricQuery'],
    ])('rejects %s', (_label, change, message) => {
        expect(() =>
            parseDocumentContent(
                2,
                content({
                    ...sqlChart,
                    chart: { ...sqlChart.chart, ...change },
                }),
            ),
        ).toThrow(message);
    });

    test('describes a SQL chart to agents without an Explore', () => {
        expect(
            getDocumentSummaryMarkdown(
                parseDocumentContent(2, content(sqlChart)),
            ),
        ).toBe(
            '<document-chart id="c1" title="Revenue by region" type="vertical_bar" source="sql">',
        );
    });
});
