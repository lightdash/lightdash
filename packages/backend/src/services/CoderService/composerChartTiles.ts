import {
    DashboardTileTypes,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type DashboardComposerChartTile,
    type DashboardComposerChartTileAsCode,
    type DashboardTile,
    type DashboardTileWithSlug,
} from '@lightdash/common';

export const isNotComposerChartTile = (
    tile: DashboardTile,
): tile is Exclude<DashboardTile, DashboardComposerChartTile> =>
    tile.type !== DashboardTileTypes.COMPOSER_CHART;

/** A tile whose chart is gone is written with a null slug, as classic chart tiles are. */
export const toComposerChartTileAsCode = (
    { x, y, h, w, properties }: DashboardComposerChartTile,
    slugs: Pick<DashboardComposerChartTileAsCode, 'tabSlug' | 'tileSlug'>,
): DashboardComposerChartTileAsCode => ({
    uuid: undefined,
    type: DashboardTileTypes.COMPOSER_CHART,
    x,
    y,
    h,
    w,
    ...slugs,
    properties: {
        title: properties.title,
        hideTitle: properties.hideTitle,
        chartSlug: properties.chartSlug ?? null,
    },
});

/**
 * Points each uploaded composer tile at the composer chart named by its slug.
 * Only composer charts are searched, and the dashboard must own the chart.
 * A null slug is a tile whose chart is gone.
 */
export const resolveComposerChartTiles = (
    tiles: DashboardTileWithSlug[],
    {
        charts,
        dashboardUuid,
        flagEnabled,
        shownTilesByChartUuid,
    }: {
        charts: ReadonlyMap<string, { uuid: string; dashboardUuid: string }>;
        /** Null when the upload creates the dashboard. */
        dashboardUuid: string | null;
        flagEnabled: boolean;
        /** Tiles per chart the dashboard shows now; the most kept with the flag off. */
        shownTilesByChartUuid: ReadonlyMap<string, number>;
    },
): DashboardTileWithSlug[] => {
    const keepable = new Map(shownTilesByChartUuid);
    return tiles.map((tile) => {
        if (tile.type !== DashboardTileTypes.COMPOSER_CHART) return tile;
        const { chartSlug } = tile.properties as unknown as Pick<
            DashboardComposerChartTileAsCode['properties'],
            'chartSlug'
        >;
        if (chartSlug === null) {
            return {
                ...tile,
                properties: {
                    title: tile.properties.title,
                    hideTitle: tile.properties.hideTitle,
                    chartSlug: null,
                    composerChartUuid: null,
                    chartName: null,
                },
            } as DashboardTileWithSlug;
        }
        if (typeof chartSlug !== 'string') {
            throw new ParameterError('A composer chart tile needs a chartSlug');
        }
        const chart = charts.get(chartSlug);
        if (!chart) {
            throw new NotFoundError(
                `Composer chart "${chartSlug}" was not found in this project. Upload it first, then re-upload this dashboard.`,
            );
        }
        if (chart.dashboardUuid !== dashboardUuid) {
            throw new ParameterError(
                `Composer chart "${chartSlug}" belongs to another dashboard`,
            );
        }
        if (!flagEnabled) {
            const left = keepable.get(chart.uuid) ?? 0;
            if (left === 0) {
                throw new ForbiddenError(
                    `Composer charts are not enabled for this organization, so composer chart tile "${chartSlug}" cannot be added`,
                    { featureFlagId: FeatureFlags.ComposerCharts },
                );
            }
            keepable.set(chart.uuid, left - 1);
        }
        return {
            ...tile,
            properties: {
                title: tile.properties.title,
                hideTitle: tile.properties.hideTitle,
                chartSlug,
                composerChartUuid: chart.uuid,
                chartName: null,
            },
        } as DashboardTileWithSlug;
    });
};
