import { cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EChartsReact } from '../EChartsReactWrapper';
import SimpleGauge from './index';

const context = vi.hoisted(() => ({
    chartRef: { current: null },
    isLoading: false,
}));
vi.mock('../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => context,
}));
vi.mock('../../hooks/echarts/useEchartsGaugeConfig', () => ({
    default: () => ({
        eChartsOption: { series: [{ type: 'gauge', data: [{ value: 1 }] }] },
    }),
}));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('SimpleGauge resize listeners', () => {
    it('binds once per instance instead of on every render', () => {
        context.chartRef = createRef<EChartsReact>() as never;
        const observe = vi.spyOn(window.ResizeObserver.prototype, 'observe');
        const addListener = vi.spyOn(window, 'addEventListener');
        const resizeListeners = () =>
            addListener.mock.calls.filter(([type]) => type === 'resize').length;

        const { rerender } = render(<SimpleGauge isInDashboard />);
        expect(observe).toHaveBeenCalledTimes(1);
        expect(resizeListeners()).toBe(1);

        rerender(<SimpleGauge isInDashboard={false} />);
        rerender(<SimpleGauge isInDashboard />);
        expect(observe).toHaveBeenCalledTimes(1);
        expect(resizeListeners()).toBe(1);
    });

    it('chains a caller onChartReady', () => {
        context.chartRef = createRef<EChartsReact>() as never;
        const onChartReady = vi.fn();
        render(<SimpleGauge isInDashboard onChartReady={onChartReady} />);
        expect(onChartReady).toHaveBeenCalledTimes(1);
    });
});
