import { ChartType } from '@lightdash/common';
import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';

describe('document contents', () => {
    test('indexes Markdown H1s but not chart names', () => {
        const headings = getDocumentHeadings([
            {
                type: 'markdown',
                content: { markdown: '# Overview' },
            },
            {
                type: 'chart',
                content: {
                    source: 'semantic',
                    chart: {
                        name: 'Overview',
                        tableName: 'orders',
                        chartConfig: { type: ChartType.TABLE },
                        metricQuery: {
                            exploreName: 'orders',
                            dimensions: [],
                            metrics: [],
                            filters: {},
                            sorts: [],
                            tableCalculations: [],
                            limit: 100,
                        },
                    },
                },
            },
        ]);
        expect(headings).toEqual([
            { id: 'document-heading-0-0', label: 'Overview' },
        ]);
        expect(getDocumentHeadingId(0, 0)).toBe('document-heading-0-0');
    });

    test('omits empty headings from navigation', () => {
        expect(
            getDocumentHeadings([
                {
                    type: 'markdown',
                    content: { markdown: '#\n\n##' },
                },
            ]),
        ).toEqual([]);
    });
    test('indexes only H1 with rendered inline text and full-source offsets', () => {
        const markdown =
            'Intro\n\n# **Overview** :smile:\n\n## ~~Old~~ Results\n\n### Detail\n\n```md\n## Not a heading\n```';
        expect(
            getDocumentHeadings([{ type: 'markdown', content: { markdown } }]),
        ).toEqual([
            {
                id: getDocumentHeadingId(0, markdown.indexOf('# **')),
                label: 'Overview 😄',
            },
        ]);
    });
    test('keeps repeated and setext headings distinct across cells', () => {
        const cells = [
            {
                type: 'markdown' as const,
                content: { markdown: 'Results\n===\n\n# Results' },
            },
            {
                type: 'markdown' as const,
                content: { markdown: '# Results' },
            },
        ];
        const headings = getDocumentHeadings(cells);
        expect(headings.map(({ label }) => label)).toEqual([
            'Results',
            'Results',
            'Results',
        ]);
        expect(new Set(headings.map(({ id }) => id)).size).toBe(3);
        expect(headings[2].id).toBe('document-heading-1-0');
    });
    test('returns no contents for untitled prose or an empty document', () => {
        expect(getDocumentHeadings([])).toEqual([]);
        expect(
            getDocumentHeadings([
                {
                    type: 'markdown',
                    content: { markdown: 'Plain text' },
                },
            ]),
        ).toEqual([]);
    });
});
