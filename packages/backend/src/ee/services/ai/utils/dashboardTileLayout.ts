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

/** Appends to the last row when the tile fits beside it, else starts a row below everything. */
export const placeTile = (tiles: PlacedTile[], size: TileSize): PlacedTile => {
    const bottom = tiles.reduce(
        (max, tile) => Math.max(max, tile.y + tile.h),
        0,
    );
    const rowY = tiles.reduce((max, tile) => Math.max(max, tile.y), 0);
    const rowEnd = tiles
        .filter((tile) => tile.y === rowY)
        .reduce((max, tile) => Math.max(max, tile.x + tile.w), 0);
    const fitsRow = tiles.length > 0 && rowEnd + size.w <= GRID_COLUMNS;
    return fitsRow
        ? { ...size, x: rowEnd, y: rowY }
        : { ...size, x: 0, y: bottom };
};
