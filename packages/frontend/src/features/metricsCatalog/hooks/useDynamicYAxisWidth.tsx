import { useCallback, useState } from 'react';
import type { LineChart } from 'recharts';

const PADDING = 20;
const TICK_VALUE_SELECTOR = '.recharts-cartesian-axis-tick-value';

type ChartRef =
    | ({
          container?: HTMLElement;
      } & Partial<typeof LineChart>)
    | null;

/**
 * This hook is used to dynamically set the width of the y-axis based on the width of the tick values.
 * This is used to ensure that the y-axis labels (and tick) are not cut off.
 */
export const useDynamicYAxisWidth = () => {
    const [leftYAxisWidth, setLeftYAxisWidth] = useState<number | undefined>(
        undefined,
    );
    const [rightYAxisWidth, setRightYAxisWidth] = useState<number | undefined>(
        undefined,
    );

    const setChartRef = useCallback(
        (chartRef: ChartRef) => {
            if (!chartRef?.container) return;

            requestAnimationFrame(() => {
                const tickValueElements: NodeListOf<Element> =
                    chartRef.container!.querySelectorAll(TICK_VALUE_SELECTOR);

                const leftTickArray = Array.from(tickValueElements).filter(
                    (el) => el.getAttribute('orientation') === 'left',
                );

                const rightTickArray = Array.from(tickValueElements).filter(
                    (el) => el.getAttribute('orientation') === 'right',
                );

                if (leftTickArray.length > 0) {
                    const leftHighestWidth = leftTickArray.reduce(
                        (maxWidth, el) => {
                            const width = el.getBoundingClientRect().width;
                            return Math.max(maxWidth, width);
                        },
                        0,
                    );

                    const newWidth = leftHighestWidth + PADDING;
                    if (newWidth !== leftYAxisWidth) {
                        setLeftYAxisWidth(newWidth);
                    } else {
                        setLeftYAxisWidth(undefined);
                    }
                }

                if (rightTickArray.length > 0) {
                    const rightHighestWidth = rightTickArray.reduce(
                        (maxWidth, el) => {
                            const width = el.getBoundingClientRect().width;
                            return Math.max(maxWidth, width);
                        },
                        0,
                    );

                    const newWidth = rightHighestWidth + PADDING;
                    if (newWidth !== rightYAxisWidth) {
                        setRightYAxisWidth(newWidth);
                    } else {
                        setRightYAxisWidth(undefined);
                    }
                }
            });
        },
        [leftYAxisWidth, rightYAxisWidth],
    );

    return { leftYAxisWidth, rightYAxisWidth, setChartRef };
};
