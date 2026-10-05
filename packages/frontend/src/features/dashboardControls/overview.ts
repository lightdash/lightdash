// One tile as a control sees it: what it could be mapped to and what it is
export type OverviewTile = {
    tileUuid: string;
    tabUuid: string | null;
    // Fields or parameters of the control's type; null while not loaded
    options: string[] | null;
    mappedId: string | null;
    // Whether choosing a field or parameter for every tile reaches this one
    isBulkMapped: boolean;
    // A tile with no field of its own takes the control or not; null for
    // tiles that are mapped to a field or parameter
    switch: 'on' | 'off' | null;
};

export type OverviewRow = {
    id: string;
    tileUuids: string[];
    // Tiles that have it and are not mapped to anything
    remainingTileUuids: string[];
};

export type OverviewOption = {
    id: string;
    tileUuids: string[];
};

export type ControlOverview = {
    rows: OverviewRow[];
    // Not mapped yet, named like a mapped one
    suggestions: OverviewOption[];
    // Everything not mapped yet that unmapped tiles have
    others: OverviewOption[];
    // Tiles with no field of their own that take the control through their
    // switch: with the rows' tiles, every tile the control applies to
    switchedOnTileUuids: string[];
    mappedCount: number;
    mappableCount: number;
};

const isMapped = (tile: OverviewTile): boolean =>
    tile.mappedId !== null || tile.switch === 'on';

const isMappable = (tile: OverviewTile): boolean =>
    isMapped(tile) || tile.switch !== null || (tile.options ?? []).length > 0;

const remainingFor = (tiles: OverviewTile[], id: string): string[] =>
    tiles
        .filter(
            (tile) =>
                tile.isBulkMapped &&
                tile.mappedId === null &&
                (tile.options ?? []).includes(id),
        )
        .map((tile) => tile.tileUuid);

// `order` lists the control's fields or parameters as saved; `nameKeys` groups
// the ones that share a name across tables or models
export const getControlOverview = ({
    tiles,
    order,
    nameKeys,
    keepsEmptyRows,
}: {
    tiles: OverviewTile[];
    order: string[];
    nameKeys: Record<string, string>;
    // Whether one of `order` that no tile is mapped to keeps its row, at 0
    // tiles: a parameter stays in its control until it is removed
    keepsEmptyRows: boolean;
}): ControlOverview => {
    const mappedIds = tiles.flatMap((tile) =>
        tile.mappedId === null ? [] : [tile.mappedId],
    );
    const rowIds = [...new Set([...order, ...mappedIds])].filter(
        (id) =>
            mappedIds.includes(id) || (keepsEmptyRows && order.includes(id)),
    );
    const rows = rowIds.map((id) => ({
        id,
        tileUuids: tiles
            .filter((tile) => tile.mappedId === id)
            .map((tile) => tile.tileUuid),
        remainingTileUuids: remainingFor(tiles, id),
    }));

    const otherIds = [
        ...new Set(
            tiles.flatMap((tile) =>
                tile.isBulkMapped ? (tile.options ?? []) : [],
            ),
        ),
    ].filter((id) => !rowIds.includes(id));
    const others = otherIds
        .map((id) => ({ id, tileUuids: remainingFor(tiles, id) }))
        .filter((option) => option.tileUuids.length > 0)
        // Most tiles first; ties keep the order the tiles gave
        .sort((a, b) => b.tileUuids.length - a.tileUuids.length);

    const rowNameKeys = new Set(
        rowIds.flatMap((id) =>
            nameKeys[id] === undefined ? [] : [nameKeys[id]],
        ),
    );

    return {
        rows,
        suggestions: others.filter(
            (option) =>
                nameKeys[option.id] !== undefined &&
                rowNameKeys.has(nameKeys[option.id]),
        ),
        others,
        switchedOnTileUuids: tiles
            .filter((tile) => tile.switch === 'on')
            .map((tile) => tile.tileUuid),
        mappedCount: tiles.filter(isMapped).length,
        mappableCount: tiles.filter(isMappable).length,
    };
};

export type TabCount = { mapped: number; mappable: number };

// "N of M" for one dashboard tab: tiles mapped out of tiles that could be
export const getTabCount = (
    tiles: OverviewTile[],
    tabUuid: string,
): TabCount => {
    const mappable = tiles.filter(
        (tile) => tile.tabUuid === tabUuid && isMappable(tile),
    );
    return {
        mapped: mappable.filter(isMapped).length,
        mappable: mappable.length,
    };
};

// How many of the shown tiles one dashboard tab holds
export const getShownTabCount = (
    tiles: OverviewTile[],
    tabUuid: string,
    shownTileUuids: string[],
): number =>
    tiles.filter(
        (tile) =>
            tile.tabUuid === tabUuid && shownTileUuids.includes(tile.tileUuid),
    ).length;

// The tile a clicked count scrolls to and the dashboard tab it is on (none on
// a dashboard without tabs): the current tab when it holds some of the tiles,
// else the first tab, in tab order, that does
export const getShownTarget = ({
    tiles,
    tabUuids,
    activeTabUuid,
    tileUuids,
}: {
    tiles: OverviewTile[];
    tabUuids: string[];
    activeTabUuid: string | null;
    tileUuids: string[];
}): { tabUuid: string | null; tileUuid: string } | null => {
    const shown = tiles.filter((tile) => tileUuids.includes(tile.tileUuid));
    const first =
        shown.find(
            (tile) => tile.tabUuid === null || tile.tabUuid === activeTabUuid,
        ) ??
        tabUuids
            .map((tabUuid) => shown.find((tile) => tile.tabUuid === tabUuid))
            .find((tile) => tile !== undefined);
    return first ? { tabUuid: first.tabUuid, tileUuid: first.tileUuid } : null;
};

// What the "M" of "N of M" counts, in a sentence that stays true: tiles with
// a field or parameter the control can use, or simply tiles that can use it
// when some of them take it through a switch instead. On a dashboard tab it
// speaks of that tab's tiles only.
export const getMappableSummary = ({
    tiles,
    tabUuid,
    typeWord,
    noun,
}: {
    tiles: OverviewTile[];
    tabUuid: string | null;
    typeWord: string;
    noun: 'field' | 'parameter';
}): string => {
    const mappable = tiles.filter(
        (tile) =>
            (tabUuid === null || tile.tabUuid === tabUuid) && isMappable(tile),
    );
    const isOne = mappable.length === 1;
    const subject = `${mappable.length} ${isOne ? 'tile' : 'tiles'}${
        tabUuid === null ? '' : ' on this tab'
    }`;
    return mappable.some((tile) => tile.switch !== null)
        ? `${subject} can use this control`
        : `${subject} ${isOne ? 'has' : 'have'} a ${typeWord} ${noun} this control can use`;
};
