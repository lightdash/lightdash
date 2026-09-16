import { MergeJoinType } from '../types/mergeQuery';
import { ChartType } from '../types/savedCharts';
import { DOCUMENT_SCHEMA_VERSION, parseDocumentContent } from './document';

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
const markdown = { id: 'intro', type: 'markdown', content: '# Findings' };
const semantic = {
    id: 'orders',
    type: 'chart',
    content: { source: 'semantic', chart },
};
const merge = {
    ...semantic,
    id: 'merged-orders',
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
    },
};

describe('Document schema version 1', () => {
    test.each([semantic, merge])(
        'rejects custom visualization bindings inside a supported source',
        (cell) => {
            expect(() =>
                parseDocumentContent(1, {
                    cells: [
                        {
                            ...cell,
                            content: {
                                ...cell.content,
                                chart: {
                                    ...cell.content.chart,
                                    chartConfig: {
                                        type: ChartType.DATA_APP_VIZ,
                                    },
                                },
                            },
                        },
                    ],
                }),
            ).toThrow('Custom chart types are not supported');
        },
    );

    test('rejects otherwise valid three-source merges in version 1', () => {
        const definition = merge.content.chart.merge;
        expect(() =>
            parseDocumentContent(1, {
                cells: [
                    {
                        ...merge,
                        content: {
                            ...merge.content,
                            chart: {
                                ...merge.content.chart,
                                merge: {
                                    ...definition,
                                    sources: [
                                        ...definition.sources,
                                        {
                                            id: 'c',
                                            kind: 'query',
                                            metricQuery: query,
                                        },
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
                        },
                    },
                ],
            }),
        ).toThrow('Invalid merge sources or join keys');
    });

    test('rejects transient references on merge sources', () => {
        const definition = merge.content.chart.merge;
        expect(() =>
            parseDocumentContent(1, {
                cells: [
                    {
                        ...merge,
                        content: {
                            ...merge.content,
                            chart: {
                                ...merge.content.chart,
                                merge: {
                                    ...definition,
                                    sources: definition.sources.map(
                                        (source) => ({
                                            ...source,
                                            queryUuid: 'temporary-result',
                                        }),
                                    ),
                                },
                            },
                        },
                    },
                ],
            }),
        ).toThrow('Invalid merge sources or join keys');
    });

    test.each([[], [markdown], [semantic], [merge], [markdown, semantic]])(
        'preserves valid ordered content: %j',
        (...cells) => {
            const content = { cells };
            expect(parseDocumentContent(1, content)).toEqual({
                cells: cells.map((cell) =>
                    cell.type === 'markdown'
                        ? { ...cell, content: { markdown: cell.content } }
                        : cell,
                ),
            });
        },
    );

    test('accepts an empty Document', () => {
        expect(parseDocumentContent(1, { cells: [] })).toEqual({ cells: [] });
    });

    test.each([
        { cells: [markdown, markdown] },
        { cells: [{ ...markdown, id: '' }] },
        { cells: [{ ...markdown, id: ' ' }] },
        { cells: [{ ...markdown, content: {} }] },
        { cells: [{ ...markdown, type: 'html' }] },
        { cells: [{ ...semantic, content: { source: 'sql', chart } }] },
        { cells: [{ ...semantic, content: { source: 'composer', chart } }] },
        {
            cells: [
                { ...semantic, content: { source: 'customChartType', chart } },
            ],
        },
        {
            cells: [
                {
                    ...semantic,
                    content: {
                        source: 'semantic',
                        chart: {
                            ...chart,
                            metricQuery: { ...query, metrics: 1 },
                        },
                    },
                },
            ],
        },
        {
            cells: [
                {
                    ...semantic,
                    content: {
                        source: 'semantic',
                        chart: {
                            ...chart,
                            metricQuery: { ...query, queryUuid: 'temporary' },
                        },
                    },
                },
            ],
        },
        {
            cells: [
                {
                    ...semantic,
                    content: {
                        source: 'semantic',
                        chart: { ...chart, chartConfig: { type: 'unknown' } },
                    },
                },
            ],
        },
        {
            cells: [
                {
                    ...merge,
                    content: {
                        ...merge.content,
                        chart: {
                            ...merge.content.chart,
                            merge: {
                                ...merge.content.chart.merge,
                                primarySourceId: 'missing',
                            },
                        },
                    },
                },
            ],
        },
        {
            cells: [
                {
                    ...merge,
                    content: {
                        ...merge.content,
                        chart: {
                            ...merge.content.chart,
                            merge: {
                                ...merge.content.chart.merge,
                                joinType: 'unknown',
                            },
                        },
                    },
                },
            ],
        },
        {
            cells: [
                {
                    ...merge,
                    content: {
                        ...merge.content,
                        chart: {
                            ...merge.content.chart,
                            merge: {
                                ...merge.content.chart.merge,
                                joinKey: [],
                            },
                        },
                    },
                },
            ],
        },
        {
            cells: [
                {
                    ...semantic,
                    content: { source: 'semantic', chart: merge.content.chart },
                },
            ],
        },
        { cells: [], unexpected: true },
    ])('rejects malformed or unsupported content: %j', (content) => {
        expect(() => parseDocumentContent(1, content)).toThrow();
    });

    test.each([0, 4, -1])(
        'rejects unsupported schema version %s',
        (version) => {
            expect(() => parseDocumentContent(version, { cells: [] })).toThrow(
                'Unsupported Document schema version',
            );
        },
    );
});

describe('Document schema version 2', () => {
    const currentMarkdown = {
        ...markdown,
        content: { markdown: markdown.content },
    };

    test.each([currentMarkdown, semantic, merge])(
        'omits retired titles while preserving content and historical input',
        (cell) => {
            const untitled = { cells: [cell] };
            expect(
                parseDocumentContent(DOCUMENT_SCHEMA_VERSION, untitled),
            ).toEqual(untitled);
            const titled = {
                cells: [
                    {
                        ...cell,
                        content: { ...cell.content, title: '  Findings  ' },
                    },
                ],
            };
            const before = structuredClone(titled);
            expect(parseDocumentContent(2, titled)).toEqual(untitled);
            expect(titled).toEqual(before);
        },
    );

    test.each(['', ' ', '\t\n', 1, null])(
        'rejects invalid titles %j for every cell kind',
        (title) => {
            for (const cell of [currentMarkdown, semantic, merge]) {
                expect(() =>
                    parseDocumentContent(2, {
                        cells: [
                            { ...cell, content: { ...cell.content, title } },
                        ],
                    }),
                ).toThrow('Invalid Document content');
            }
        },
    );

    test('upcasts legacy content without mutating it or inferring titles', () => {
        const legacy = { cells: [markdown, semantic, merge] };
        const snapshot = JSON.parse(JSON.stringify(legacy));
        const result = parseDocumentContent(1, legacy);
        expect(result).toEqual({ cells: [currentMarkdown, semantic, merge] });
        expect(legacy).toEqual(snapshot);
        expect(result).not.toBe(legacy);
        result.cells.forEach((cell) =>
            expect(cell.content).not.toHaveProperty('title'),
        );
    });

    test.each([
        { cells: [markdown] },
        {
            cells: [
                { ...currentMarkdown, content: { title: 'Missing markdown' } },
            ],
        },
        { cells: [{ ...currentMarkdown, content: { markdown: 1 } }] },
        {
            cells: [
                {
                    ...currentMarkdown,
                    content: { markdown: '', unknown: true },
                },
            ],
        },
        { cells: [{ ...currentMarkdown, title: 'Wrong location' }] },
        { cells: [currentMarkdown, currentMarkdown] },
    ])('rejects malformed V2 content %j', (content) => {
        expect(() => parseDocumentContent(2, content)).toThrow();
    });

    test.each([
        currentMarkdown,
        { ...semantic, content: { ...semantic.content, title: 'New title' } },
    ])('rejects V2 fields at the strict legacy boundary', (cell) => {
        expect(() => parseDocumentContent(1, { cells: [cell] })).toThrow(
            'Invalid Document content',
        );
    });
});

describe('Document schema version 3', () => {
    const currentMarkdown = {
        ...markdown,
        content: { markdown: markdown.content },
    };

    test.each([currentMarkdown, semantic, merge])(
        'preserves current content exactly',
        (cell) => {
            const content = { cells: [cell] };
            expect(parseDocumentContent(3, content)).toEqual(content);
        },
    );

    test.each([currentMarkdown, semantic, merge])(
        'rejects retired and speculative content metadata',
        (cell) => {
            for (const extra of [
                { title: 'Retired' },
                { metadata: {} },
                { futureField: true },
            ]) {
                expect(() =>
                    parseDocumentContent(3, {
                        cells: [
                            { ...cell, content: { ...cell.content, ...extra } },
                        ],
                    }),
                ).toThrow('Invalid Document content');
            }
        },
    );

    test('rejects string markdown on current writes', () => {
        expect(() => parseDocumentContent(3, { cells: [markdown] })).toThrow(
            'Invalid Document content',
        );
    });
});
