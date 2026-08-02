import {
    type HomepageBlock,
    type HomepageCollectionItemRef,
    type HomepageConfig,
} from '@lightdash/common';
import {
    addBlock,
    canAddColumn,
    canDropInRow,
    canPlaceBlockInRow,
    canMoveDown,
    canMoveUp,
    dropExistingBlock,
    dropNewBlock,
    duplicateBlock,
    moveBlockDown,
    moveBlockUp,
    removeBlock,
    reorderCollectionItems,
    replaceBlock,
} from './configOps';

const block = (id: string, content = id): HomepageBlock => ({
    id,
    type: 'markdown',
    config: { content },
});

const makeConfig = (rows: HomepageBlock[][]): HomepageConfig => ({
    version: 1,
    rows: rows.map((blocks, i) => ({ id: `row-${i}`, blocks })),
});

describe('configOps', () => {
    it('addBlock appends a new single-block row', () => {
        const config = makeConfig([[block('a')]]);
        const result = addBlock(config, block('b'));
        expect(result.rows).toHaveLength(2);
        expect(result.rows[1].blocks.map((b) => b.id)).toEqual(['b']);
    });

    it('removeBlock drops the block and its emptied row', () => {
        const config = makeConfig([[block('a')], [block('b')]]);
        const result = removeBlock(config, 'a');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].blocks[0].id).toBe('b');
    });

    it('removeBlock with unknown id returns config unchanged', () => {
        const config = makeConfig([[block('a')]]);
        expect(removeBlock(config, 'nope')).toBe(config);
    });

    it('duplicateBlock copies within the row when there is space', () => {
        const config = makeConfig([[block('a')]]);
        const result = duplicateBlock(config, 'a');
        expect(result.rows[0].blocks).toHaveLength(2);
        expect(result.rows[0].blocks[1].config).toEqual({ content: 'a' });
        expect(result.rows[0].blocks[1].id).not.toBe('a');
    });

    it('duplicateBlock overflows a full row into a new row below', () => {
        const config = makeConfig([[block('a'), block('b')], [block('d')]]);
        const result = duplicateBlock(config, 'b');
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0].blocks).toHaveLength(2);
        expect(result.rows[1].blocks[0].config).toEqual({ content: 'b' });
        expect(result.rows[2].blocks[0].id).toBe('d');
    });

    it('moveBlockDown swaps single-block rows', () => {
        const config = makeConfig([[block('a')], [block('b')]]);
        const result = moveBlockDown(config, 'a');
        expect(result.rows.map((r) => r.blocks[0].id)).toEqual(['b', 'a']);
    });

    it('moveBlockUp extracts a block from a multi-block row', () => {
        const config = makeConfig([[block('a'), block('b')]]);
        const result = moveBlockUp(config, 'b');
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].blocks.map((b) => b.id)).toEqual(['b']);
        expect(result.rows[1].blocks.map((b) => b.id)).toEqual(['a']);
    });

    it('move at the boundary is a no-op', () => {
        const config = makeConfig([[block('a')], [block('b')]]);
        expect(moveBlockUp(config, 'a')).toBe(config);
        expect(moveBlockDown(config, 'b')).toBe(config);
    });

    it('canMoveUp/Down reflect boundaries and multi-block rows', () => {
        const config = makeConfig([[block('a')], [block('b'), block('c')]]);
        expect(canMoveUp(config, 'a')).toBe(false);
        expect(canMoveDown(config, 'a')).toBe(true);
        expect(canMoveUp(config, 'b')).toBe(true);
        expect(canMoveDown(config, 'c')).toBe(true);
    });

    it('replaceBlock replaces only the target block', () => {
        const config = makeConfig([[block('a'), block('b')]]);
        const result = replaceBlock(config, block('a', 'edited'));
        expect(result.rows[0].blocks[0].config).toEqual({ content: 'edited' });
        expect(result.rows[0].blocks[1].config).toEqual({ content: 'b' });
    });

    describe('drag & drop', () => {
        it('dropNewBlock into a cell places it side-by-side', () => {
            const config = makeConfig([[block('a')]]);
            const result = dropNewBlock(config, block('x'), {
                kind: 'cell',
                rowIndex: 0,
                blockIndex: 1,
            });
            expect(result.rows[0].blocks.map((b) => b.id)).toEqual(['a', 'x']);
        });

        it('dropNewBlock into a full row is a no-op', () => {
            const config = makeConfig([[block('a'), block('b'), block('c')]]);
            const result = dropNewBlock(config, block('x'), {
                kind: 'cell',
                rowIndex: 0,
                blockIndex: 1,
            });
            expect(result.rows[0].blocks).toHaveLength(3);
        });

        it('dropNewBlock between rows inserts a new row', () => {
            const config = makeConfig([[block('a')], [block('b')]]);
            const result = dropNewBlock(config, block('x'), {
                kind: 'row',
                rowIndex: 1,
            });
            expect(result.rows.map((r) => r.blocks[0].id)).toEqual([
                'a',
                'x',
                'b',
            ]);
        });

        it('dropExistingBlock re-nests into another row', () => {
            const config = makeConfig([[block('a')], [block('b')]]);
            const result = dropExistingBlock(config, 'a', {
                kind: 'cell',
                rowIndex: 1,
                blockIndex: 1,
            });
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].blocks.map((b) => b.id)).toEqual(['b', 'a']);
        });

        it('dropExistingBlock adjusts indices when the source row empties', () => {
            const config = makeConfig([
                [block('a')],
                [block('b')],
                [block('c')],
            ]);
            const result = dropExistingBlock(config, 'a', {
                kind: 'row',
                rowIndex: 3,
            });
            expect(result.rows.map((r) => r.blocks[0].id)).toEqual([
                'b',
                'c',
                'a',
            ]);
        });

        it('dropExistingBlock beside itself is a no-op', () => {
            const config = makeConfig([[block('a'), block('b')]]);
            expect(
                dropExistingBlock(config, 'a', {
                    kind: 'cell',
                    rowIndex: 0,
                    blockIndex: 1,
                }),
            ).toBe(config);
        });

        it('dropExistingBlock reorders within the same row', () => {
            const config = makeConfig([[block('a'), block('b')]]);
            const result = dropExistingBlock(config, 'a', {
                kind: 'cell',
                rowIndex: 0,
                blockIndex: 2,
            });
            expect(result.rows[0].blocks.map((b) => b.id)).toEqual(['b', 'a']);
        });

        it('canDropInRow respects the column cap but allows same-row moves', () => {
            const config = makeConfig([[block('a'), block('b')]]);
            expect(canDropInRow(config, 0)).toBe(false);
            expect(canDropInRow(config, 0, 'a')).toBe(true);
        });
    });

    describe('fullRowOnly (ask-ai-hero)', () => {
        const askAi = (id = 'ask'): HomepageBlock => ({
            id,
            type: 'ask-ai-hero',
            config: { showGreeting: true },
        });

        it('dropNewBlock into a cell of a row containing ask-ai is a no-op', () => {
            const config = makeConfig([[askAi()]]);
            const result = dropNewBlock(config, block('x'), {
                kind: 'cell',
                rowIndex: 0,
                blockIndex: 1,
            });
            expect(result).toEqual(config);
        });

        it('dropNewBlock of ask-ai into an occupied row is a no-op', () => {
            const config = makeConfig([[block('a')]]);
            const result = dropNewBlock(config, askAi(), {
                kind: 'cell',
                rowIndex: 0,
                blockIndex: 1,
            });
            expect(result).toEqual(config);
        });

        it('dropExistingBlock cannot move a block beside ask-ai', () => {
            const config = makeConfig([[askAi()], [block('b')]]);
            const result = dropExistingBlock(config, 'b', {
                kind: 'cell',
                rowIndex: 0,
                blockIndex: 1,
            });
            expect(result).toEqual(config);
        });

        it('dropExistingBlock cannot move ask-ai beside another block', () => {
            const config = makeConfig([[askAi()], [block('b')]]);
            const result = dropExistingBlock(config, 'ask', {
                kind: 'cell',
                rowIndex: 1,
                blockIndex: 0,
            });
            expect(result).toEqual(config);
        });

        it('dropExistingBlock can still move ask-ai to its own new row', () => {
            const config = makeConfig([[askAi()], [block('b')]]);
            const result = dropExistingBlock(config, 'ask', {
                kind: 'row',
                rowIndex: 2,
            });
            expect(result.rows).toHaveLength(2);
            expect(result.rows.map((r) => r.blocks[0].id)).toEqual([
                'b',
                'ask',
            ]);
        });

        it('duplicateBlock of ask-ai lands in its own new row', () => {
            const config = makeConfig([[askAi()]]);
            const result = duplicateBlock(config, 'ask');
            expect(result.rows).toHaveLength(2);
            expect(result.rows.every((r) => r.blocks.length === 1)).toBe(true);
        });

        it('canPlaceBlockInRow is false for a row containing ask-ai', () => {
            const config = makeConfig([[askAi()]]);
            expect(canPlaceBlockInRow(config, 0, 'markdown')).toBe(false);
        });

        it('canPlaceBlockInRow is false for ask-ai into an occupied row', () => {
            const config = makeConfig([[block('a')]]);
            expect(canPlaceBlockInRow(config, 0, 'ask-ai-hero')).toBe(false);
        });

        it('canPlaceBlockInRow allows normal side-by-side placement', () => {
            const config = makeConfig([[block('a')]]);
            expect(canPlaceBlockInRow(config, 0, 'markdown')).toBe(true);
        });

        it('canDropInRow is false when the target row holds ask-ai', () => {
            const config = makeConfig([[askAi()], [block('b')]]);
            expect(canDropInRow(config, 0, 'b')).toBe(false);
        });

        it('canAddColumn is false on an ask-ai row', () => {
            const config = makeConfig([[askAi()], [block('b')]]);
            expect(canAddColumn(config, 0)).toBe(false);
            expect(canAddColumn(config, 1)).toBe(true);
        });
    });

    it('operations never mutate the input config', () => {
        const config = makeConfig([[block('a')], [block('b')]]);
        const snapshot = JSON.parse(JSON.stringify(config));
        addBlock(config, block('x'));
        removeBlock(config, 'a');
        duplicateBlock(config, 'a');
        moveBlockDown(config, 'a');
        replaceBlock(config, block('a', 'x'));
        expect(config).toEqual(snapshot);
    });
});

describe('reorderCollectionItems', () => {
    const ref = (uuid: string): HomepageCollectionItemRef => ({
        contentType: 'chart',
        uuid,
    });
    const items = [ref('a'), ref('b'), ref('c'), ref('d')];

    it('moves an item forward past the drop target', () => {
        expect(
            reorderCollectionItems(items, 'a', 'c').map((i) => i.uuid),
        ).toEqual(['b', 'c', 'a', 'd']);
    });

    it('moves an item backward to the drop target position', () => {
        expect(
            reorderCollectionItems(items, 'd', 'b').map((i) => i.uuid),
        ).toEqual(['a', 'd', 'b', 'c']);
    });

    it('is a no-op for unknown uuids or same position', () => {
        expect(reorderCollectionItems(items, 'x', 'b')).toBe(items);
        expect(reorderCollectionItems(items, 'b', 'x')).toBe(items);
        expect(reorderCollectionItems(items, 'b', 'b')).toBe(items);
    });

    it('does not mutate the input array', () => {
        const input = [ref('a'), ref('b')];
        reorderCollectionItems(input, 'b', 'a');
        expect(input.map((i) => i.uuid)).toEqual(['a', 'b']);
    });
});
