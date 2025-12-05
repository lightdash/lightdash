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
/**
 * Row height: fontSize * lineHeight + padding + borders
 */
export const DEFAULT_ROW_HEIGHT = 14 * 1.5 + 16 * 2 + 2;

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
    breakpoints: { lg: 1200, md: 996, sm: 768 },
    cols: {
        lg: DEFAULT_COLS,
        md: 30,
        sm: stackVerticallyOnSmallestBreakpoint ? 1 : 18,
    },
    rowHeight: DEFAULT_ROW_HEIGHT,
});
