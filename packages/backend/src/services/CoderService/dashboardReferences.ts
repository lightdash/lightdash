import {
    DashboardTileTypes,
    type DashboardAsCode,
    type DashboardConfig,
    type DashboardDAO,
    type DashboardTile,
    type DashboardTileAsCode,
    type DashboardTileTarget,
    type DashboardTileWithSlug,
    type DateZoomTileTarget,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';

type AnyChartTile = Extract<
    DashboardTileAsCode | DashboardTile,
    {
        type: DashboardTileTypes.SAVED_CHART | DashboardTileTypes.SQL_CHART;
    }
>;

export const isAnyChartTile = (
    tile: DashboardTileAsCode | DashboardTile,
): tile is AnyChartTile =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART;

export const getChartSlugForTileUuid = (
    dashboard: DashboardDAO,
    uuid: string,
): string | undefined => {
    const tile = dashboard.tiles.find((item) => item.uuid === uuid);
    if (!tile || !isAnyChartTile(tile) || tile.properties.chartSlug == null) {
        return undefined;
    }
    const matchingTiles = dashboard.tiles.filter(
        (item) =>
            isAnyChartTile(item) &&
            item.properties.chartSlug === tile.properties.chartSlug,
    );
    if (matchingTiles.length > 1) {
        const index = matchingTiles.findIndex((item) => item.uuid === uuid);
        return `${tile.properties.chartSlug}-${index + 1}`;
    }
    return tile.properties.chartSlug;
};

export const getFiltersWithTileSlugs = (
    dashboard: DashboardDAO,
): Required<NonNullable<DashboardAsCode['filters']>> => ({
    ...dashboard.filters,
    dimensions: dashboard.filters.dimensions.map((filter) => ({
        ...filter,
        id: undefined,
        tileTargets: Object.entries(filter.tileTargets ?? {}).reduce<
            Record<string, DashboardTileTarget>
        >((result, [tileUuid, target]) => {
            const tileSlug = getChartSlugForTileUuid(dashboard, tileUuid);
            return tileSlug ? { ...result, [tileSlug]: target } : result;
        }, {}),
    })),
});

const findTileUuid = (
    tiles: DashboardTileWithSlug[],
    tileSlug: string,
): string | undefined =>
    tiles.find(
        (tile) =>
            isAnyChartTile(tile) &&
            (tile.tileSlug === tileSlug ||
                tile.properties.chartSlug === tileSlug),
    )?.uuid;

export const getFiltersWithTileUuids = (
    dashboard: DashboardAsCode,
    tiles: DashboardTileWithSlug[],
): DashboardDAO['filters'] => ({
    metrics: dashboard.filters?.metrics ?? [],
    tableCalculations: dashboard.filters?.tableCalculations ?? [],
    dimensions: (dashboard.filters?.dimensions ?? []).map((filter) => ({
        ...filter,
        id: uuidv4(),
        tileTargets: Object.entries(filter.tileTargets ?? {}).reduce<
            Record<string, DashboardTileTarget>
        >((result, [tileSlug, target]) => {
            const tileUuid = findTileUuid(tiles, tileSlug);
            if (!tileUuid) {
                console.error(
                    `Tile with slug ${tileSlug} not found in tilesWithUuids`,
                );
                return result;
            }
            return { ...result, [tileUuid]: target };
        }, {}),
    })),
});

export const getConfigWithDateZoomTileSlugs = (
    dashboard: DashboardDAO,
): DashboardConfig | undefined => {
    const { config } = dashboard;
    if (!config?.dateZoomConfig) return config;
    const tileTargets = Object.entries(
        config.dateZoomConfig.tileTargets ?? {},
    ).reduce<Record<string, DateZoomTileTarget>>(
        (result, [tileUuid, target]) => {
            const tileSlug = getChartSlugForTileUuid(dashboard, tileUuid);
            return tileSlug ? { ...result, [tileSlug]: target } : result;
        },
        {},
    );
    return {
        ...config,
        dateZoomConfig: { ...config.dateZoomConfig, tileTargets },
    };
};

export const getConfigWithDateZoomTileUuids = (
    config: DashboardConfig,
    tiles: DashboardTileWithSlug[],
): DashboardConfig => {
    if (!config.dateZoomConfig) return config;
    const tileTargets = Object.entries(
        config.dateZoomConfig.tileTargets ?? {},
    ).reduce<Record<string, DateZoomTileTarget>>(
        (result, [tileSlug, target]) => {
            const tileUuid = findTileUuid(tiles, tileSlug);
            if (!tileUuid) {
                console.error(
                    `Tile with slug ${tileSlug} not found for date zoom target`,
                );
                return result;
            }
            return { ...result, [tileUuid]: target };
        },
        {},
    );
    return {
        ...config,
        dateZoomConfig: { ...config.dateZoomConfig, tileTargets },
    };
};
