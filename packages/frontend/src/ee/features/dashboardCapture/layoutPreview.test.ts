import { type CaptureLayoutOp } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type LayoutTile } from './applyLayoutOps';
import { hasSameLayout, reapplyLayoutPreview } from './layoutPreview';

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

const swap: CaptureLayoutOp = {
    type: 'swap',
    tileUuid: 'rev',
    withTileUuid: 'ord',
};

describe('reapplyLayoutPreview', () => {
    it('puts the preview back on tiles loaded from the server', () => {
        const result = reapplyLayoutPreview(board(), [swap], 36);
        expect(layout(result.tiles)).toEqual({
            rev: [18, 0, 18, 6],
            ord: [0, 0, 18, 6],
            tbl: [0, 6, 36, 8],
        });
        expect(result.ops).toEqual([swap]);
    });

    it('keeps a tile the server added and still applies the preview', () => {
        const serverTiles = [...board(), tile('new', 0, 14, 36, 4)];
        const result = reapplyLayoutPreview(serverTiles, [swap], 36);
        expect(layout(result.tiles)).toEqual({
            rev: [18, 0, 18, 6],
            ord: [0, 0, 18, 6],
            tbl: [0, 6, 36, 8],
            new: [0, 14, 36, 4],
        });
    });

    it('replays changes from several recordings in order', () => {
        const move: CaptureLayoutOp = {
            type: 'move',
            tileUuid: 'tbl',
            x: 0,
            y: 0,
        };
        const result = reapplyLayoutPreview(board(), [swap, move], 36);
        expect(layout(result.tiles)).toEqual({
            tbl: [0, 0, 36, 8],
            ord: [0, 8, 18, 6],
            rev: [18, 8, 18, 6],
        });
        expect(result.ops).toEqual([swap, move]);
    });

    it('drops a change whose tile is gone and keeps the rest', () => {
        const resize: CaptureLayoutOp = {
            type: 'resize',
            tileUuid: 'tbl',
            w: 36,
            h: 4,
        };
        const serverTiles = board().filter((t) => t.uuid !== 'ord');
        const result = reapplyLayoutPreview(serverTiles, [swap, resize], 36);
        expect(layout(result.tiles)).toEqual({
            rev: [0, 0, 18, 6],
            tbl: [0, 6, 36, 4],
        });
        expect(result.ops).toEqual([resize]);
    });

    it('returns the server tiles and no changes when every tile is gone', () => {
        const serverTiles = [tile('tbl', 0, 0, 36, 8)];
        const result = reapplyLayoutPreview(serverTiles, [swap], 36);
        expect(result.tiles).toBe(serverTiles);
        expect(result.ops).toEqual([]);
    });

    it('reports no changes when the preview ends up matching the server', () => {
        const serverTiles = board();
        const result = reapplyLayoutPreview(serverTiles, [swap, swap], 36);
        expect(result.tiles).toBe(serverTiles);
        expect(result.ops).toEqual([]);
    });
});

describe('hasSameLayout', () => {
    it('is true for the same tiles in the same places', () => {
        expect(hasSameLayout(board(), board().reverse())).toBe(true);
    });

    it('is false when a tile has moved', () => {
        const moved = reapplyLayoutPreview(board(), [swap], 36).tiles;
        expect(hasSameLayout(moved, board())).toBe(false);
    });

    it('is false when a tile was added or removed', () => {
        expect(hasSameLayout(board(), board().slice(1))).toBe(false);
        expect(hasSameLayout(board().slice(1), board())).toBe(false);
    });
});
