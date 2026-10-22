import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

export type LegendScrollEvent = {
    scrollDataIndex?: number;
};

type OptionWithLegend = {
    legend?: unknown;
    series?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Sets the scroll legend's first visible item. Leaves the option untouched on
 * the first page so the default render is unchanged.
 */
export const applyLegendScrollIndex = <T extends OptionWithLegend>(
    option: T,
    scrollDataIndex: number,
): T => {
    if (scrollDataIndex <= 0 || !option.legend) return option;
    const withIndex = (legend: unknown) =>
        isRecord(legend) ? { ...legend, scrollDataIndex } : legend;
    return {
        ...option,
        legend: Array.isArray(option.legend)
            ? option.legend.map(withIndex)
            : withIndex(option.legend),
    };
};

/**
 * Identifies the legend items of an option: series names for cartesian charts,
 * slice names for pie and funnel charts. Selection changes don't affect it.
 */
export const getLegendItemsKey = (option: OptionWithLegend): string => {
    const series = Array.isArray(option.series)
        ? option.series
        : option.series
          ? [option.series]
          : [];
    return JSON.stringify(
        series.map((item: unknown) => {
            if (!isRecord(item)) return null;
            if (
                (item.type === 'pie' || item.type === 'funnel') &&
                Array.isArray(item.data)
            ) {
                return item.data.map((datum: unknown) =>
                    isRecord(datum) ? datum.name : null,
                );
            }
            return item.name ?? item.id ?? null;
        }),
    );
};

/**
 * Keeps a scroll legend on its current page across option rebuilds.
 *
 * Charts render with `notMerge`, so every rebuilt option (e.g. after toggling
 * a series in the legend) resets the legend to its first page. This tracks the
 * page from echarts' `legendscroll` event and writes it back into the option as
 * `legend.scrollDataIndex`. The page resets when the legend items change.
 */
export const useLegendScrollIndex = <T extends OptionWithLegend>(
    option: T | undefined,
) => {
    const legendItemsKey = useMemo(
        () => (option ? getLegendItemsKey(option) : undefined),
        [option],
    );

    // A ref, not state: echarts already shows the page the user scrolled to,
    // so storing it must not trigger a re-render.
    const scrollRef = useRef<{
        legendItemsKey: string | undefined;
        scrollDataIndex: number;
    }>({ legendItemsKey, scrollDataIndex: 0 });

    const legendItemsKeyRef = useRef(legendItemsKey);
    useLayoutEffect(() => {
        legendItemsKeyRef.current = legendItemsKey;
        if (scrollRef.current.legendItemsKey !== legendItemsKey) {
            scrollRef.current = { legendItemsKey, scrollDataIndex: 0 };
        }
    }, [legendItemsKey]);

    const onLegendScroll = useCallback((params: LegendScrollEvent) => {
        if (typeof params.scrollDataIndex !== 'number') return;
        scrollRef.current = {
            legendItemsKey: legendItemsKeyRef.current,
            scrollDataIndex: params.scrollDataIndex,
        };
    }, []);

    const optionWithScrollIndex = useMemo(() => {
        if (!option) return option;
        const stored = scrollRef.current;
        return applyLegendScrollIndex(
            option,
            stored.legendItemsKey === legendItemsKey
                ? stored.scrollDataIndex
                : 0,
        );
    }, [option, legendItemsKey]);

    return { option: optionWithScrollIndex, onLegendScroll };
};
