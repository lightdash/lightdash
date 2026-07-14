import { useCallback, useRef, useState } from 'react';

export type LegendClickEvent = {
    name: string;
    selected: Record<string, boolean>;
};

export type LegendSelection = Record<string, boolean>;

/** Entries toggled off in the legend, or undefined when everything is visible.
 * Missing keys default to visible in echarts, so this is the minimal state to persist. */
export const getDisabledLegendEntries = (
    selected: LegendSelection,
): LegendSelection | undefined => {
    const disabledEntries = Object.entries(selected).filter(
        ([, isSelected]) => !isSelected,
    );
    return disabledEntries.length > 0
        ? Object.fromEntries(disabledEntries)
        : undefined;
};

const DOUBLE_CLICK_DELAY = 300;

export const useLegendDoubleClickSelection = (
    initialSelection?: LegendSelection,
    onChange?: (selected: LegendSelection) => void,
) => {
    const [selectedLegends, setSelectedLegends] = useState<LegendSelection>(
        initialSelection ?? {},
    );
    const legendClicksRef = useRef<
        Record<
            string,
            {
                singleClickTimeout: NodeJS.Timeout | undefined;
                lastClick: number;
            }
        >
    >({});

    // Ref keeps onLegendChange referentially stable so echarts event bindings don't churn
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const applySelection = useCallback((selected: LegendSelection) => {
        setSelectedLegends(selected);
        onChangeRef.current?.(selected);
    }, []);

    const overrideSelectAllLegends = useCallback(
        (params: LegendClickEvent) => {
            applySelection(
                Object.fromEntries(
                    Object.keys(params.selected).map((key) => [key, true]),
                ),
            );
        },
        [applySelection],
    );

    const overrideSelectSingleLegend = useCallback(
        (params: LegendClickEvent) => {
            applySelection(
                Object.fromEntries(
                    Object.keys(params.selected).map((key) => [
                        key,
                        key === params.name,
                    ]),
                ),
            );
        },
        [applySelection],
    );

    const onLegendChange = useCallback(
        (params: LegendClickEvent) => {
            const now = Date.now();
            const { lastClick, singleClickTimeout } = legendClicksRef.current[
                params.name
            ] ?? {
                lastClick: 0,
                singleClickTimeout: undefined,
            };
            const isDoubleClick = now - lastClick <= DOUBLE_CLICK_DELAY;
            if (isDoubleClick) {
                clearTimeout(singleClickTimeout);
                delete legendClicksRef.current[params.name];
                if (
                    Object.entries(params.selected).every(([key, value]) => {
                        if (key !== params.name) {
                            return value === false;
                        }
                        return true;
                    })
                ) {
                    overrideSelectAllLegends(params);
                } else {
                    overrideSelectSingleLegend(params);
                }
            } else {
                const timeoutId = setTimeout(() => {
                    delete legendClicksRef.current[params.name];
                    applySelection(params.selected);
                }, DOUBLE_CLICK_DELAY + 50);
                legendClicksRef.current[params.name] = {
                    singleClickTimeout: timeoutId,
                    lastClick: now,
                };
            }
        },
        [applySelection, overrideSelectAllLegends, overrideSelectSingleLegend],
    );

    return { selectedLegends, onLegendChange };
};
