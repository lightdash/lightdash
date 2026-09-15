import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';

describe('document contents', () => {
    test('uses the same GFM text as the rendered heading', () => {
        expect(
            getDocumentHeadings([
                { id: 'gfm', type: 'markdown', content: '## ~~Old~~ New' },
            ])[0].label,
        ).toBe('Old New');
    });
    test('uses Markdown headings, excluding code and lower-level detail', () => {
        expect(
            getDocumentHeadings([
                {
                    id: 'analysis',
                    type: 'markdown',
                    content:
                        '# Overview\n\n## **Revenue** and `orders`\n\n### Detail\n\n```md\n## Not a heading\n```',
                },
            ]).map((heading) => heading.label),
        ).toEqual(['Overview', 'Revenue and orders']);
    });

    test('keeps repeated headings distinct within and across cells', () => {
        const headings = getDocumentHeadings([
            {
                id: 'first',
                type: 'markdown',
                content: '## Results\n\n## Results',
            },
            { id: 'second', type: 'markdown', content: '## Results' },
        ]);
        expect(headings.map((heading) => heading.label)).toEqual([
            'Results',
            'Results',
            'Results',
        ]);
        expect(new Set(headings.map((heading) => heading.id)).size).toBe(3);
        expect(headings[2].id).toBe(getDocumentHeadingId('second', 0));
    });

    test('includes nested headings and setext headings in rendered order', () => {
        expect(
            getDocumentHeadings([
                {
                    id: 'nested',
                    type: 'markdown',
                    content:
                        'Overview\n===\n\n> ## Quoted section\n\nNext\n---',
                },
            ]).map((heading) => heading.label),
        ).toEqual(['Overview', 'Quoted section', 'Next']);
    });
});
