import {
    assertUnreachable,
    DashboardTileTypes,
    type Comment,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';

export type TileCommentGroup = {
    tileUuid: string;
    title: string;
    /** null when the tile is no longer on the dashboard's current version */
    tileType: DashboardTileTypes | null;
    tabUuid: string | null;
    threads: Comment[];
};

export const REMOVED_TILE_TITLE = 'Tile no longer on this dashboard';

export const getTileTitle = (tile: DashboardTile): string => {
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return (
                tile.properties.title ||
                tile.properties.chartName ||
                'Untitled chart'
            );
        case DashboardTileTypes.SQL_CHART:
            return (
                tile.properties.title ||
                tile.properties.chartName ||
                'Untitled chart'
            );
        case DashboardTileTypes.MARKDOWN:
            return tile.properties.title || 'Markdown';
        case DashboardTileTypes.LOOM:
            return tile.properties.title || 'Loom video';
        case DashboardTileTypes.HEADING:
            return tile.properties.text || 'Heading';
        case DashboardTileTypes.DATA_APP:
            return tile.properties.title || 'Data app';
        default:
            return assertUnreachable(tile, 'Unknown dashboard tile type');
    }
};

type GroupCommentsByTileArgs = {
    commentsByTile: Record<string, Comment[]>;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
};

/**
 * Orders comment threads the way the dashboard reads: tab by tab, then top to
 * bottom, left to right. Threads on tiles that were removed from the dashboard
 * are listed last so they are still reachable.
 */
export const groupCommentsByTile = ({
    commentsByTile,
    tiles,
    tabs,
}: GroupCommentsByTileArgs): TileCommentGroup[] => {
    const tabOrder = new Map(
        [...tabs]
            .sort((a, b) => a.order - b.order)
            .map((tab, index) => [tab.uuid, index] as const),
    );
    const tabRank = (tabUuid: string | null | undefined) =>
        tabUuid ? (tabOrder.get(tabUuid) ?? tabOrder.size) : -1;

    const orderedTiles = [...tiles].sort(
        (a, b) =>
            tabRank(a.tabUuid) - tabRank(b.tabUuid) || a.y - b.y || a.x - b.x,
    );

    const groups: TileCommentGroup[] = [];
    const seen = new Set<string>();
    for (const tile of orderedTiles) {
        const threads = commentsByTile[tile.uuid];
        if (!threads || threads.length === 0) continue;
        seen.add(tile.uuid);
        groups.push({
            tileUuid: tile.uuid,
            title: getTileTitle(tile),
            tileType: tile.type,
            tabUuid: tile.tabUuid ?? null,
            threads,
        });
    }

    for (const [tileUuid, threads] of Object.entries(commentsByTile)) {
        if (seen.has(tileUuid) || threads.length === 0) continue;
        groups.push({
            tileUuid,
            title: REMOVED_TILE_TITLE,
            tileType: null,
            tabUuid: null,
            threads,
        });
    }

    return groups;
};

export const countThreads = (groups: TileCommentGroup[]): number =>
    groups.reduce((total, group) => total + group.threads.length, 0);
