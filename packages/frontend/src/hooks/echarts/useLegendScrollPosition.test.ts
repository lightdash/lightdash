import { renderHook } from '@testing-library/react';
import type EChartsReact from 'echarts-for-react';
import type { RefObject } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { useLegendScrollPosition } from './useLegendScrollPosition';

const makeChartRef = () => {
    const instance = {
        setOption: vi.fn(),
        isDisposed: () => false,
    };
    const chartRef = {
        current: { getEchartsInstance: () => instance },
    } as unknown as RefObject<EChartsReact | null>;
    return { chartRef, instance };
};

type Option = { animation?: boolean; legend?: { animation?: boolean } };

const renderScrollHook = (initialOption: Option) => {
    const { chartRef, instance } = makeChartRef();
    const hook = renderHook(
        ({ option }) => useLegendScrollPosition(chartRef, option),
        { initialProps: { option: initialOption } },
    );
    return { ...hook, instance };
};

describe('useLegendScrollPosition', () => {
    test('returns the option unchanged until the legend has been scrolled', () => {
        const { result, rerender, instance } = renderScrollHook({
            legend: {},
        });
        const nextOption = { legend: {} };
        rerender({ option: nextOption });

        expect(result.current.optionWithScrollPosition).toBe(nextOption);
        expect(instance.setOption).not.toHaveBeenCalled();
    });

    test('builds the next option at the scrolled page without legend animation', () => {
        const { result, rerender } = renderScrollHook({ legend: {} });

        result.current.onLegendScroll({ scrollDataIndex: 12 });
        rerender({ option: { legend: {} } });

        expect(result.current.optionWithScrollPosition).toEqual({
            legend: { scrollDataIndex: 12, animation: false },
        });
    });

    test('restores the legend animation after the option is applied', () => {
        const { result, rerender, instance } = renderScrollHook({
            animation: false,
            legend: {},
        });

        result.current.onLegendScroll({ scrollDataIndex: 12 });
        rerender({ option: { animation: false, legend: {} } });

        expect(instance.setOption).toHaveBeenCalledWith({
            legend: { animation: false },
        });
    });

    test('leaves an option without a legend unchanged', () => {
        const { result, rerender, instance } = renderScrollHook({});

        result.current.onLegendScroll({ scrollDataIndex: 3 });
        const nextOption = {};
        rerender({ option: nextOption });

        expect(result.current.optionWithScrollPosition).toBe(nextOption);
        expect(instance.setOption).not.toHaveBeenCalled();
    });
});
