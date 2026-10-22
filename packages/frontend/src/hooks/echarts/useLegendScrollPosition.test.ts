import { renderHook } from '@testing-library/react';
import type EChartsReact from 'echarts-for-react';
import type { RefObject } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { useLegendScrollPosition } from './useLegendScrollPosition';

const makeChartRef = () => {
    const instance = {
        dispatchAction: vi.fn(),
        isDisposed: () => false,
    };
    const chartRef = {
        current: { getEchartsInstance: () => instance },
    } as unknown as RefObject<EChartsReact | null>;
    return { chartRef, instance };
};

describe('useLegendScrollPosition', () => {
    test('does nothing until the legend has been scrolled', () => {
        const { chartRef, instance } = makeChartRef();
        const { rerender } = renderHook(
            ({ option }) => useLegendScrollPosition(chartRef, option),
            { initialProps: { option: {} } },
        );
        rerender({ option: {} });

        expect(instance.dispatchAction).not.toHaveBeenCalled();
    });

    test('restores the scroll position after the option changes', () => {
        const { chartRef, instance } = makeChartRef();
        const { result, rerender } = renderHook(
            ({ option }) => useLegendScrollPosition(chartRef, option),
            { initialProps: { option: {} } },
        );

        result.current.onLegendScroll({ scrollDataIndex: 12 });
        rerender({ option: {} });

        expect(instance.dispatchAction).toHaveBeenCalledWith({
            type: 'legendScroll',
            scrollDataIndex: 12,
        });
    });
});
