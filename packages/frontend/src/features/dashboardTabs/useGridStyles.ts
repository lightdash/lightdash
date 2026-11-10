import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    GRID_BREAKPOINTS,
    GRID_CONTAINER_PADDING,
    GRID_MARGIN,
    type ResponsiveGridLayoutProps,
} from './gridUtils';

const sortedBreakpoints = (
    Object.entries(GRID_BREAKPOINTS) as [
        keyof typeof GRID_BREAKPOINTS,
        number,
    ][]
).sort(([, a], [, b]) => a - b);

const getColsForWidth = (
    width: number,
    cols: ResponsiveGridLayoutProps['cols'],
): number => {
    let bp: keyof typeof GRID_BREAKPOINTS = sortedBreakpoints[0][0];
    for (const [name, minWidth] of sortedBreakpoints) {
        if (width >= minWidth) bp = name;
    }
    return cols[bp];
};

export const useGridStyles = ({
    ref,
    cols,
    rowHeight,
}: {
    ref: React.RefObject<HTMLDivElement | null>;
    cols: ResponsiveGridLayoutProps['cols'];
    /** One row plus the gap below it, as the grid steps (gridProps.rowHeight) */
    rowHeight: number;
}) => {
    const [observedWidth, setObservedWidth] = useState(0);

    useEffect(() => {
        const wrapper = ref.current;
        if (!wrapper) return;
        const ro = new ResizeObserver(() => {
            const rgl = wrapper.querySelector(
                '.react-grid-layout',
            ) as HTMLElement | null;
            if (rgl) setObservedWidth(rgl.offsetWidth);
        });
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, [ref, setObservedWidth]);

    return useMemo(() => {
        if (observedWidth <= 0) return undefined;
        const colCount = getColsForWidth(observedWidth, cols);
        const colWidth =
            (observedWidth -
                GRID_MARGIN[0] * (colCount - 1) -
                GRID_CONTAINER_PADDING[0] * 2) /
            colCount;
        return {
            '--grid-cell-w': `${colWidth + GRID_MARGIN[0]}px`,
            '--grid-cell-h': `${rowHeight}px`,
            '--grid-col-w': `${colWidth}px`,
            '--grid-row-h': `${rowHeight - GRID_MARGIN[1]}px`,
            '--grid-pad-x': `${GRID_CONTAINER_PADDING[0]}px`,
            '--grid-pad-y': `${GRID_CONTAINER_PADDING[1]}px`,
        } as React.CSSProperties;
    }, [observedWidth, cols, rowHeight]);
};
