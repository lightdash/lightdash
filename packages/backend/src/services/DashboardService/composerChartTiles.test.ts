import {
    DashboardTileTypes,
    type DashboardComposerChartTile,
} from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import { duplicateComposerChartTiles } from './composerChartTiles';

const tile = (
    uuid: string,
    composerChartUuid: string | null,
): DashboardComposerChartTile => ({
    uuid,
    type: DashboardTileTypes.COMPOSER_CHART,
    x: 0,
    y: 0,
    h: 3,
    w: 6,
    tabUuid: undefined,
    properties: {
        title: '',
        hideTitle: false,
        composerChartUuid,
        chartName: null,
        chartSlug: null,
    },
});

describe('duplicateComposerChartTiles', () => {
    test("copies the dashboard's own charts, keeps showing a space's live chart and empties a trashed or deleted one", async () => {
        const composerChartModel = {
            findOwnedByDashboard: vi.fn(async () => ['owned-chart']),
            findLiveInSpaces: vi.fn(async () => ['space-chart']),
            duplicate: vi.fn(async () => 'copied-chart'),
        };

        const copies = await duplicateComposerChartTiles(
            composerChartModel,
            [
                tile('owned-tile', 'owned-chart'),
                tile('space-tile', 'space-chart'),
                tile('trashed-tile', 'trashed-chart'),
                tile('deleted-tile', null),
            ],
            { dashboardUuid: 'source-dashboard' },
            { dashboardUuid: 'new-dashboard', userUuid: 'user' },
        );

        expect(composerChartModel.findOwnedByDashboard).toHaveBeenCalledWith(
            'source-dashboard',
            ['owned-chart', 'space-chart', 'trashed-chart'],
        );
        expect(composerChartModel.duplicate).toHaveBeenCalledTimes(1);
        expect(composerChartModel.duplicate).toHaveBeenCalledWith(
            'owned-chart',
            { dashboardUuid: 'new-dashboard', userUuid: 'user' },
        );
        expect(
            copies.map(({ from, tile: copy }) => [
                from,
                copy.properties.composerChartUuid,
            ]),
        ).toEqual([
            ['owned-tile', 'copied-chart'],
            ['space-tile', 'space-chart'],
            ['trashed-tile', null],
            ['deleted-tile', null],
        ]);
        copies.forEach(({ from, tile: copy }) =>
            expect(copy.uuid).not.toBe(from),
        );
    });
});
