import { ChartType } from '../types/savedCharts';
import {
    assignDocumentChartIds,
    getDocumentSummaryMarkdown,
    joinDocumentBlocks,
    matchDocumentChartKeys,
    parseDocumentBlocks,
} from './documentMarkdown';

const chart = (name: string) => ({
    source: 'semantic' as const,
    chart: {
        name,
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_count'],
            filters: {},
            sorts: [],
            limit: 1,
            tableCalculations: [],
        },
        chartConfig: { type: ChartType.BIG_NUMBER },
    },
});

describe('parseDocumentBlocks', () => {
    test('splits markdown at block tags and keeps the tag attributes', () => {
        expect(
            parseDocumentBlocks(
                '# Title\n\nIntro\n\n<document-chart id="c1" title="A &quot;B&quot;">\n\nOutro',
                ['document-chart'],
            ),
        ).toEqual([
            { type: 'markdown', markdown: '# Title\n\nIntro' },
            {
                type: 'tag',
                line: '<document-chart id="c1" title="A &quot;B&quot;">',
                tag: {
                    name: 'document-chart',
                    attributes: { id: 'c1', title: 'A "B"' },
                },
            },
            { type: 'markdown', markdown: 'Outro' },
        ]);
    });

    test.each([
        ['inside a code fence', '```\n<document-chart id="c1">\n```'],
        ['indented', '  <document-chart id="c1">'],
        ['inline', 'See <document-chart id="c1"> here'],
        ['in a quote', '> <document-chart id="c1">'],
        ['of another name', '<artifact-chart version="x">'],
    ])('leaves a tag %s as markdown', (_label, markdown) => {
        expect(parseDocumentBlocks(markdown, ['document-chart'])).toEqual([
            { type: 'markdown', markdown },
        ]);
    });

    test('accepts self-closing and explicitly closed tags', () => {
        expect(
            parseDocumentBlocks(
                '<document-chart id="c1" />\n<document-chart id="c2"></document-chart>',
                ['document-chart'],
            ).map((block) => block.type === 'tag' && block.tag.attributes.id),
        ).toEqual(['c1', 'c2']);
    });

    test('round-trips through joinDocumentBlocks', () => {
        const markdown =
            '# Title\n\n<document-chart id="c1">\n\n- a\n- b\n\n<document-chart id="c2">';
        expect(
            joinDocumentBlocks(
                parseDocumentBlocks(markdown, ['document-chart']),
            ),
        ).toBe(markdown);
    });
});

describe('assignDocumentChartIds', () => {
    test('keeps stored ids and numbers new keys after the highest id', () => {
        const { content, nextChartNumber } = assignDocumentChartIds(
            {
                markdown:
                    '<document-chart id="revenue">\n\n<document-chart id="c2">\n\n<document-chart id="orders">',
                charts: {
                    revenue: chart('Revenue'),
                    c2: chart('Kept'),
                    orders: chart('Orders'),
                },
            },
            1,
        );
        expect(content.markdown).toBe(
            '<document-chart id="c3">\n\n<document-chart id="c2">\n\n<document-chart id="c4">',
        );
        expect(content.charts.c3.chart.name).toBe('Revenue');
        expect(content.charts.c4.chart.name).toBe('Orders');
        expect(nextChartNumber).toBe(5);
    });

    test('never reuses the id of a removed chart', () => {
        const { content, nextChartNumber } = assignDocumentChartIds(
            {
                markdown: '<document-chart id="new">',
                charts: { new: chart('New') },
            },
            4,
        );
        expect(Object.keys(content.charts)).toEqual(['c4']);
        expect(nextChartNumber).toBe(5);
    });
});

describe('getDocumentSummaryMarkdown', () => {
    test('describes each chart in its tag', () => {
        expect(
            getDocumentSummaryMarkdown({
                markdown: '# Q3\n\n<document-chart id="c1">',
                charts: { c1: chart('Revenue') },
            }),
        ).toBe(
            '# Q3\n\n<document-chart id="c1" title="Revenue" type="big_number" explore="orders">',
        );
    });
});

describe('matchDocumentChartKeys', () => {
    test('gives a re-sent chart its stored id and leaves changed charts new', () => {
        const previous = {
            markdown: '<document-chart id="c3">\n\n<document-chart id="c4">',
            charts: { c3: chart('Revenue'), c4: chart('Orders') },
        };
        expect(
            matchDocumentChartKeys(
                {
                    markdown:
                        '<document-chart id="c3">\n\n<document-chart id="again">\n\n<document-chart id="changed">',
                    charts: {
                        c3: chart('Revenue'),
                        again: chart('Orders'),
                        changed: chart('Different'),
                    },
                },
                previous,
            ).markdown,
        ).toBe(
            '<document-chart id="c3">\n\n<document-chart id="c4">\n\n<document-chart id="changed">',
        );
    });

    test('matches a stored chart only once', () => {
        const { charts } = matchDocumentChartKeys(
            {
                markdown: '<document-chart id="a">\n\n<document-chart id="b">',
                charts: { a: chart('Revenue'), b: chart('Revenue') },
            },
            { markdown: '', charts: { c1: chart('Revenue') } },
        );
        expect(Object.keys(charts)).toEqual(['c1', 'b']);
    });
});
