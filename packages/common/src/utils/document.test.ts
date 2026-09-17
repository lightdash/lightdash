import { MergeJoinType } from '../types/mergeQuery';
import { ChartType } from '../types/savedCharts';
import {
    DOCUMENT_SCHEMA_VERSION,
    getDocumentUrl,
    parseDocumentContent,
} from './document';

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
const markdown = { type: 'markdown', content: { markdown: '# Findings' } };
const semantic = {
    type: 'chart',
    content: { source: 'semantic', chart },
};
const merge = {
    ...semantic,
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
            expect(
                parseDocumentContent(DOCUMENT_SCHEMA_VERSION, content),
            ).toEqual(content);
        },
    );

    test('accepts an empty Document', () => {
        expect(parseDocumentContent(1, { cells: [] })).toEqual({ cells: [] });
    });

    test.each([
        { cells: [{ ...markdown, id: 'intro' }] },
        { cells: [{ ...markdown, content: '# Findings' }] },
        { cells: [{ ...markdown, content: { markdown: 1 } }] },
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

    test.each([0, 2, 3, 4, -1])(
        'rejects unsupported schema version %s',
        (version) => {
            expect(() => parseDocumentContent(version, { cells: [] })).toThrow(
                'Unsupported Document schema version',
            );
        },
    );
});

describe('Document cell identity', () => {
    test('preserves duplicate cells and ordering without generating IDs', () => {
        const content = {
            cells: [markdown, semantic, markdown, semantic, merge],
        };
        const snapshot = structuredClone(content);
        expect(parseDocumentContent(1, content)).toEqual(content);
        expect(content).toEqual(snapshot);
        content.cells.forEach((cell) => expect(cell).not.toHaveProperty('id'));
    });

    test.each([markdown, semantic, merge])(
        'rejects unsupported content metadata',
        (cell) => {
            for (const extra of [
                { title: 'Title' },
                { metadata: {} },
                { futureField: true },
            ]) {
                expect(() =>
                    parseDocumentContent(1, {
                        cells: [
                            { ...cell, content: { ...cell.content, ...extra } },
                        ],
                    }),
                ).toThrow('Invalid Document content');
            }
        },
    );
});
