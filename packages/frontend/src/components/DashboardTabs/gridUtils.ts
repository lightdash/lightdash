import { type DashboardTile } from '@lightdash/common';
import { type Layout } from 'react-grid-layout';

export type ResponsiveGridLayoutProps = {
    draggableCancel: string;
    useCSSTransforms: boolean;
    measureBeforeMount: boolean;
    breakpoints: { lg: number; md: number; sm: number };
    cols: { lg: number; md: number; sm: number };
    rowHeight: number;
};

const DEFAULT_COLS = 36;

export const getReactGridLayoutConfig = (
    tile: DashboardTile,
    isEditMode = false,
    cols = DEFAULT_COLS,
): Layout => {
    // Scale factor based on the number of columns (36 is the default for lg)
    const scaleFactor = cols / DEFAULT_COLS;

    return {
        minH: 1,
        minW: Math.max(1, Math.round(6 * scaleFactor)),
        x: Math.round(tile.x * scaleFactor),
        y: tile.y,
        w: Math.round(tile.w * scaleFactor),
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
    breakpoints: { lg: 1200, md: 996, sm: 768 },
    cols: { lg: 36, md: 30, sm: stackVerticallyOnSmallestBreakpoint ? 1 : 18 },
    rowHeight: 50,
});
