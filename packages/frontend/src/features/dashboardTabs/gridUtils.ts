import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { type Layout } from 'react-grid-layout';

const DEFAULT_COLS = 36;

export const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 0 };
export const GRID_COLS = { lg: DEFAULT_COLS, md: 30, sm: 18, xs: 1 };
export type DashboardLayouts = Record<keyof typeof GRID_COLS, Layout[]>;
/**
 * Row height: fontSize * lineHeight + padding + borders
 */
export const DEFAULT_ROW_HEIGHT = 14 * 1.5 + 16 * 2 + 2;

export const GRID_MARGIN: [number, number] = [10, 10];
export const GRID_CONTAINER_PADDING: [number, number] = [10, 0];

/**
 * Converts layout positions from the current breakpoint's coordinate system
 * back to the base coordinate system (DEFAULT_COLS).
 *
 * This is needed when saving tile positions after drag/resize operations,
 * because react-grid-layout returns positions in the current breakpoint's
 * column count, but we store positions in the base 36-column system.
 *
 * @param layout - The layout array from react-grid-layout
 * @param currentCols - The current breakpoint's column count
 * @returns Layout array with positions converted to base coordinates
 */
export const convertLayoutToBaseCoordinates = (
    layout: Layout[],
    currentCols: number,
): Layout[] => {
    const scaleFactor = currentCols / DEFAULT_COLS;

    return layout.map((item) => ({
        ...item,
        x: Math.round(item.x / scaleFactor),
        w: Math.round(item.w / scaleFactor),
    }));
};

export type ResponsiveGridLayoutProps = {
    draggableCancel: string;
    useCSSTransforms: boolean;
    measureBeforeMount: boolean;
    breakpoints: typeof GRID_BREAKPOINTS;
    cols: typeof GRID_COLS;
    rowHeight: number;
    margin: [number, number];
};

export const getReactGridLayoutConfig = (
    tile: DashboardTile,
    isEditMode = false,
    cols = 36,
): Layout => {
    // Scale factor based on the number of columns (36 is the default for lg)
    const scaleFactor = cols / DEFAULT_COLS;

    return {
        minH: 1,
        minW: Math.min(4, cols),
        x: tile.x * scaleFactor,
        y: tile.y,
        w: tile.w * scaleFactor,
        h: tile.h,
        i: tile.uuid,
        isDraggable: isEditMode,
        isResizable: isEditMode,
    };
};

export const getMobileGridLayout = (tiles: DashboardTile[]): Layout[] => {
    let y = 0;
    return [...tiles]
        .sort((a, b) => a.y - b.y || a.x - b.x || a.uuid.localeCompare(b.uuid))
        .map((tile) => {
            const h =
                tile.type === DashboardTileTypes.HEADING ||
                tile.type === DashboardTileTypes.MARKDOWN
                    ? tile.h
                    : tile.type === DashboardTileTypes.LOOM
                      ? 4
                      : tile.type === DashboardTileTypes.SAVED_CHART ||
                          tile.type === DashboardTileTypes.SQL_CHART
                        ? Math.max(3, Math.min(Math.ceil(tile.h * 0.6), 6))
                        : Math.max(5, Math.min(tile.h, 8));
            const layout: Layout = {
                i: tile.uuid,
                x: 0,
                y,
                w: 1,
                h,
                minW: 1,
                minH: 1,
                isDraggable: false,
                isResizable: false,
            };
            y += h;
            return layout;
        });
};

export const getDashboardLayouts = (
    tiles: DashboardTile[],
    isEditMode = false,
    cols = GRID_COLS,
): DashboardLayouts => ({
    lg: tiles.map((tile) =>
        getReactGridLayoutConfig(tile, isEditMode, cols.lg),
    ),
    md: tiles.map((tile) =>
        getReactGridLayoutConfig(tile, isEditMode, cols.md),
    ),
    sm:
        cols.sm === 1
            ? getMobileGridLayout(tiles)
            : tiles.map((tile) =>
                  getReactGridLayoutConfig(tile, isEditMode, cols.sm),
              ),
    xs: isEditMode
        ? tiles.map((tile) => getReactGridLayoutConfig(tile, true, cols.xs))
        : getMobileGridLayout(tiles),
});

export const getResponsiveGridLayoutProps = ({
    enableAnimation = false,
    stackVerticallyOnSmallestBreakpoint = false,
    isEditMode = false,
}: {
    enableAnimation?: boolean;
    isEditMode?: boolean;

    /**
     * If enabled, we set the grid on the smallest breakpoint to have a single
     * column, which makes it behave like a simple vertical stack on mobile
     * viewports.
     */
    stackVerticallyOnSmallestBreakpoint?: boolean;
} = {}): ResponsiveGridLayoutProps => ({
    draggableCancel: '.non-draggable',
    useCSSTransforms: enableAnimation,
    measureBeforeMount: !enableAnimation,
    breakpoints: GRID_BREAKPOINTS,
    cols: {
        ...GRID_COLS,
        sm: stackVerticallyOnSmallestBreakpoint ? 1 : GRID_COLS.sm,
        xs: isEditMode ? GRID_COLS.sm : 1,
    },
    rowHeight: DEFAULT_ROW_HEIGHT,
    margin: GRID_MARGIN,
});
