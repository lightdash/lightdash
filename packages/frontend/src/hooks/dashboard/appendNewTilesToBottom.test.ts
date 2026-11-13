import { describe, expect, it } from 'vitest';
import { appendNewTilesToBottom } from './useDashboard';

type Tile = {
    uuid: string;
    x: number;
    y: number;
    w: number;
    h: number;
    tabUuid?: string;
};

const overlaps = (a: Tile, b: Tile) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('appendNewTilesToBottom', () => {
    it('places a new tile below the lowest tile edge on a dashboard with gaps', () => {
        const existingTiles: Tile[] = [
            { uuid: 'top', x: 0, y: 0, w: 18, h: 6 },
            { uuid: 'tall', x: 18, y: 2, w: 18, h: 20 },
            { uuid: 'after-gap', x: 0, y: 24, w: 36, h: 7 },
        ];
        const newTile: Tile = { uuid: 'new', x: 0, y: 0, w: 15, h: 9 };

        const result = appendNewTilesToBottom(existingTiles, [newTile]);
        const placed = result.find((tile) => tile.uuid === 'new')!;

        expect(placed).toEqual({ uuid: 'new', x: 0, y: 31, w: 15, h: 9 });
        expect(result.slice(0, 3)).toEqual(existingTiles);
        existingTiles.forEach((tile) => {
            expect(overlaps(placed, tile)).toBe(false);
        });
    });

    it('places a new tile at the top of an empty dashboard', () => {
        const result = appendNewTilesToBottom<Tile>(undefined, [
            { uuid: 'new', x: 0, y: 5, w: 15, h: 9 },
        ]);

        expect(result).toEqual([{ uuid: 'new', x: 0, y: 0, w: 15, h: 9 }]);
    });

    it('places a new tile below the tiles of its own tab, not of other tabs', () => {
        const existingTiles: Tile[] = [
            { uuid: 'short', x: 0, y: 0, w: 36, h: 4, tabUuid: 'short' },
            { uuid: 'long', x: 0, y: 40, w: 36, h: 10, tabUuid: 'long' },
        ];

        const result = appendNewTilesToBottom(existingTiles, [
            { uuid: 'on-short', x: 0, y: 0, w: 15, h: 9, tabUuid: 'short' },
            { uuid: 'on-empty', x: 0, y: 0, w: 15, h: 9, tabUuid: 'empty' },
        ]);

        expect(result.find((tile) => tile.uuid === 'on-short')?.y).toBe(4);
        expect(result.find((tile) => tile.uuid === 'on-empty')?.y).toBe(0);
    });
});
