import type EChartsReact from 'echarts-for-react';
import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    type RefObject,
} from 'react';

type LegendScrollEvent = {
    scrollDataIndex: number;
};

type OptionWithLegend = {
    animation?: boolean;
    legend?: { animation?: boolean };
};

/** setOption(notMerge) rebuilds the legend, resetting a scroll legend to its
 * first page. Track the scroll position and build each new option at it. */
export const useLegendScrollPosition = <T extends OptionWithLegend>(
    chartRef: RefObject<EChartsReact | null>,
    option: T | undefined,
) => {
    const scrollDataIndexRef = useRef(0);

    const onLegendScroll = useCallback((params: LegendScrollEvent) => {
        scrollDataIndexRef.current = params.scrollDataIndex;
    }, []);

    // A rebuilt legend slides in from the first page, so build it without
    // animation and restore the animation once it has rendered
    const optionWithScrollPosition = useMemo(() => {
        const scrollDataIndex = scrollDataIndexRef.current;
        if (!option?.legend || scrollDataIndex === 0) return option;
        return {
            ...option,
            legend: { ...option.legend, scrollDataIndex, animation: false },
        };
    }, [option]);

    // Runs after echarts-for-react's componentDidUpdate has applied the option
    useLayoutEffect(() => {
        if (!option?.legend || optionWithScrollPosition === option) return;
        const instance = chartRef.current?.getEchartsInstance();
        if (!instance || instance.isDisposed()) return;
        instance.setOption({
            legend: {
                animation: option.legend.animation ?? option.animation ?? true,
            },
        });
    }, [chartRef, option, optionWithScrollPosition]);

    return { optionWithScrollPosition, onLegendScroll };
};
