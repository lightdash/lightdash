import { type DashboardTile } from '@lightdash/common';
import { type Layout } from 'react-grid-layout';

const DEFAULT_COLS = 36;

export const GRID_BREAKPOINTS = { lg: 1200, md: 996, sm: 768 };
export const GRID_COLS = { lg: DEFAULT_COLS, md: 30, sm: 18 };
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
    breakpoints: { lg: number; md: number; sm: number };
    cols: { lg: number; md: number; sm: number };
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
        minW: 4,
        x: tile.x * scaleFactor,
        y: tile.y,
        w: tile.w * scaleFactor,
        h: tile.h,
        i: tile.uuid,
        isDraggable: isEditMode,
        isResizable: isEditMode,
    };
};

export const getResponsiveGridLayoutProps = ({
    enableAnimation = false,
    stackVerticallyOnSmallestBreakpoint = false,
}: {
    enableAnimation?: boolean;

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
    },
    rowHeight: DEFAULT_ROW_HEIGHT,
    margin: GRID_MARGIN,
});
