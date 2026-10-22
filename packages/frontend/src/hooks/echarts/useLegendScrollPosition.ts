import type EChartsReact from 'echarts-for-react';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

type LegendScrollEvent = {
    scrollDataIndex: number;
};

/** setOption(notMerge) rebuilds the legend model, resetting a scroll legend to
 * its first page. Track the scroll position and restore it after each update. */
export const useLegendScrollPosition = (
    chartRef: RefObject<EChartsReact | null>,
    option: unknown,
) => {
    const scrollDataIndexRef = useRef(0);

    const onLegendScroll = useCallback((params: LegendScrollEvent) => {
        scrollDataIndexRef.current = params.scrollDataIndex;
    }, []);

    // Runs after echarts-for-react's componentDidUpdate has applied the option
    useLayoutEffect(() => {
        const scrollDataIndex = scrollDataIndexRef.current;
        if (scrollDataIndex === 0) return;
        const instance = chartRef.current?.getEchartsInstance();
        if (!instance || instance.isDisposed()) return;
        instance.dispatchAction({ type: 'legendScroll', scrollDataIndex });
    }, [chartRef, option]);

    return { onLegendScroll };
};
