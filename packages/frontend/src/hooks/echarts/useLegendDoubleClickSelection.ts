import { useCallback, useRef, useState } from 'react';

export type LegendClickEvent = {
    name: string;
    selected: Record<string, boolean>;
};

const DOUBLE_CLICK_DELAY = 300;

export const useLegendDoubleClickSelection = () => {
    const [selectedLegends, setSelectedLegends] = useState<
        Record<string, boolean>
    >({});
    const legendClicksRef = useRef<
        Record<
            string,
            {
                singleClickTimeout: NodeJS.Timeout | undefined;
                lastClick: number;
            }
        >
    >({});

    const overrideSelectAllLegends = useCallback((params: LegendClickEvent) => {
        setSelectedLegends(
            Object.fromEntries(
                Object.keys(params.selected).map((key) => [key, true]),
            ),
        );
    }, []);

    const overrideSelectSingleLegend = useCallback(
        (params: LegendClickEvent) => {
            setSelectedLegends(
                Object.fromEntries(
                    Object.keys(params.selected).map((key) => [
                        key,
                        key === params.name,
                    ]),
                ),
            );
        },
        [],
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
                    setSelectedLegends(params.selected);
                }, DOUBLE_CLICK_DELAY + 50);
                legendClicksRef.current[params.name] = {
                    singleClickTimeout: timeoutId,
                    lastClick: now,
                };
            }
        },
        [overrideSelectAllLegends, overrideSelectSingleLegend],
    );

    return { selectedLegends, onLegendChange };
};
