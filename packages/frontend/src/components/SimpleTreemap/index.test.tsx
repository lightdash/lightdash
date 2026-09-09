import { ChartType } from '@lightdash/common';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { createRef, type ContextType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MantineProvider from '../../providers/MantineProvider';
import { type EChartsReact } from '../EChartsReactWrapper';
import VisualizationContext from '../LightdashVisualization/context';
import { type VisualizationConfigTreemap } from '../LightdashVisualization/types';
import SimpleTreemap from './index';

const makeResultsData = (): NonNullable<TestContext['resultsData']> => ({
    rows: [],
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: vi.fn(),
    refetchRows: vi.fn(),
    setFetchAll: vi.fn(),
    fetchAll: false,
    hasFetchedAllRows: false,
    totalClientFetchTimeMs: undefined,
    error: null,
});

const makeContext = () => {
    const chartConfig: VisualizationConfigTreemap['chartConfig'] = {
        validConfig: { visibleMin: 0, leafDepth: 1 },
        isLoadingSubtotals: false,
        subtotalsError: null,
        groupFieldIds: ['category'],
        groupReorder: vi.fn(),
        sizeMetricId: 'amount',
        selectedSizeMetric: undefined,
        sizeMetricChange: vi.fn(),
        colorMetricId: null,
        selectedColorMetric: undefined,
        colorMetricChange: vi.fn(),
        useDynamicColors: false,
        setStartColorThreshold: vi.fn(),
        setEndColorThreshold: vi.fn(),
        visibleMin: 0,
        setVisibleMin: vi.fn(),
        leafDepth: 1,
        setLeafDepth: vi.fn(),
        data: Array.from({ length: 40 }, (_, i) => ({
            name: `Category ${i}`,
            value: [40 - i],
        })),
    };
    return {
        minimal: true,
        chartRef: createRef<EChartsReact>(),
        leafletMapRef: createRef(),
        pivotDimensions: undefined,
        resultsData: { ...makeResultsData(), hasFetchedAllRows: true },
        isLoading: false,
        columnOrder: [],
        itemsMap: {},
        visualizationConfig: {
            chartType: ChartType.TREEMAP,
            chartConfig,
            dimensions: {},
            numericMetrics: {},
        },
        setStacking: vi.fn(),
        setCartesianType: vi.fn(),
        setChartType: vi.fn(),
        setPivotDimensions: vi.fn(),
        getSeriesColor: () => '#123456',
        getGroupColor: () => '#123456',
        colorPalette: ['#123456'],
        chartConfig: { type: ChartType.TREEMAP, config: {} },
        hasExplorerStore: false,
        isTouchDevice: false,
    } satisfies NonNullable<ContextType<typeof VisualizationContext>>;
};

type TestContext = NonNullable<ContextType<typeof VisualizationContext>>;

const renderTreemap = (
    context: TestContext,
    onScreenshotReady: () => void,
    onScreenshotError = vi.fn(),
) => (
    <MantineProvider env="test">
        <VisualizationContext.Provider value={context}>
            <SimpleTreemap
                isInDashboard
                opts={{ renderer: 'svg', width: 800, height: 600 }}
                onScreenshotReady={onScreenshotReady}
                onScreenshotError={onScreenshotError}
            />
        </VisualizationContext.Provider>
    </MantineProvider>
);

afterEach(cleanup);

describe('SimpleTreemap screenshot readiness', () => {
    it('waits for the treemap to render and signals only once', async () => {
        const context = makeContext();
        const onScreenshotReady = vi.fn(() => {
            expect(
                context.chartRef.current
                    ?.getEchartsInstance()
                    .getZr()
                    .animation.isFinished(),
            ).toBe(true);
            expect(
                document.querySelectorAll('svg path').length,
            ).toBeGreaterThan(40);
            expect(document.querySelector('svg')?.textContent).toContain(
                'Category 0',
            );
        });
        render(renderTreemap(context, onScreenshotReady));

        expect(onScreenshotReady).not.toHaveBeenCalled();
        await waitFor(() => expect(onScreenshotReady).toHaveBeenCalledOnce(), {
            timeout: 3000,
        });

        act(() => context.chartRef.current?.getEchartsInstance().resize());
        expect(onScreenshotReady).toHaveBeenCalledOnce();
    });
    it.each([false, true])(
        'waits for all rows, including when initially empty (%s)',
        async (empty) => {
            const context = makeContext();
            const resultsData = makeResultsData();
            const onScreenshotReady = vi.fn();
            const initialContext = {
                ...context,
                resultsData,
                visualizationConfig: {
                    ...context.visualizationConfig,
                    chartConfig: {
                        ...context.visualizationConfig.chartConfig,
                        data: empty
                            ? []
                            : context.visualizationConfig.chartConfig.data,
                    },
                },
            };
            const { rerender } = render(
                renderTreemap(initialContext, onScreenshotReady),
            );
            if (!empty) {
                await waitFor(() =>
                    expect(
                        document.querySelector('svg')?.textContent,
                    ).toContain('Category 0'),
                );
                const finished = vi.fn();
                context.chartRef.current
                    ?.getEchartsInstance()
                    .on('finished', finished);
                act(() =>
                    context.chartRef.current
                        ?.getEchartsInstance()
                        .getZr()
                        .refresh(),
                );
                await waitFor(() => expect(finished).toHaveBeenCalled(), {
                    timeout: 3000,
                });
            }
            expect(onScreenshotReady).not.toHaveBeenCalled();
            expect(resultsData.setFetchAll).toHaveBeenCalledWith(true);

            rerender(
                renderTreemap(
                    {
                        ...initialContext,
                        resultsData: {
                            ...resultsData,
                            hasFetchedAllRows: true,
                        },
                    },
                    onScreenshotReady,
                ),
            );
            await waitFor(
                () => expect(onScreenshotReady).toHaveBeenCalledOnce(),
                { timeout: 3000 },
            );
        },
    );

    it.each([true, false])(
        'signals errors instead of success even with stale options (loading: %s)',
        (isLoading) => {
            const context = makeContext();
            const onScreenshotReady = vi.fn();
            const onScreenshotError = vi.fn();
            const { rerender } = render(
                renderTreemap(
                    {
                        ...context,
                        isLoading: true,
                        resultsData: makeResultsData(),
                    },
                    onScreenshotReady,
                    onScreenshotError,
                ),
            );
            expect(onScreenshotReady).not.toHaveBeenCalled();

            const erroredContext = {
                ...context,
                isLoading,
                resultsData: {
                    ...makeResultsData(),
                    hasFetchedAllRows: true,
                    error: {
                        status: 'error' as const,
                        error: {
                            name: 'Error',
                            message: 'Query failed',
                            statusCode: 500,
                            data: {},
                        },
                    },
                },
            };
            rerender(
                renderTreemap(
                    erroredContext,
                    onScreenshotReady,
                    onScreenshotError,
                ),
            );
            expect(onScreenshotError).toHaveBeenCalledOnce();
            expect(onScreenshotReady).not.toHaveBeenCalled();
            rerender(
                renderTreemap(
                    { ...erroredContext, isLoading: false },
                    onScreenshotReady,
                    onScreenshotError,
                ),
            );
            expect(onScreenshotError).toHaveBeenCalledOnce();
        },
    );
    it.each(['initialization', 'subtotals'])(
        'waits for %s before reporting a complete chart',
        async (pending) => {
            const context = makeContext();
            const onScreenshotReady = vi.fn();
            const { rerender } = render(
                renderTreemap(
                    {
                        ...context,
                        resultsData:
                            pending === 'initialization'
                                ? undefined
                                : context.resultsData,
                        visualizationConfig: {
                            ...context.visualizationConfig,
                            chartConfig: {
                                ...context.visualizationConfig.chartConfig,
                                data:
                                    pending === 'initialization'
                                        ? []
                                        : context.visualizationConfig
                                              .chartConfig.data,
                                isLoadingSubtotals: pending === 'subtotals',
                            },
                        },
                    },
                    onScreenshotReady,
                ),
            );
            if (pending === 'subtotals') {
                const finished = vi.fn();
                context.chartRef.current
                    ?.getEchartsInstance()
                    .on('finished', finished);
                await waitFor(() => expect(finished).toHaveBeenCalled(), {
                    timeout: 3000,
                });
            }
            expect(onScreenshotReady).not.toHaveBeenCalled();
            rerender(renderTreemap(context, onScreenshotReady));
            await waitFor(
                () => expect(onScreenshotReady).toHaveBeenCalledOnce(),
                { timeout: 3000 },
            );
        },
    );

    it('signals a subtotal error without waiting for a render', () => {
        const context = makeContext();
        const onScreenshotReady = vi.fn();
        const onScreenshotError = vi.fn();
        render(
            renderTreemap(
                {
                    ...context,
                    visualizationConfig: {
                        ...context.visualizationConfig,
                        chartConfig: {
                            ...context.visualizationConfig.chartConfig,
                            subtotalsError: {
                                status: 'error',
                                error: {
                                    name: 'Error',
                                    message: 'Subtotals failed',
                                    statusCode: 500,
                                    data: {},
                                },
                            },
                        },
                    },
                },
                onScreenshotReady,
                onScreenshotError,
            ),
        );
        expect(onScreenshotError).toHaveBeenCalledOnce();
        expect(onScreenshotReady).not.toHaveBeenCalled();
    });
});
