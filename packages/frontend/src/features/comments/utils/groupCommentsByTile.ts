import {
    assertUnreachable,
    DashboardTileTypes,
    type Comment,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

export type TileCommentGroup = {
    tileUuid: string;
    title: string;
    /** null when the tile is no longer on the dashboard's current version */
    tileType: DashboardTileTypes | null;
    tabUuid: string | null;
    threads: Comment[];
};

export const getRemovedTileTitle = (): string =>
    i18n.t('panel.removedTileTitle', { ns: 'comments' });

export const getTileTitle = (tile: DashboardTile): string => {
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return (
                tile.properties.title ||
                tile.properties.chartName ||
                i18n.t('tileFallbackTitle.chart', { ns: 'comments' })
            );
        case DashboardTileTypes.SQL_CHART:
            return (
                tile.properties.title ||
                tile.properties.chartName ||
                i18n.t('tileFallbackTitle.chart', { ns: 'comments' })
            );
        case DashboardTileTypes.MARKDOWN:
            return (
                tile.properties.title ||
                i18n.t('tileFallbackTitle.markdown', { ns: 'comments' })
            );
        case DashboardTileTypes.LOOM:
            return (
                tile.properties.title ||
                i18n.t('tileFallbackTitle.loom', { ns: 'comments' })
            );
        case DashboardTileTypes.HEADING:
            return (
                tile.properties.text ||
                i18n.t('tileFallbackTitle.heading', { ns: 'comments' })
            );
        case DashboardTileTypes.DATA_APP:
            return (
                tile.properties.title ||
                i18n.t('tileFallbackTitle.dataApp', { ns: 'comments' })
            );
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
            title: getRemovedTileTitle(),
            tileType: null,
            tabUuid: null,
            threads,
        });
    }

    return groups;
};

export const countThreads = (groups: TileCommentGroup[]): number =>
    groups.reduce((total, group) => total + group.threads.length, 0);

export type TileCommentSection = {
    isRemoved: boolean;
    /** null for untabbed or removed tiles */
    tabUuid: string | null;
    label: string;
    groups: TileCommentGroup[];
};

export const getRemovedTilesSectionLabel = (): string =>
    i18n.t('panel.removedTilesSection', { ns: 'comments' });

/**
 * Splits ordered tile groups into one section per dashboard tab, keeping the
 * groups' order. Removed tiles get their own trailing section.
 */
export const sectionGroupsByTab = (
    groups: TileCommentGroup[],
    tabs: DashboardTab[],
): TileCommentSection[] => {
    const tabNames = new Map(tabs.map((tab) => [tab.uuid, tab.name]));
    const sections: TileCommentSection[] = [];
    for (const group of groups) {
        const isRemoved = group.tileType === null;
        const last = sections[sections.length - 1];
        if (
            last &&
            last.tabUuid === group.tabUuid &&
            last.isRemoved === isRemoved
        ) {
            last.groups.push(group);
            continue;
        }
        sections.push({
            isRemoved,
            tabUuid: group.tabUuid,
            label: isRemoved
                ? getRemovedTilesSectionLabel()
                : group.tabUuid === null
                  ? i18n.t('panel.dashboardSection', { ns: 'comments' })
                  : (tabNames.get(group.tabUuid) ?? ''),
            groups: [group],
        });
    }
    return sections;
};
