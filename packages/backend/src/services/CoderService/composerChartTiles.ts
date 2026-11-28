import {
    DashboardTileTypes,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type ComposerChartOwner,
    type DashboardComposerChartTile,
    type DashboardComposerChartTileAsCode,
    type DashboardTile,
    type DashboardTileWithSlug,
} from '@lightdash/common';

export const isNotComposerChartTile = (
    tile: DashboardTile,
): tile is Exclude<DashboardTile, DashboardComposerChartTile> =>
    tile.type !== DashboardTileTypes.COMPOSER_CHART;

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
 * Points each uploaded composer tile at the composer chart named by its slug:
 * the dashboard's own or a space's. A null slug keeps a tile whose chart is gone.
 */
export const resolveComposerChartTiles = (
    tiles: DashboardTileWithSlug[],
    {
        charts,
        dashboardUuid,
        flagEnabled,
        shownTilesByChartUuid,
    }: {
        charts: ReadonlyMap<
            string,
            { uuid: string; owner: ComposerChartOwner }
        >;
        /** Null when the upload creates the dashboard. */
        dashboardUuid: string | null;
        flagEnabled: boolean;
        /** Tiles per chart (null: chart gone) the dashboard shows now; the most kept with the flag off. */
        shownTilesByChartUuid: ReadonlyMap<string | null, number>;
    },
): DashboardTileWithSlug[] => {
    const keepable = new Map(shownTilesByChartUuid);
    return tiles.map((tile) => {
        if (tile.type !== DashboardTileTypes.COMPOSER_CHART) return tile;
        const { chartSlug } = tile.properties as unknown as Pick<
            DashboardComposerChartTileAsCode['properties'],
            'chartSlug'
        >;
        if (chartSlug !== null && typeof chartSlug !== 'string') {
            throw new ParameterError('A composer chart tile needs a chartSlug');
        }
        const chart = chartSlug === null ? null : charts.get(chartSlug);
        if (chart === undefined) {
            throw new NotFoundError(
                `Composer chart "${chartSlug}" was not found in this project. Upload it first, then re-upload this dashboard.`,
            );
        }
        if (
            chart?.owner.type === 'dashboard' &&
            chart.owner.dashboardUuid !== dashboardUuid
        ) {
            throw new ParameterError(
                `Composer chart "${chartSlug}" belongs to another dashboard`,
            );
        }
        const chartUuid = chart?.uuid ?? null;
        if (!flagEnabled) {
            const left = keepable.get(chartUuid) ?? 0;
            if (left === 0) {
                throw new ForbiddenError(
                    `Composer charts are not enabled for this organization, so composer chart tile ${chartSlug === null ? 'with no chart' : `"${chartSlug}"`} cannot be added`,
                    { featureFlagId: FeatureFlags.ComposerCharts },
                );
            }
            keepable.set(chartUuid, left - 1);
        }
        return {
            ...tile,
            properties: {
                title: tile.properties.title,
                hideTitle: tile.properties.hideTitle,
                chartSlug,
                composerChartUuid: chartUuid,
                chartName: null,
            },
        } as DashboardTileWithSlug;
    });
};
