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
    const [yAxisWidth, setYAxisWidth] = useState<number | undefined>(undefined);

    const setChartRef = useCallback((chartRef: ChartRef) => {
        if (chartRef && chartRef.container) {
            const tickValueElements: NodeListOf<Element> =
                chartRef.container.querySelectorAll(TICK_VALUE_SELECTOR);
            const highestWidth = Array.from(tickValueElements).reduce(
                (maxWidth, el) => {
                    const width = el.getBoundingClientRect().width;
                    return Math.max(maxWidth, width);
                },
                0,
            );

            setYAxisWidth(highestWidth + PADDING);
        }
    }, []);

    return { yAxisWidth, setChartRef };
};
