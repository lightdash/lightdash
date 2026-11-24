import { ChartType, DASHBOARD_GRID_COLUMNS } from '@lightdash/common';

type TileSize = { w: number; h: number };
type PlacedTile = TileSize & { x: number; y: number };

const overlaps = (a: PlacedTile, b: PlacedTile) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Half-grid charts, unlike common's 15-wide default, pair up into full rows.
export const getChartTileSize = (chartType: ChartType): TileSize => {
    switch (chartType) {
        case ChartType.BIG_NUMBER:
            return { w: 9, h: 6 };
        case ChartType.TABLE:
            return { w: DASHBOARD_GRID_COLUMNS, h: 9 };
        default:
            return { w: 18, h: 9 };
    }
};

const AUTO_SIZES = new Set(
    [ChartType.BIG_NUMBER, ChartType.TABLE, ChartType.CARTESIAN].map((type) => {
        const { w, h } = getChartTileSize(type);
        return `${w}x${h}`;
    }),
);

/** Widens a row of auto-sized tiles to the full grid and evens their heights, unless that covers another tile. */
const closeRow = <T extends PlacedTile>(
    row: T[],
    others: T[],
): Map<T, PlacedTile> => {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const width = sorted.reduce((sum, tile) => sum + tile.w, 0);
    const contiguous = sorted.every(
        (tile, i) =>
            tile.x ===
            sorted.slice(0, i).reduce((sum, prev) => sum + prev.w, 0),
    );
    if (
        width >= DASHBOARD_GRID_COLUMNS ||
        !contiguous ||
        !sorted.every((tile) => AUTO_SIZES.has(`${tile.w}x${tile.h}`))
    )
        return new Map();
    const h = Math.max(...sorted.map((tile) => tile.h));
    let x = 0;
    const resized = new Map(
        sorted.map((tile, i) => {
            const w =
                i === sorted.length - 1
                    ? DASHBOARD_GRID_COLUMNS - x
                    : Math.round((tile.w * DASHBOARD_GRID_COLUMNS) / width);
            const geometry = { x, y: tile.y, w, h };
            x += w;
            return [tile, geometry];
        }),
    );
    return [...resized.values()].some((geometry) =>
        others.some((other) => overlaps(geometry, other)),
    )
        ? new Map()
        : resized;
};

/**
 * Appends to the last row when the tile fits there without covering another tile, else starts a row below everything.
 * Starting a row closes the previous one, but only when every tile in it is resizable.
 */
export const placeTile = <T extends PlacedTile>(
    tiles: T[],
    size: TileSize,
    isResizable: (tile: T) => boolean,
): { tiles: T[]; placed: PlacedTile } => {
    const rowY = tiles.reduce((max, tile) => Math.max(max, tile.y), 0);
    const row = tiles.filter((tile) => tile.y === rowY);
    const rowEnd = row.reduce((max, tile) => Math.max(max, tile.x + tile.w), 0);
    const beside = { ...size, x: rowEnd, y: rowY };
    if (
        tiles.length > 0 &&
        rowEnd + size.w <= DASHBOARD_GRID_COLUMNS &&
        !tiles.some((tile) => overlaps(beside, tile))
    ) {
        return { tiles, placed: beside };
    }
    const resized = row.every(isResizable)
        ? closeRow(
              row,
              tiles.filter((tile) => tile.y !== rowY),
          )
        : new Map<T, PlacedTile>();
    const next = tiles.map((tile) => {
        const geometry = resized.get(tile);
        return geometry ? { ...tile, ...geometry } : tile;
    });
    const bottom = next.reduce(
        (max, tile) => Math.max(max, tile.y + tile.h),
        0,
    );
    return { tiles: next, placed: { ...size, x: 0, y: bottom } };
};
