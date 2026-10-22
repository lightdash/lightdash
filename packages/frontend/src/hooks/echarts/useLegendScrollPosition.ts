import { useCallback, useMemo, useRef } from 'react';

type LegendScrollEvent = {
    scrollDataIndex: number;
};

/** setOption(notMerge) rebuilds the legend model, resetting a scroll legend to
 * its first page. Track the scroll position and build each new option at it. */
export const useLegendScrollPosition = <T extends { legend?: object }>(
    option: T | undefined,
) => {
    const scrollDataIndexRef = useRef(0);

    const onLegendScroll = useCallback((params: LegendScrollEvent) => {
        scrollDataIndexRef.current = params.scrollDataIndex;
    }, []);

    // Read when the option changes, so the new legend renders at the current
    // page instead of animating there from the first one
    const optionWithScrollPosition = useMemo(() => {
        const scrollDataIndex = scrollDataIndexRef.current;
        if (!option?.legend || scrollDataIndex === 0) return option;
        return { ...option, legend: { ...option.legend, scrollDataIndex } };
    }, [option]);

    return { optionWithScrollPosition, onLegendScroll };
};
