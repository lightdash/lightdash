import {
    assertUnreachable,
    DashboardTileTypes,
    type DashboardTile,
    type DashboardTileWithSlug,
} from '@lightdash/common';

const getContentKey = (tile: DashboardTile): string | null => {
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return tile.properties.savedChartUuid
                ? `${tile.type}:${tile.properties.savedChartUuid}`
                : null;
        case DashboardTileTypes.SQL_CHART:
            return tile.properties.savedSqlUuid
                ? `${tile.type}:${tile.properties.savedSqlUuid}`
                : null;
        case DashboardTileTypes.DATA_APP:
            return `${tile.type}:${tile.properties.appUuid}`;
        case DashboardTileTypes.MARKDOWN:
            return JSON.stringify([
                tile.type,
                tile.properties.title,
                tile.properties.content,
                tile.properties.hideFrame ?? false,
            ]);
        case DashboardTileTypes.LOOM:
            return JSON.stringify([
                tile.type,
                tile.properties.title,
                tile.properties.url,
                tile.properties.hideTitle ?? false,
            ]);
        case DashboardTileTypes.HEADING:
            return JSON.stringify([
                tile.type,
                tile.properties.text,
                tile.properties.showDivider ?? false,
            ]);
        default:
            return assertUnreachable(tile, 'Unknown dashboard tile type');
    }
};

const getDuplicateKey = (tile: DashboardTile): string =>
    JSON.stringify([
        tile.tabUuid ?? null,
        tile.x,
        tile.y,
        tile.w,
        tile.h,
        tile.properties.title ?? null,
        tile.type === DashboardTileTypes.SAVED_CHART ||
        tile.type === DashboardTileTypes.SQL_CHART ||
        tile.type === DashboardTileTypes.DATA_APP ||
        tile.type === DashboardTileTypes.LOOM
            ? (tile.properties.hideTitle ?? false)
            : false,
    ]);

const groupTiles = <T extends DashboardTile>(
    tiles: T[],
    getKey: (tile: DashboardTile) => string | null,
): Map<string, T[]> => {
    const groups = new Map<string, T[]>();
    tiles.forEach((tile) => {
        const key = getKey(tile);
        if (key === null) return;
        const group = groups.get(key) ?? [];
        group.push(tile);
        groups.set(key, group);
    });
    return groups;
};

export const preserveDashboardTileUuids = (
    tiles: DashboardTileWithSlug[],
    existingTiles: DashboardTile[],
): DashboardTileWithSlug[] => {
    const incomingUuids = new Set(tiles.map((tile) => tile.uuid));
    const existingUuids = new Set(existingTiles.map((tile) => tile.uuid));
    const existingGroups = groupTiles(existingTiles, getContentKey);
    const incomingGroups = groupTiles(tiles, getContentKey);
    const matches = new Map<DashboardTileWithSlug, string>();

    const match = (
        incoming: DashboardTileWithSlug[],
        existing: DashboardTile[],
    ) => {
        if (incoming.length !== 1 || existing.length !== 1) return;
        const [tile] = incoming;
        const [previous] = existing;
        if (existingUuids.has(tile.uuid) || incomingUuids.has(previous.uuid))
            return;
        matches.set(tile, previous.uuid);
    };

    incomingGroups.forEach((incoming, key) => {
        const existing = existingGroups.get(key) ?? [];
        if (incoming.length === 1 && existing.length === 1) {
            match(incoming, existing);
            return;
        }

        // Ordinal tile slugs change when duplicates move or disappear.
        // Only reuse duplicate identities when their placement still matches.
        const existingDuplicates = groupTiles(existing, getDuplicateKey);
        groupTiles(incoming, getDuplicateKey).forEach((duplicates, layout) => {
            match(duplicates, existingDuplicates.get(layout) ?? []);
        });
    });

    return tiles.map((tile) => ({
        ...tile,
        uuid: matches.get(tile) ?? tile.uuid,
    }));
};
