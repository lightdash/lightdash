import { ChartType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartTileSize, placeTile } from './dashboardTileLayout';

describe('placeTile', () => {
    it('lays out charts in rows across the 36-column grid', () => {
        const placed = [
            ChartType.BIG_NUMBER,
            ChartType.CARTESIAN,
            ChartType.CARTESIAN,
            ChartType.CARTESIAN,
            ChartType.TABLE,
        ].reduce<Array<{ x: number; y: number; w: number; h: number }>>(
            (tiles, type) => [
                ...tiles,
                placeTile(tiles, getChartTileSize(type)),
            ],
            [],
        );
        expect(placed).toEqual([
            { x: 0, y: 0, w: 9, h: 6 },
            { x: 9, y: 0, w: 18, h: 9 },
            { x: 0, y: 9, w: 18, h: 9 },
            { x: 18, y: 9, w: 18, h: 9 },
            { x: 0, y: 18, w: 36, h: 9 },
        ]);
    });
});
