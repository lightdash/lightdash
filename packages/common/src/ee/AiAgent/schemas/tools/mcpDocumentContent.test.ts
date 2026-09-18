import { MergeJoinType } from '../../../../types/mergeQuery';
import { ChartType } from '../../../../types/savedCharts';
import { parseDocumentContent } from '../../../../utils/document';
import {
    documentAsCodeSchema,
    mcpCreateContentArgsSchema,
    mcpDocumentCellSchema,
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
const markdown = {
    type: 'markdown',
    content: { markdown: '## Findings\n\nOrders are shown below.' },
};
const semantic = {
    type: 'chart',
    content: { source: 'semantic', chart },
};
const merge = {
    type: 'chart',
    content: {
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
    },
};
const document = {
    name: 'Order review',
    slug: 'order-review',
    description: 'A review of orders',
    spaceSlug: 'reports',
    schemaVersion: 1,
    content: { cells: [markdown, semantic, merge] },
};
const baseVersionUuid = '9e8f3019-5299-43cd-a8b7-ab60a895d9cf';

describe('MCP Document content', () => {
    test('preserves Markdown, semantic charts and durable merge definitions', () => {
        const parsed = documentAsCodeSchema.parse(document);
        expect(parsed).toEqual(document);
        expect(
            parseDocumentContent(parsed.schemaVersion, parsed.content).cells,
        ).toEqual(document.content.cells);
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
            }),
        ).toEqual({ type: 'document', slug: document.slug });
    });

    test.each(['sql', 'composer', 'saved_chart', 'artifact'])(
        'rejects unsupported chart source %s',
        (source) => {
            expect(
                mcpDocumentCellSchema.safeParse({
                    ...semantic,
                    content: { ...semantic.content, source },
                }).success,
            ).toBe(false);
        },
    );

    test.each([
        { ...markdown, id: 'client-id' },
        { ...markdown, title: 'Extra title' },
        { ...markdown, content: { ...markdown.content, title: 'Extra title' } },
        { ...semantic, content: { ...semantic.content, title: 'Extra title' } },
        { ...markdown, content: '# Legacy Markdown' },
        {
            ...semantic,
            content: { ...semantic.content, queryUuid: baseVersionUuid },
        },
        { ...semantic, content: { ...semantic.content, rows: [] } },
    ])('rejects legacy or unsupported cell fields: %j', (cell) => {
        expect(mcpDocumentCellSchema.safeParse(cell).success).toBe(false);
    });

    test('rejects transient merge sources at the tool boundary', () => {
        expect(
            mcpDocumentCellSchema.safeParse({
                ...merge,
                content: {
                    ...merge.content,
                    chart: {
                        ...merge.content.chart,
                        merge: {
                            ...merge.content.chart.merge,
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
                },
            }).success,
        ).toBe(false);
    });

    test.each(['queryUuid', 'rows', 'results'])(
        'authoritative validation rejects transient %s inside a metric query',
        (key) => {
            const cell = mcpDocumentCellSchema.parse({
                ...semantic,
                content: {
                    ...semantic.content,
                    chart: {
                        ...chart,
                        metricQuery: {
                            ...query,
                            [key]: key === 'queryUuid' ? baseVersionUuid : [],
                        },
                    },
                },
            });
            expect(() => parseDocumentContent(1, { cells: [cell] })).toThrow();
        },
    );

    test('authoritative validation rejects transient fields in merge legs', () => {
        const cell = mcpDocumentCellSchema.parse({
            ...merge,
            content: {
                ...merge.content,
                chart: {
                    ...merge.content.chart,
                    merge: {
                        ...merge.content.chart.merge,
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
            },
        });
        expect(() => parseDocumentContent(1, { cells: [cell] })).toThrow();
    });

    test.each([0, 2, 3, 4])(
        'rejects unsupported write schema version %s',
        (schemaVersion) => {
            expect(
                documentAsCodeSchema.safeParse({ ...document, schemaVersion })
                    .success,
            ).toBe(false);
        },
    );

    test.each([document.content, { cells: [] }])(
        'accepts whole-content replacement %j',
        (content) => {
            const edit = {
                type: 'content',
                baseVersionUuid,
                content,
            };
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
        },
    );

    test.each([
        {
            type: 'content',
            content: document.content,
        },
        {
            type: 'content',
            baseVersionUuid: 'stale',
            content: document.content,
        },
        { type: 'content', baseVersionUuid, operations: [] },
        {
            type: 'content',
            baseVersionUuid,
            operations: [{ type: 'remove', index: 0 }],
        },
        {
            type: 'content',
            baseVersionUuid,
            operations: [{ type: 'move_after', cellId: 'introduction' }],
        },
        {
            type: 'content',
            baseVersionUuid,
            operations: [{ type: 'add', path: '/cells/0', value: markdown }],
        },
        { type: 'metadata', spaceSlug: 'another-space' },
    ])('rejects invalid edit shape %j', (edit) => {
        expect(mcpDocumentEditSchema.safeParse(edit).success).toBe(false);
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
        expect(toolCreateContentArgsSchema.shape.type.options).toEqual([
            'dashboard',
            'chart',
        ]);
        expect(toolEditContentArgsSchema.shape.type.options).toEqual([
            'dashboard',
            'chart',
        ]);
        expect(toolReadContentArgsSchema.shape.type.options).toEqual([
            'dashboard',
            'chart',
            'data_app',
        ]);
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
