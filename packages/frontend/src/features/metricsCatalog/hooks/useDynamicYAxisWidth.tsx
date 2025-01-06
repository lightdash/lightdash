import { useCallback, useState } from 'react';
import type { LineChart } from 'recharts';

type ChartRef =
    | ({
          container?: HTMLElement;
      } & Partial<typeof LineChart>)
    | null;

const DEFAULT_Y_AXIS_WIDTH = 20;

/**
 * This hook is used to dynamically set the width of the y-axis based on the width of the tick values.
 * This is used to ensure that the y-axis labels (and tick) are not cut off.
 */
export const useDynamicYAxisWidth = () => {
    const PADDING = 20;
    const TICK_VALUE_SELECTOR = '.recharts-cartesian-axis-tick-value';

    const [leftYAxisWidth, setLeftYAxisWidth] = useState<number | undefined>(
        DEFAULT_Y_AXIS_WIDTH,
    );
    const [rightYAxisWidth, setRightYAxisWidth] = useState<number | undefined>(
        DEFAULT_Y_AXIS_WIDTH,
    );

    const setChartRef = useCallback(
        (chartRef: ChartRef) => {
            if (!chartRef?.container) return;

            requestAnimationFrame(() => {
                const tickValueElements: NodeListOf<Element> | undefined =
                    chartRef.container?.querySelectorAll(TICK_VALUE_SELECTOR);

                if (!tickValueElements) {
                    return;
                }

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
                            return Math.round(Math.max(maxWidth, width));
                        },
                        0,
                    );

                    const newWidth = leftHighestWidth + PADDING;
                    if (newWidth !== leftYAxisWidth) {
                        setLeftYAxisWidth(newWidth);
                    }
                }

                if (rightTickArray.length > 0) {
                    const rightHighestWidth = rightTickArray.reduce(
                        (maxWidth, el) => {
                            const width = el.getBoundingClientRect().width;
                            return Math.round(Math.max(maxWidth, width));
                        },
                        0,
                    );

                    const newWidth = rightHighestWidth + PADDING;
                    if (newWidth !== rightYAxisWidth) {
                        setRightYAxisWidth(newWidth);
                    }
                }
            });
        },
        [leftYAxisWidth, rightYAxisWidth],
    );

    return { leftYAxisWidth, rightYAxisWidth, setChartRef };
};
