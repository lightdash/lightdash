import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';

export type ControlTileKind = 'chart' | 'sql' | 'dataApp';

// Tiles that host a control's mapping; the rest are left as they are
export const getControlTileKind = (
    tile: Pick<DashboardTile, 'type'>,
): ControlTileKind | null => {
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return 'chart';
        case DashboardTileTypes.SQL_CHART:
            return 'sql';
        case DashboardTileTypes.DATA_APP:
            return 'dataApp';
        default:
            return null;
    }
};

export const getTileTitle = (tile: DashboardTile): string => {
    if (
        tile.type === DashboardTileTypes.SAVED_CHART ||
        tile.type === DashboardTileTypes.SQL_CHART
    ) {
        return tile.properties.title || tile.properties.chartName || '';
    }
    return tile.properties.title || '';
};

// The popover's line for tiles that take the control through their switch
export const DATA_APPS_LINE_ID = 'data-apps';

export const formatTileCount = (count: number): string =>
    `${count} ${count === 1 ? 'tile' : 'tiles'}`;

// Tiles with no tab, or a tab that no longer exists, show on the first one
export const getTileTabUuid = (
    tile: Pick<DashboardTile, 'tabUuid'>,
    tabUuids: string[],
): string | null => {
    if (tabUuids.length === 0) return null;
    return tile.tabUuid && tabUuids.includes(tile.tabUuid)
        ? tile.tabUuid
        : tabUuids[0];
};
