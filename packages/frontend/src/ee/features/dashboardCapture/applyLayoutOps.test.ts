import { describe, expect, it } from 'vitest';
import { applyLayoutOps, type LayoutTile } from './applyLayoutOps';

const tile = (
    uuid: string,
    x: number,
    y: number,
    w: number,
    h: number,
    tabUuid: string | null = null,
): LayoutTile => ({ uuid, x, y, w, h, tabUuid });

const layout = (tiles: LayoutTile[]) =>
    Object.fromEntries(tiles.map((t) => [t.uuid, [t.x, t.y, t.w, t.h]]));

// Two half-width charts on top, a full-width table below.
const board = () => [
    tile('rev', 0, 0, 18, 6),
    tile('ord', 18, 0, 18, 6),
    tile('tbl', 0, 6, 36, 8),
];

describe('applyLayoutOps', () => {
    it('swap trades the two tiles places and sizes', () => {
        const result = applyLayoutOps(
            board(),
            [{ type: 'swap', tileUuid: 'rev', withTileUuid: 'ord' }],
            36,
        );
        expect(layout(result.tiles)).toEqual({
            rev: [18, 0, 18, 6],
            ord: [0, 0, 18, 6],
            tbl: [0, 6, 36, 8],
        });
        expect(result.applied).toBe(1);
    });

    it('moving a tile onto others pushes them down', () => {
        const result = applyLayoutOps(
            board(),
            [{ type: 'move', tileUuid: 'tbl', x: 0, y: 0 }],
            36,
        );
        expect(layout(result.tiles)).toEqual({
            tbl: [0, 0, 36, 8],
            rev: [0, 8, 18, 6],
            ord: [18, 8, 18, 6],
        });
    });

    it('a tile moved to the bottom stays below the rest', () => {
        const result = applyLayoutOps(
            board(),
            [{ type: 'move', tileUuid: 'rev', x: 0, y: 14 }],
            36,
        );
        expect(layout(result.tiles)).toEqual({
            ord: [18, 0, 18, 6],
            tbl: [0, 6, 36, 8],
            rev: [0, 14, 18, 6],
        });
    });

    it('resizing a tile wider pushes its neighbour down', () => {
        const result = applyLayoutOps(
            board(),
            [{ type: 'resize', tileUuid: 'rev', w: 36, h: 6 }],
            36,
        );
        expect(layout(result.tiles)).toEqual({
            rev: [0, 0, 36, 6],
            ord: [18, 6, 18, 6],
            tbl: [0, 12, 36, 8],
        });
    });

    it('keeps a moved tile inside the grid', () => {
        const result = applyLayoutOps(
            [tile('a', 0, 0, 12, 4)],
            [{ type: 'move', tileUuid: 'a', x: 30, y: 0 }],
            36,
        );
        expect(layout(result.tiles)).toEqual({ a: [24, 0, 12, 4] });
    });

    it('leaves tiles on other tabs alone', () => {
        const result = applyLayoutOps(
            [tile('a', 0, 0, 36, 4, 'tab1'), tile('b', 0, 0, 36, 4, 'tab2')],
            [{ type: 'move', tileUuid: 'a', x: 0, y: 0 }],
            36,
        );
        expect(layout(result.tiles)).toEqual({
            a: [0, 0, 36, 4],
            b: [0, 0, 36, 4],
        });
    });

    it('skips operations on tiles it cannot find and reports none applied', () => {
        const before = board();
        const result = applyLayoutOps(
            before,
            [
                { type: 'move', tileUuid: 'ghost', x: 0, y: 0 },
                { type: 'swap', tileUuid: 'rev', withTileUuid: 'ghost' },
            ],
            36,
        );
        expect(result.applied).toBe(0);
        expect(layout(result.tiles)).toEqual(layout(before));
    });

    it('does not count a change that leaves the layout as it was', () => {
        const result = applyLayoutOps(
            board(),
            [{ type: 'move', tileUuid: 'rev', x: 0, y: 0 }],
            36,
        );
        expect(result.applied).toBe(0);
    });

    it('applies several operations in order', () => {
        const result = applyLayoutOps(
            board(),
            [
                { type: 'swap', tileUuid: 'rev', withTileUuid: 'ord' },
                { type: 'resize', tileUuid: 'tbl', w: 18, h: 8 },
            ],
            36,
        );
        expect(layout(result.tiles)).toEqual({
            ord: [0, 0, 18, 6],
            rev: [18, 0, 18, 6],
            tbl: [0, 6, 18, 8],
        });
        expect(result.applied).toBe(2);
    });
});
