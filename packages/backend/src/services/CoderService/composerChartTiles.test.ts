import {
    DashboardTileTypes,
    type ComposerChartOwner,
    type DashboardTileWithSlug,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { resolveComposerChartTiles } from './composerChartTiles';

const uploaded = (chartSlug: string | null): DashboardTileWithSlug =>
    ({
        uuid: `tile-${chartSlug}`,
        tileSlug: undefined,
        type: DashboardTileTypes.COMPOSER_CHART,
        x: 0,
        y: 0,
        h: 6,
        w: 12,
        tabUuid: null,
        properties: { title: 'Orders', hideTitle: false, chartSlug },
    }) as unknown as DashboardTileWithSlug;

const markdown = {
    uuid: 'tile-markdown',
    tileSlug: undefined,
    type: DashboardTileTypes.MARKDOWN,
    x: 0,
    y: 0,
    h: 1,
    w: 1,
    tabUuid: null,
    properties: { title: '', content: 'hello' },
} as DashboardTileWithSlug;

const charts = new Map<string, { uuid: string; owner: ComposerChartOwner }>([
    [
        'mine',
        {
            uuid: 'mine-uuid',
            owner: { type: 'dashboard', dashboardUuid: 'dashboard-uuid' },
        },
    ],
    [
        'theirs',
        {
            uuid: 'theirs-uuid',
            owner: { type: 'dashboard', dashboardUuid: 'other-dashboard' },
        },
    ],
    [
        'in-space',
        { uuid: 'space-chart-uuid', owner: { type: 'space', spaceUuid: 's' } },
    ],
]);

const resolve = (
    tiles: DashboardTileWithSlug[],
    options: Partial<Parameters<typeof resolveComposerChartTiles>[1]> = {},
) =>
    resolveComposerChartTiles(tiles, {
        charts,
        dashboardUuid: 'dashboard-uuid',
        flagEnabled: true,
        shownTilesByChartUuid: new Map(),
        ...options,
    });

describe('composer chart tiles uploaded as code', () => {
    it('points a tile at the composer chart its dashboard owns, leaving other tiles alone', () => {
        expect(resolve([uploaded('mine'), markdown])).toEqual([
            {
                ...uploaded('mine'),
                properties: {
                    title: 'Orders',
                    hideTitle: false,
                    chartSlug: 'mine',
                    composerChartUuid: 'mine-uuid',
                    chartName: null,
                },
            },
            markdown,
        ]);
    });

    it('fails naming the slug when no composer chart has it', () => {
        expect(() => resolve([uploaded('missing')])).toThrow(
            'Composer chart "missing" was not found in this project',
        );
    });

    it('fails naming the slug when another dashboard owns the chart', () => {
        expect(() => resolve([uploaded('theirs')])).toThrow(
            'Composer chart "theirs" belongs to another dashboard',
        );
    });

    it("points a tile at a space's chart, also on a dashboard the upload creates", () => {
        [{}, { dashboardUuid: null }].forEach((options) =>
            expect(
                resolve([uploaded('in-space')], options)[0].properties,
            ).toMatchObject({ composerChartUuid: 'space-chart-uuid' }),
        );
    });

    it('keeps a tile whose chart is gone as an empty tile', () => {
        expect(resolve([uploaded(null)])[0].properties).toEqual({
            title: 'Orders',
            hideTitle: false,
            chartSlug: null,
            composerChartUuid: null,
            chartName: null,
        });
    });

    it('keeps an empty tile the dashboard already shows when composer charts are off, and refuses a new one', () => {
        expect(
            resolve([uploaded(null)], {
                flagEnabled: false,
                shownTilesByChartUuid: new Map([[null, 1]]),
            })[0].properties,
        ).toMatchObject({ composerChartUuid: null });
        expect(() =>
            resolve([uploaded(null), uploaded(null)], {
                flagEnabled: false,
                shownTilesByChartUuid: new Map([[null, 1]]),
            }),
        ).toThrow(/not enabled/);
    });

    it('fails for a dashboard the upload creates, which owns no chart yet', () => {
        expect(() =>
            resolve([uploaded('mine')], { dashboardUuid: null }),
        ).toThrow('Composer chart "mine" belongs to another dashboard');
    });

    it('keeps a tile the dashboard already shows when composer charts are off', () => {
        expect(
            resolve([uploaded('mine')], {
                flagEnabled: false,
                shownTilesByChartUuid: new Map([['mine-uuid', 1]]),
            })[0].properties,
        ).toMatchObject({ composerChartUuid: 'mine-uuid' });
    });

    it('refuses a second tile for a shown chart when composer charts are off', () => {
        expect(() =>
            resolve([uploaded('mine'), uploaded('mine')], {
                flagEnabled: false,
                shownTilesByChartUuid: new Map([['mine-uuid', 1]]),
            }),
        ).toThrow(/not enabled.*"mine"/);
    });

    it('refuses a new tile when composer charts are off, naming the slug', () => {
        expect(() =>
            resolve([uploaded('mine')], { flagEnabled: false }),
        ).toThrow(/not enabled.*"mine"/);
    });
});
