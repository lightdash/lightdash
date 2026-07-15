import { type HomepageBlock, type HomepageConfig } from '@lightdash/common';
import {
    addBlock,
    canMoveDown,
    canMoveUp,
    duplicateBlock,
    moveBlockDown,
    moveBlockUp,
    removeBlock,
    updateBlockConfig,
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
        const config = makeConfig([[block('a'), block('b')]]);
        const result = duplicateBlock(config, 'a');
        expect(result.rows[0].blocks).toHaveLength(3);
        expect(result.rows[0].blocks[1].config.content).toBe('a');
        expect(result.rows[0].blocks[1].id).not.toBe('a');
    });

    it('duplicateBlock overflows a full row into a new row below', () => {
        const config = makeConfig([
            [block('a'), block('b'), block('c')],
            [block('d')],
        ]);
        const result = duplicateBlock(config, 'b');
        expect(result.rows).toHaveLength(3);
        expect(result.rows[0].blocks).toHaveLength(3);
        expect(result.rows[1].blocks[0].config.content).toBe('b');
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

    it('updateBlockConfig replaces only the target block config', () => {
        const config = makeConfig([[block('a'), block('b')]]);
        const result = updateBlockConfig(config, 'a', { content: 'edited' });
        expect(result.rows[0].blocks[0].config.content).toBe('edited');
        expect(result.rows[0].blocks[1].config.content).toBe('b');
    });

    it('operations never mutate the input config', () => {
        const config = makeConfig([[block('a')], [block('b')]]);
        const snapshot = JSON.parse(JSON.stringify(config));
        addBlock(config, block('x'));
        removeBlock(config, 'a');
        duplicateBlock(config, 'a');
        moveBlockDown(config, 'a');
        updateBlockConfig(config, 'a', { content: 'x' });
        expect(config).toEqual(snapshot);
    });
});
