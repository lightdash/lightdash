import { getGaugeSizes } from '@lightdash/visualization/editor';
import { act, cleanup, render } from '@testing-library/react';
import { type ECharts } from 'echarts';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fakeResizeObserverEntry,
    FakeResizeObserver,
    resizeObservers,
    resizeTarget,
} from '../../testing/fakeResizeObserver';
import { renderWithProviders } from '../../testing/testUtils';
import { type EChartsReact } from '../EChartsReactWrapper';
import SimpleGauge from './index';

const context = vi.hoisted(() => ({
    chartRef: { current: null },
    isLoading: false,
}));
vi.mock('../LightdashVisualization/useVisualizationContext', () => {
    const useVisualizationContext = () => context;
    return {
        useVisualizationContext,
        useVisualizationServices: useVisualizationContext,
        useVisualizationLayout: useVisualizationContext,
        useVisualizationState: useVisualizationContext,
    };
});
const gaugeConfigCalls = vi.hoisted(() => [] as object[]);
vi.mock('../../hooks/echarts/useEchartsGaugeConfig', () => ({
    default: (args: object) => {
        gaugeConfigCalls.push(args);
        return {
            eChartsOption: {
                series: [{ type: 'gauge', data: [{ value: 1 }] }],
            },
        };
    },
}));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    context.isLoading = false;
    gaugeConfigCalls.length = 0;
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

const measuredSizes = () => {
    const { isInDashboard: _, ...sizes } = gaugeConfigCalls.at(-1) as {
        isInDashboard: boolean;
    };
    return sizes;
};

describe('SimpleGauge measurement across a reload', () => {
    beforeEach(() => {
        resizeObservers.clear();
        vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    });

    it('stops observing the unmounted chart while loading and measures the new one', () => {
        context.chartRef = createRef<EChartsReact>() as never;
        const ready: ECharts[] = [];
        const onChartReady = (instance: ECharts) => ready.push(instance);
        const view = renderWithProviders(
            <SimpleGauge
                className="loaded"
                isInDashboard
                onChartReady={onChartReady}
            />,
        );
        const firstDom = ready[0].getDom();
        resizeTarget(firstDom, 400, 300);
        expect(measuredSizes()).toEqual(
            getGaugeSizes({ width: 400, height: 300 }),
        );
        const [firstObserver] = resizeObservers;

        // The mocked context does not re-render the memoized chart, a prop does
        context.isLoading = true;
        view.rerender(
            <SimpleGauge
                className="loading"
                isInDashboard
                onChartReady={onChartReady}
            />,
        );
        expect(firstDom.isConnected).toBe(false);
        expect(resizeObservers.size).toBe(0);
        // An observation of the detached target delivered before cleanup ran
        act(() => {
            firstObserver.callback(
                [fakeResizeObserverEntry(firstDom, 0, 0)],
                firstObserver,
            );
        });
        expect(measuredSizes()).toEqual(
            getGaugeSizes({ width: 400, height: 300 }),
        );

        context.isLoading = false;
        view.rerender(
            <SimpleGauge
                className="reloaded"
                isInDashboard
                onChartReady={onChartReady}
            />,
        );
        expect(ready).toHaveLength(2);
        const secondDom = ready[1].getDom();
        expect(secondDom).not.toBe(firstDom);
        expect([...resizeObservers].map((o) => [...o.targets])).toEqual([
            [secondDom],
        ]);
        resizeTarget(secondDom, 200, 100);
        expect(measuredSizes()).toEqual(
            getGaugeSizes({ width: 200, height: 100 }),
        );
    });

    it('applies a zero size from a connected, hidden container', () => {
        context.chartRef = createRef<EChartsReact>() as never;
        const ready: ECharts[] = [];
        renderWithProviders(
            <SimpleGauge
                isInDashboard
                onChartReady={(instance) => ready.push(instance)}
            />,
        );
        const dom = ready[0].getDom();
        resizeTarget(dom, 400, 300);
        resizeTarget(dom, 0, 0);
        expect(measuredSizes()).toEqual(getGaugeSizes({ width: 0, height: 0 }));
    });
});
