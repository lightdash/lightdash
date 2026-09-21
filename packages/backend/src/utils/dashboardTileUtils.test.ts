import { ChartType, type SavedChart } from '@lightdash/common';
import { createDashboardChartTiles } from './dashboardTileUtils';

const chart = (uuid: string, type = ChartType.CARTESIAN) =>
    ({
        uuid,
        name: uuid,
        slug: uuid,
        chartConfig: { type, config: {} },
    }) as SavedChart;

describe('dashboard chart tile placement', () => {
    it('preserves chart identity while applying positions in a different visual order', () => {
        const positions = [
            { x: 0, y: 10, w: 36, h: 8 },
            { x: 0, y: 0, w: 36, h: 10 },
        ];
        const tiles = createDashboardChartTiles(
            [chart('first'), chart('second')],
            'tab',
            positions,
        );
        expect(tiles.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual(
            positions,
        );
        expect(tiles.map((tile) => tile.properties.savedChartUuid)).toEqual([
            'first',
            'second',
        ]);
        expect(
            tiles.every(
                (tile) =>
                    tile.tabUuid === 'tab' &&
                    tile.properties.belongsToDashboard,
            ),
        ).toBe(true);
    });

    it('preserves the existing two-column fallback without supplied positions', () => {
        const tiles = createDashboardChartTiles([
            chart('kpi', ChartType.BIG_NUMBER),
            chart('trend'),
            chart('kpi-2', ChartType.BIG_NUMBER),
            chart('kpi-3', ChartType.BIG_NUMBER),
            chart('trend-2'),
        ]);
        expect(tiles.map((tile) => tile.x)).toEqual([0, 18, 0, 18, 0]);
        expect(tiles.map((tile) => tile.y)).toEqual([0, 0, 6, 6, 18]);
    });
});
