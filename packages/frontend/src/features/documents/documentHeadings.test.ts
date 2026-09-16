import { ChartType } from '@lightdash/common';
import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';

describe('document contents', () => {
    test('keeps chart cell and Markdown offset namespaces distinct', () => {
        const headings = getDocumentHeadings([
            {
                id: 'intro',
                type: 'markdown',
                content: { markdown: '# Overview' },
            },
            {
                id: 'intro-0',
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
            { id: 'document-heading-intro-0', label: 'Overview' },
            { id: 'document-chart-intro-0', label: 'Overview' },
        ]);
        expect(getDocumentHeadingId('intro-0')).not.toBe(
            getDocumentHeadingId('intro', 0),
        );
        expect(getDocumentHeadingId('intro', 0)).toBe(
            'document-heading-intro-0',
        );
        expect(getDocumentHeadingId('intro-0')).toBe('document-chart-intro-0');
    });

    test('omits empty headings from navigation', () => {
        expect(
            getDocumentHeadings([
                {
                    id: 'empty',
                    type: 'markdown',
                    content: { markdown: '#\n\n##' },
                },
            ]),
        ).toEqual([]);
    });
    test('indexes H1/H2 with rendered inline text and full-source offsets', () => {
        const markdown =
            'Intro\n\n# **Overview** :smile:\n\n## ~~Old~~ Results\n\n### Detail\n\n```md\n## Not a heading\n```';
        expect(
            getDocumentHeadings([
                { id: 'first', type: 'markdown', content: { markdown } },
            ]),
        ).toEqual([
            {
                id: getDocumentHeadingId('first', markdown.indexOf('# **')),
                label: 'Overview 😄',
            },
            {
                id: getDocumentHeadingId('first', markdown.indexOf('## ~~')),
                label: 'Old Results',
            },
        ]);
    });
    test('keeps repeated and setext headings distinct across cells', () => {
        const cells = [
            {
                id: 'first',
                type: 'markdown' as const,
                content: { markdown: 'Results\n===\n\n## Results' },
            },
            {
                id: 'second',
                type: 'markdown' as const,
                content: { markdown: '## Results' },
            },
        ];
        const headings = getDocumentHeadings(cells);
        expect(headings.map(({ label }) => label)).toEqual([
            'Results',
            'Results',
            'Results',
        ]);
        expect(new Set(headings.map(({ id }) => id)).size).toBe(3);
        expect(headings[2].id).toBe('document-heading-second-0');
    });
    test('returns no contents for untitled prose or an empty document', () => {
        expect(getDocumentHeadings([])).toEqual([]);
        expect(
            getDocumentHeadings([
                {
                    id: 'intro',
                    type: 'markdown',
                    content: { markdown: 'Plain text' },
                },
            ]),
        ).toEqual([]);
    });
});
