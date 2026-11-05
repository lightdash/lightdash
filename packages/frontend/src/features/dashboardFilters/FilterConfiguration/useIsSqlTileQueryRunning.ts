import {
    DashboardTileTypes,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import { useIsFetching, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
    selectDashboardTiles,
    selectSqlChartTilesMetadata,
    useDashboardSelector,
} from '../../dashboard/store';

type TilesWithoutColumns = {
    tileUuids: Set<string>;
    savedSqlUuids: Set<string>;
};

// Matches the keys `useSavedSqlChartResults` uses to a tile with no columns
// yet: results by their tileUuid; a registered chart by its saved chart,
// an embedded one by its tileUuid
const isForTileWithoutColumns = (
    [key, second, third, fourth]: QueryKey,
    { tileUuids, savedSqlUuids }: TilesWithoutColumns,
): boolean => {
    if (key === 'savedSqlChartResults')
        return (
            typeof third === 'object' &&
            third !== null &&
            'tileUuid' in third &&
            typeof third.tileUuid === 'string' &&
            tileUuids.has(third.tileUuid)
        );
    if (key !== 'savedSqlChart') return false;
    if (third === 'registered')
        return typeof second === 'string' && savedSqlUuids.has(second);
    return typeof fourth === 'string' && tileUuids.has(fourth);
};

// SQL columns arrive as each tile's query returns: more are coming while a
// tile with none yet is fetching. A refresh refetches tiles that keep their
// columns, and a disabled or never-mounted (locked) tile fetches nothing
export const useIsSqlTileQueryRunning = (): boolean => {
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const sqlChartTilesMetadata = useDashboardSelector(
        selectSqlChartTilesMetadata,
    );
    const tilesWithoutColumns = useMemo((): TilesWithoutColumns => {
        const tiles = (dashboardTiles ?? []).filter(
            (tile): tile is DashboardSqlChartTile =>
                tile.type === DashboardTileTypes.SQL_CHART &&
                sqlChartTilesMetadata[tile.uuid] === undefined,
        );
        return {
            tileUuids: new Set(tiles.map((tile) => tile.uuid)),
            savedSqlUuids: new Set(
                tiles.flatMap((tile) => tile.properties.savedSqlUuid ?? []),
            ),
        };
    }, [dashboardTiles, sqlChartTilesMetadata]);
    const fetching = useIsFetching({
        predicate: (query) =>
            isForTileWithoutColumns(query.queryKey, tilesWithoutColumns),
    });
    return fetching > 0;
};
