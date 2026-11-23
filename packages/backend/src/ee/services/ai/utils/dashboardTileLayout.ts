import { ChartType } from '@lightdash/common';

const GRID_COLUMNS = 36;

type TileSize = { w: number; h: number };
type PlacedTile = TileSize & { x: number; y: number };

export const getChartTileSize = (chartType: ChartType): TileSize => {
    switch (chartType) {
        case ChartType.BIG_NUMBER:
            return { w: 9, h: 6 };
        case ChartType.TABLE:
            return { w: GRID_COLUMNS, h: 9 };
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

/** Widens a row of auto-sized tiles to the full grid and evens their heights; other rows are left as laid out. */
const closeRow = <T extends PlacedTile>(row: T[]): Map<T, PlacedTile> => {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const width = sorted.reduce((sum, tile) => sum + tile.w, 0);
    const contiguous = sorted.every(
        (tile, i) =>
            tile.x ===
            sorted.slice(0, i).reduce((sum, prev) => sum + prev.w, 0),
    );
    if (
        width >= GRID_COLUMNS ||
        !contiguous ||
        !sorted.every((tile) => AUTO_SIZES.has(`${tile.w}x${tile.h}`))
    )
        return new Map();
    const h = Math.max(...sorted.map((tile) => tile.h));
    let x = 0;
    return new Map(
        sorted.map((tile, i) => {
            const w =
                i === sorted.length - 1
                    ? GRID_COLUMNS - x
                    : Math.round((tile.w * GRID_COLUMNS) / width);
            const resized = { x, y: tile.y, w, h };
            x += w;
            return [tile, resized];
        }),
    );
};

/**
 * Appends to the last row when the tile fits beside it, else starts a row below everything.
 * Starting a row closes the previous one: its auto-sized tiles are widened to fill the grid.
 */
export const placeTile = <T extends PlacedTile>(
    tiles: T[],
    size: TileSize,
): { tiles: T[]; placed: PlacedTile } => {
    const rowY = tiles.reduce((max, tile) => Math.max(max, tile.y), 0);
    const row = tiles.filter((tile) => tile.y === rowY);
    const rowEnd = row.reduce((max, tile) => Math.max(max, tile.x + tile.w), 0);
    if (tiles.length > 0 && rowEnd + size.w <= GRID_COLUMNS) {
        return { tiles, placed: { ...size, x: rowEnd, y: rowY } };
    }
    const resized = closeRow(row);
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
