import { type DocumentCellV2 } from '@lightdash/common';
import { getDocumentHeadingId, getDocumentHeadings } from './documentHeadings';

describe('document contents', () => {
    test('indexes only explicit titles in cell order, not Markdown headings', () => {
        const cells: DocumentCellV2[] = [
            {
                id: 'first',
                type: 'markdown',
                content: { title: 'Summary', markdown: '# Ignored heading' },
            },
            {
                id: 'untitled',
                type: 'markdown',
                content: { markdown: '## Also ignored' },
            },
            {
                id: 'last',
                type: 'markdown',
                content: { title: 'Next steps', markdown: '' },
            },
        ];
        expect(getDocumentHeadings(cells)).toEqual([
            { id: 'document-first', label: 'Summary' },
            { id: 'document-last', label: 'Next steps' },
        ]);
    });

    test('keeps duplicate titles distinct and anchors stable across content edits and reordering', () => {
        const first: DocumentCellV2 = {
            id: 'first / cell',
            type: 'markdown',
            content: { title: 'Results', markdown: '' },
        };
        const second: DocumentCellV2 = {
            id: 'second',
            type: 'markdown',
            content: { title: 'Results', markdown: '' },
        };
        expect(getDocumentHeadings([first, second])).toEqual([
            { id: getDocumentHeadingId(first.id), label: 'Results' },
            { id: getDocumentHeadingId(second.id), label: 'Results' },
        ]);
        expect(getDocumentHeadingId(first.id)).toBe(
            'document-first%20%2F%20cell',
        );
        expect(
            getDocumentHeadings([
                second,
                {
                    ...first,
                    content: { title: 'Updated', markdown: 'More text' },
                },
            ])[1].id,
        ).toBe(getDocumentHeadingId(first.id));
    });

    test('returns no contents for an empty document', () => {
        expect(getDocumentHeadings([])).toEqual([]);
    });
});
