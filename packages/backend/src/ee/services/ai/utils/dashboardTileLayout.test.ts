import { ChartType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartTileSize, placeTile } from './dashboardTileLayout';

type Tile = { x: number; y: number; w: number; h: number };

// Tiles in `start` existed before the turn; tiles placed here may be resized.
const layOut = (types: ChartType[], start: Tile[] = []) => {
    const placedThisTurn = new Set<Tile>();
    return types.reduce<Tile[]>((tiles, type) => {
        const { tiles: existing, placed } = placeTile(
            tiles,
            getChartTileSize(type),
            (tile) => placedThisTurn.has(tile),
        );
        const next = existing.map((tile, i) => {
            if (placedThisTurn.has(tiles[i])) placedThisTurn.add(tile);
            return tile;
        });
        placedThisTurn.add(placed);
        return [...next, placed];
    }, start);
};

describe('placeTile', () => {
    it('lays out charts in rows and widens a closed row to the full grid', () => {
        expect(
            layOut([
                ChartType.BIG_NUMBER,
                ChartType.CARTESIAN,
                ChartType.CARTESIAN,
                ChartType.CARTESIAN,
                ChartType.TABLE,
            ]),
        ).toEqual([
            { x: 0, y: 0, w: 12, h: 9 },
            { x: 12, y: 0, w: 24, h: 9 },
            { x: 0, y: 9, w: 18, h: 9 },
            { x: 18, y: 9, w: 18, h: 9 },
            { x: 0, y: 18, w: 36, h: 9 },
        ]);
    });

    it('never resizes tiles that were on the dashboard before', () => {
        const before = [
            { x: 0, y: 0, w: 9, h: 6 },
            { x: 9, y: 0, w: 18, h: 9 },
        ];
        expect(layOut([ChartType.TABLE], before)).toEqual([
            ...before,
            { x: 0, y: 9, w: 36, h: 9 },
        ]);
    });

    it('never covers a taller tile from an earlier row', () => {
        const before = [
            { x: 0, y: 0, w: 18, h: 9 },
            { x: 18, y: 0, w: 18, h: 20 },
            { x: 0, y: 9, w: 18, h: 9 },
        ];
        expect(layOut([ChartType.CARTESIAN], before)).toEqual([
            ...before,
            { x: 0, y: 20, w: 18, h: 9 },
        ]);
    });
});
