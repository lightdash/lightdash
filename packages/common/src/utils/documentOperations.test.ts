import type {
    DocumentCellOperation,
    DocumentCellV3,
    DocumentContentV3,
} from '../types/document';
import { applyDocumentCellOperations } from './documentOperations';

const markdown = (id: string, content = id): DocumentCellV3 => ({
    id,
    type: 'markdown',
    content: { markdown: content },
});

const original: DocumentContentV3 = {
    cells: [markdown('a'), markdown('b'), markdown('c'), markdown('d')],
};

describe('applyDocumentCellOperations', () => {
    test('replaces markdown without changing the input', () => {
        const cell: DocumentCellV3 = {
            id: 'a',
            type: 'markdown',
            content: { markdown: '# Original' },
        };
        const content = { cells: [cell] };
        const result = applyDocumentCellOperations(content, [
            {
                type: 'replace',
                cellId: 'a',
                cell: {
                    ...cell,
                    content: { markdown: '# Updated' },
                },
            },
        ]);
        expect(result.cells).toEqual([
            { ...cell, content: { markdown: '# Updated' } },
        ]);
        expect(content.cells[0].content.markdown).toBe('# Original');
    });

    test('rejects retired titles without partially changing content', () => {
        const before = structuredClone(original);
        const retiredContent = { title: 'Retired', markdown: 'Text' };
        expect(() =>
            applyDocumentCellOperations(original, [
                {
                    type: 'append',
                    cell: {
                        id: 'new',
                        type: 'markdown',
                        content: retiredContent,
                    },
                },
            ]),
        ).toThrow('Invalid Document content');
        expect(original).toEqual(before);
    });
    test.each<{
        operation: DocumentCellOperation;
        expectedIds: string[];
    }>([
        {
            operation: { type: 'append', cell: markdown('e') },
            expectedIds: ['a', 'b', 'c', 'd', 'e'],
        },
        {
            operation: {
                type: 'insert_before',
                targetCellId: 'a',
                cell: markdown('e'),
            },
            expectedIds: ['e', 'a', 'b', 'c', 'd'],
        },
        {
            operation: {
                type: 'insert_after',
                targetCellId: 'd',
                cell: markdown('e'),
            },
            expectedIds: ['a', 'b', 'c', 'd', 'e'],
        },
        {
            operation: { type: 'remove', cellId: 'b' },
            expectedIds: ['a', 'c', 'd'],
        },
        {
            operation: { type: 'move_before', cellId: 'a', targetCellId: 'c' },
            expectedIds: ['b', 'a', 'c', 'd'],
        },
        {
            operation: { type: 'move_before', cellId: 'd', targetCellId: 'b' },
            expectedIds: ['a', 'd', 'b', 'c'],
        },
        {
            operation: { type: 'move_after', cellId: 'a', targetCellId: 'c' },
            expectedIds: ['b', 'c', 'a', 'd'],
        },
        {
            operation: { type: 'move_after', cellId: 'd', targetCellId: 'b' },
            expectedIds: ['a', 'b', 'd', 'c'],
        },
        {
            operation: { type: 'move_before', cellId: 'a', targetCellId: 'b' },
            expectedIds: ['a', 'b', 'c', 'd'],
        },
        {
            operation: { type: 'move_after', cellId: 'b', targetCellId: 'a' },
            expectedIds: ['a', 'b', 'c', 'd'],
        },
    ])(
        '$operation.type preserves stable ordering: $expectedIds',
        ({ operation, expectedIds }) => {
            expect(applyDocumentCellOperations(original, [operation])).toEqual({
                cells: expectedIds.map((id) => markdown(id)),
            });
        },
    );

    test('replaces the cell contents without changing its ID or position', () => {
        expect(
            applyDocumentCellOperations(original, [
                {
                    type: 'replace',
                    cellId: 'b',
                    cell: markdown('b', '# Updated'),
                },
            ]),
        ).toEqual({
            cells: [
                markdown('a'),
                markdown('b', '# Updated'),
                markdown('c'),
                markdown('d'),
            ],
        });
    });

    test('addresses cells added and reordered earlier in the same batch', () => {
        const operations: DocumentCellOperation[] = [
            { type: 'append', cell: markdown('e') },
            { type: 'insert_before', targetCellId: 'e', cell: markdown('f') },
            { type: 'insert_after', targetCellId: 'f', cell: markdown('g') },
            { type: 'move_before', cellId: 'e', targetCellId: 'a' },
            {
                type: 'replace',
                cellId: 'e',
                cell: markdown('e', 'New heading'),
            },
            { type: 'remove', cellId: 'f' },
            { type: 'move_after', cellId: 'g', targetCellId: 'e' },
        ];
        expect(applyDocumentCellOperations(original, operations)).toEqual({
            cells: [
                markdown('e', 'New heading'),
                markdown('g'),
                ...original.cells,
            ],
        });
    });

    test('can create the first cell and remove the last cell', () => {
        const created = applyDocumentCellOperations({ cells: [] }, [
            { type: 'append', cell: markdown('a') },
        ]);
        expect(created).toEqual({ cells: [markdown('a')] });
        expect(
            applyDocumentCellOperations(created, [
                { type: 'remove', cellId: 'a' },
            ]),
        ).toEqual({ cells: [] });
    });

    test.each<DocumentCellOperation>([
        { type: 'append', cell: markdown('a') },
        { type: 'insert_before', targetCellId: 'b', cell: markdown('a') },
        { type: 'insert_after', targetCellId: 'b', cell: markdown('a') },
    ])('rejects duplicate IDs during $type', (operation) => {
        expect(() =>
            applyDocumentCellOperations(original, [operation]),
        ).toThrow('Document cell IDs must be unique');
    });

    test('rejects ambiguous intermediate IDs even if a later operation removes one', () => {
        expect(() =>
            applyDocumentCellOperations(original, [
                { type: 'append', cell: markdown('a') },
                { type: 'remove', cellId: 'a' },
            ]),
        ).toThrow('Document cell IDs must be unique');
    });

    test.each<DocumentCellOperation>([
        { type: 'insert_before', targetCellId: 'missing', cell: markdown('e') },
        { type: 'insert_after', targetCellId: 'missing', cell: markdown('e') },
        { type: 'replace', cellId: 'missing', cell: markdown('missing') },
        { type: 'remove', cellId: 'missing' },
        { type: 'move_before', cellId: 'missing', targetCellId: 'a' },
        { type: 'move_after', cellId: 'missing', targetCellId: 'a' },
        { type: 'move_before', cellId: 'a', targetCellId: 'missing' },
        { type: 'move_after', cellId: 'a', targetCellId: 'missing' },
    ])('rejects unknown cell IDs during $type', (operation) => {
        expect(() =>
            applyDocumentCellOperations(original, [operation]),
        ).toThrow('Document cell not found: missing');
    });

    test('rejects references to a cell removed earlier in the batch', () => {
        expect(() =>
            applyDocumentCellOperations(original, [
                { type: 'remove', cellId: 'a' },
                {
                    type: 'insert_after',
                    targetCellId: 'a',
                    cell: markdown('e'),
                },
            ]),
        ).toThrow('Document cell not found: a');
    });

    test('rejects replacing a cell with a different ID', () => {
        expect(() =>
            applyDocumentCellOperations(original, [
                { type: 'replace', cellId: 'a', cell: markdown('e') },
            ]),
        ).toThrow('Replacing a Document cell must preserve its ID');
    });

    test.each(['move_before', 'move_after'] as const)(
        'rejects self-referential %s',
        (type) => {
            expect(() =>
                applyDocumentCellOperations(original, [
                    { type, cellId: 'a', targetCellId: 'a' },
                ]),
            ).toThrow('A Document cell cannot be moved relative to itself');
        },
    );

    test('rejects an empty operation batch', () => {
        expect(() => applyDocumentCellOperations(original, [])).toThrow(
            'At least one Document cell operation is required',
        );
    });

    test('validates the resulting document instead of returning malformed cells', () => {
        expect(() =>
            applyDocumentCellOperations(original, [
                { type: 'append', cell: markdown(' ') },
            ]),
        ).toThrow('Invalid Document content');
    });

    test('does not mutate input content or operation payloads on success', () => {
        const content = structuredClone(original);
        const operations: DocumentCellOperation[] = [
            { type: 'replace', cellId: 'a', cell: markdown('a', 'Changed') },
            { type: 'move_after', cellId: 'b', targetCellId: 'd' },
        ];
        const before = structuredClone(operations);
        applyDocumentCellOperations(content, operations);
        expect(content).toEqual(original);
        expect(operations).toEqual(before);
    });

    test.each<DocumentCellOperation>([
        { type: 'move_after', cellId: 'b', targetCellId: 'missing' },
        { type: 'append', cell: markdown(' ') },
        { type: 'append', cell: markdown('c') },
    ])(
        'does not mutate the input after a partially applied batch fails at $type',
        (failure) => {
            const content = structuredClone(original);
            const operations: DocumentCellOperation[] = [
                {
                    type: 'replace',
                    cellId: 'a',
                    cell: markdown('a', 'Changed'),
                },
                { type: 'remove', cellId: 'd' },
                failure,
            ];
            const before = structuredClone(operations);
            expect(() =>
                applyDocumentCellOperations(content, operations),
            ).toThrow();
            expect(content).toEqual(original);
            expect(operations).toEqual(before);
        },
    );
});
