import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    DEFAULT_ROW_HEIGHT,
    GRID_CONTAINER_PADDING,
    GRID_MARGIN,
} from './gridUtils';

export const useGridStyles = ({
    ref,
    cols,
}: {
    ref: React.RefObject<HTMLDivElement | null>;
    cols: number;
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
        const colWidth =
            (observedWidth -
                GRID_MARGIN[0] * (cols - 1) -
                GRID_CONTAINER_PADDING[0] * 2) /
            cols;
        return {
            '--grid-cell-w': `${colWidth + GRID_MARGIN[0]}px`,
            '--grid-cell-h': `${DEFAULT_ROW_HEIGHT + GRID_MARGIN[1]}px`,
            '--grid-col-w': `${colWidth}px`,
            '--grid-row-h': `${DEFAULT_ROW_HEIGHT}px`,
            '--grid-pad-x': `${GRID_CONTAINER_PADDING[0]}px`,
            '--grid-pad-y': `${GRID_CONTAINER_PADDING[1]}px`,
        } as React.CSSProperties;
    }, [observedWidth, cols]);
};
