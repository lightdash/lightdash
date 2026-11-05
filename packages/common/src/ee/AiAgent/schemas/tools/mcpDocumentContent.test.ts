import { MergeJoinType } from '../../../../types/mergeQuery';
import { ChartType } from '../../../../types/savedCharts';
import { parseDocumentContent } from '../../../../utils/document';
import {
    documentAsCodeSchema,
    mcpCreateContentArgsSchema,
    mcpDocumentChartSchema,
    mcpDocumentEditSchema,
    mcpEditContentArgsSchema,
    mcpReadContentArgsSchema,
} from './mcpDocumentContent';
import { toolCreateContentArgsSchema } from './toolCreateContentArgs';
import { toolEditContentArgsSchema } from './toolEditContentArgs';
import { toolReadContentArgsSchema } from './toolReadContentArgs';

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
            joinKey: [
                {
                    name: 'status',
                    fieldIdBySourceId: {
                        a: 'orders_status',
                        b: 'orders_status',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
        },
    },
};
const markdown =
    '## Findings\n\nOrders are shown below.\n\n<document-chart id="orders">\n\n<document-chart id="merged">';
const document = {
    name: 'Order review',
    slug: 'order-review',
    description: 'A review of orders',
    spaceSlug: 'reports',
    schemaVersion: 2,
    markdown,
    charts: { orders: semantic, merged: merge },
};
const baseVersionUuid = '9e8f3019-5299-43cd-a8b7-ab60a895d9cf';

const withChart = (content: unknown) => ({
    ...document,
    markdown: '<document-chart id="orders">',
    charts: { orders: content },
});

describe('MCP Document content', () => {
    test('preserves Markdown, semantic charts and durable merge definitions', () => {
        const parsed = documentAsCodeSchema.parse(document);
        expect(parsed).toEqual(document);
        expect(
            parseDocumentContent(parsed.schemaVersion, {
                markdown: parsed.markdown,
                charts: parsed.charts,
            }),
        ).toEqual({
            markdown,
            charts: document.charts,
        });
        expect(
            mcpCreateContentArgsSchema.parse({
                type: 'document',
                content: document,
            }),
        ).toEqual({ type: 'document', content: document });
        expect(
            mcpReadContentArgsSchema.parse({
                type: 'document',
                slug: document.slug,
                chartId: 'c1',
            }),
        ).toEqual({ type: 'document', slug: document.slug, chartId: 'c1' });
    });

    test('preserves custom chart type references by slug and version', () => {
        const custom = {
            source: 'semantic',
            chart: {
                ...chart,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizSlug: 'sprouts',
                        dataAppVizVersion: 3,
                        fieldMapping: {
                            category: 'orders_status',
                            value: 'orders_count',
                        },
                        optionValues: { showStage: true },
                    },
                },
            },
        };
        const parsed = documentAsCodeSchema.parse(withChart(custom));
        expect(
            parseDocumentContent(parsed.schemaVersion, {
                markdown: parsed.markdown,
                charts: parsed.charts,
            }).charts,
        ).toEqual({ orders: custom });
    });

    test.each(['sql', 'composer', 'saved_chart', 'artifact'])(
        'rejects unsupported chart source %s',
        (source) => {
            expect(
                mcpDocumentChartSchema.safeParse({ ...semantic, source })
                    .success,
            ).toBe(false);
        },
    );

    test.each([
        { ...semantic, id: 'client-id' },
        { ...semantic, title: 'Extra title' },
        { ...semantic, queryUuid: baseVersionUuid },
        { ...semantic, rows: [] },
        { type: 'chart', content: semantic },
    ])('rejects legacy or unsupported chart fields: %j', (content) => {
        expect(mcpDocumentChartSchema.safeParse(content).success).toBe(false);
    });

    test('rejects the version 1 cells shape', () => {
        expect(
            documentAsCodeSchema.safeParse({
                ...document,
                schemaVersion: 1,
                content: { cells: [] },
            }).success,
        ).toBe(false);
    });

    test('rejects transient merge sources at the tool boundary', () => {
        expect(
            mcpDocumentChartSchema.safeParse({
                ...merge,
                chart: {
                    ...merge.chart,
                    merge: {
                        ...merge.chart.merge,
                        sources: [
                            { id: 'a', kind: 'chart' },
                            {
                                id: 'b',
                                kind: 'query',
                                queryUuid: baseVersionUuid,
                            },
                        ],
                    },
                },
            }).success,
        ).toBe(false);
    });

    test.each(['queryUuid', 'rows', 'results'])(
        'authoritative validation rejects transient %s inside a metric query',
        (key) => {
            const parsed = documentAsCodeSchema.parse(
                withChart({
                    ...semantic,
                    chart: {
                        ...chart,
                        metricQuery: {
                            ...query,
                            [key]: key === 'queryUuid' ? baseVersionUuid : [],
                        },
                    },
                }),
            );
            expect(() =>
                parseDocumentContent(2, {
                    markdown: parsed.markdown,
                    charts: parsed.charts,
                }),
            ).toThrow();
        },
    );

    test('authoritative validation rejects transient fields in merge legs', () => {
        const parsed = documentAsCodeSchema.parse(
            withChart({
                ...merge,
                chart: {
                    ...merge.chart,
                    merge: {
                        ...merge.chart.merge,
                        sources: [
                            { id: 'a', kind: 'chart' },
                            {
                                id: 'b',
                                kind: 'query',
                                metricQuery: {
                                    ...query,
                                    queryUuid: baseVersionUuid,
                                },
                            },
                        ],
                    },
                },
            }),
        );
        expect(() =>
            parseDocumentContent(2, {
                markdown: parsed.markdown,
                charts: parsed.charts,
            }),
        ).toThrow();
    });

    test.each([0, 1, 3, 4])(
        'rejects unsupported write schema version %s',
        (schemaVersion) => {
            expect(
                documentAsCodeSchema.safeParse({ ...document, schemaVersion })
                    .success,
            ).toBe(false);
        },
    );

    test.each([
        { markdown, charts: document.charts },
        { markdown: '<document-chart id="c1">', charts: {} },
        { markdown: '', charts: {} },
    ])('accepts a markdown replacement %j', (content) => {
        const edit = { type: 'content', baseVersionUuid, ...content };
        expect(mcpDocumentEditSchema.parse(edit)).toEqual(edit);
        expect(
            mcpEditContentArgsSchema.parse({
                type: 'document',
                slug: document.slug,
                documentEdit: edit,
            }),
        ).toEqual({
            type: 'document',
            slug: document.slug,
            documentEdit: edit,
        });
    });

    test('accepts a chart patch', () => {
        const edit = {
            type: 'chart',
            baseVersionUuid,
            chartId: 'c2',
            patch: [{ op: 'replace', path: '/chart/name', value: 'Revenue' }],
        };
        expect(mcpDocumentEditSchema.parse(edit)).toEqual(edit);
    });

    test.each([
        { type: 'content', markdown, charts: {} },
        { type: 'content', baseVersionUuid: 'stale', markdown, charts: {} },
        { type: 'content', baseVersionUuid, content: { cells: [] } },
        { type: 'content', baseVersionUuid, markdown },
        { type: 'chart', baseVersionUuid, patch: [] },
        { type: 'metadata', spaceUuid: 'another-space' },
    ])('rejects invalid edit shape %j', (edit) => {
        expect(mcpDocumentEditSchema.safeParse(edit).success).toBe(false);
    });

    test('accepts saving a personal Document into a Space by slug', () => {
        const edit = { type: 'metadata', spaceSlug: 'another-space' };
        expect(mcpDocumentEditSchema.parse(edit)).toEqual(edit);
    });

    test('creates a personal Document when spaceSlug is null', () => {
        expect(
            documentAsCodeSchema.parse({ ...document, spaceSlug: null })
                .spaceSlug,
        ).toBeNull();
    });

    test('accepts metadata separately from content operations', () => {
        const edit = {
            type: 'metadata',
            name: 'Updated review',
            slug: 'updated-review',
            description: '',
        };
        expect(mcpDocumentEditSchema.parse(edit)).toEqual(edit);
    });

    test('does not add Document support to native agent contracts', () => {
        expect(toolCreateContentArgsSchema.shape.type.options).not.toContain(
            'document',
        );
        expect(toolEditContentArgsSchema.shape.type.options).not.toContain(
            'document',
        );
        expect(toolReadContentArgsSchema.shape.type.options).not.toContain(
            'document',
        );
        expect(
            toolCreateContentArgsSchema.safeParse({
                type: 'document',
                content: document,
            }).success,
        ).toBe(false);
        expect(
            toolReadContentArgsSchema.safeParse({
                type: 'document',
                slug: document.slug,
            }).success,
        ).toBe(false);
        expect(
            toolEditContentArgsSchema.safeParse({
                type: 'document',
                slug: document.slug,
                patch: [],
            }).success,
        ).toBe(false);
    });
});
