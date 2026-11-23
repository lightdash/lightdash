import { ChartType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartTileSize, placeTile } from './dashboardTileLayout';

type Tile = { x: number; y: number; w: number; h: number };

const layOut = (types: ChartType[], start: Tile[] = []) =>
    types.reduce<Tile[]>((tiles, type) => {
        const { tiles: existing, placed } = placeTile(
            tiles,
            getChartTileSize(type),
        );
        return [...existing, placed];
    }, start);

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

    it('leaves a row with hand-made sizes as it is', () => {
        expect(
            layOut([ChartType.TABLE], [{ x: 0, y: 0, w: 10, h: 4 }]),
        ).toEqual([
            { x: 0, y: 0, w: 10, h: 4 },
            { x: 0, y: 4, w: 36, h: 9 },
        ]);
    });
});
