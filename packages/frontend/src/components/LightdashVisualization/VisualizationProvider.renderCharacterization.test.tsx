import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    QueryHistoryStatus,
    type ChartConfig,
    type Dimension,
    type ItemsMap,
    type Metric,
    type MetricQuery,
} from '@lightdash/common';
import { act, cleanup } from '@testing-library/react';
import {
    memo,
    useEffect,
    useState,
    type FC,
    type PropsWithChildren,
    type ReactElement,
} from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { renderWithProviders } from '../../testing/testUtils';
import { isCartesianVisualizationConfig } from './types';
import { useVisualizationContext } from './useVisualizationContext';
import VisualizationProvider, {
    type VisualizationProviderProps,
} from './VisualizationProvider';

// Pins today's render fan-out and config feedback behaviour of
// VisualizationProvider so a narrower context design can prove what it changes.

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

const fields: ItemsMap = {
    orders_order_date_month: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'order_date_month',
        label: 'Order month',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    } satisfies Dimension,
    orders_total: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'total',
        label: 'Total',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    } satisfies Metric,
};

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const resultsData: VisualizationProviderProps['resultsData'] = {
    queryUuid: 'query-uuid',
    queryStatus: QueryHistoryStatus.READY,
    rows: ['a', 'b'].map((month, i) => ({
        orders_order_date_month: { value: { raw: month, formatted: month } },
        orders_total: { value: { raw: i, formatted: `${i}` } },
    })),
    totalResults: 2,
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: () => {},
    refetchRows: async () => {},
    setFetchAll: () => {},
    fetchAll: false,
    hasFetchedAllRows: true,
    totalClientFetchTimeMs: undefined,
    error: null,
    metricQuery,
    fields,
} satisfies InfiniteQueryResults & {
    metricQuery: MetricQuery;
    fields: ItemsMap;
};

const cartesianConfig: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'orders_order_date_month',
            yField: ['orders_total'],
        },
        eChartsConfig: {},
    },
};

const tableConfig: ChartConfig = { type: ChartType.TABLE, config: undefined };

const counts = {
    loading: 0,
    items: 0,
    size: 0,
    config: 0,
    seriesColorIdentities: new Set<unknown>(),
    mounts: 0,
};
let editXAxisName: ((name: string) => void) | undefined;

const LoadingProbe = memo(() => {
    const value = useVisualizationContext().isLoading;
    counts.loading += 1;
    return <div data-value={String(!!value)} />;
});
const ItemsProbe = memo(() => {
    const value = useVisualizationContext().itemsMap;
    counts.items += 1;
    return <div data-value={String(!!value)} />;
});
const SizeProbe = memo(() => {
    const value = useVisualizationContext().containerWidth;
    counts.size += 1;
    return <div data-value={String(!!value)} />;
});
const ConfigProbe = memo(() => {
    const { visualizationConfig, getSeriesColor } = useVisualizationContext();
    counts.config += 1;
    counts.seriesColorIdentities.add(getSeriesColor);
    editXAxisName = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.setXAxisName
        : undefined;
    useEffect(() => {
        counts.mounts += 1;
    }, []);
    return null;
});

// Hoisted so only a context change can re-render the probes.
const probes = (
    <>
        <LoadingProbe />
        <ItemsProbe />
        <SizeProbe />
        <ConfigProbe />
    </>
);

const Shell: FC<PropsWithChildren> = ({ children }) => (
    <MemoryRouter>
        <ChartColorMappingContextProvider>
            {children}
        </ChartColorMappingContextProvider>
    </MemoryRouter>
);

const render = (ui: ReactElement) => {
    const result = renderWithProviders(<Shell>{ui}</Shell>);
    return {
        rerender: (next: ReactElement) =>
            result.rerender(<Shell>{next}</Shell>),
    };
};

const baseProps = {
    initialPivotDimensions: undefined,
    resultsData,
    isLoading: false,
    columnOrder: ['orders_order_date_month', 'orders_total'],
    colorPalette: ['#111111', '#222222'],
} satisfies Partial<VisualizationProviderProps>;

const renderedCounts = () => ({
    loading: counts.loading,
    items: counts.items,
    size: counts.size,
    config: counts.config,
});

describe('VisualizationProvider render characterization (baseline)', () => {
    beforeEach(() => {
        counts.loading = 0;
        counts.items = 0;
        counts.size = 0;
        counts.config = 0;
        counts.seriesColorIdentities = new Set();
        counts.mounts = 0;
        editXAxisName = undefined;
    });
    afterEach(() => cleanup());

    it('re-renders every consumer when only the container size changes', () => {
        const { rerender } = render(
            <VisualizationProvider
                {...baseProps}
                chartConfig={cartesianConfig}
                containerWidth={100}
            >
                {probes}
            </VisualizationProvider>,
        );
        const before = renderedCounts();

        rerender(
            <VisualizationProvider
                {...baseProps}
                chartConfig={cartesianConfig}
                containerWidth={200}
            >
                {probes}
            </VisualizationProvider>,
        );
        const after = renderedCounts();

        // Baseline: a size change reaches consumers that never read the size.
        expect(after.size - before.size).toBe(1);
        expect(after.loading - before.loading).toBe(1);
        expect(after.items - before.items).toBe(1);
        expect(after.config - before.config).toBe(1);
    });

    it('re-renders every consumer when the provider re-renders with identical props', () => {
        const { rerender } = render(
            <VisualizationProvider {...baseProps} chartConfig={cartesianConfig}>
                {probes}
            </VisualizationProvider>,
        );
        const before = renderedCounts();

        rerender(
            <VisualizationProvider {...baseProps} chartConfig={cartesianConfig}>
                {probes}
            </VisualizationProvider>,
        );
        const after = renderedCounts();

        expect(after.loading - before.loading).toBe(1);
        expect(after.items - before.items).toBe(1);
        expect(after.config - before.config).toBe(1);
    });

    it('re-emits the cartesian config on every render because the hook result is a new object', () => {
        // Read-only surfaces pass no handler; the explorer and AI pass one.
        const onChartConfigChange = vi.fn();
        const { rerender } = render(
            <VisualizationProvider
                {...baseProps}
                chartConfig={cartesianConfig}
                onChartConfigChange={onChartConfigChange}
            >
                {probes}
            </VisualizationProvider>,
        );
        const callsAfterMount = onChartConfigChange.mock.calls.length;

        for (let i = 0; i < 3; i += 1) {
            rerender(
                <VisualizationProvider
                    {...baseProps}
                    chartConfig={cartesianConfig}
                    onChartConfigChange={onChartConfigChange}
                >
                    {probes}
                </VisualizationProvider>,
            );
        }

        // The prop never catches up (no feedback), so every render emits.
        expect(callsAfterMount).toBe(3);
        expect(onChartConfigChange.mock.calls.length - callsAfterMount).toBe(3);
        const emitted = onChartConfigChange.mock.calls.map(
            ([chartConfig]) => chartConfig,
        );
        // Mount walks through the default normalization passes (layout
        // repair, then generated series) before the config settles.
        const distinct = [...new Set(emitted.map((c) => JSON.stringify(c)))];
        expect(distinct).toHaveLength(3);
        expect(
            new Set(
                emitted
                    .slice(callsAfterMount - 1)
                    .map((c) => JSON.stringify(c)),
            ).size,
        ).toBe(1);
    });

    describe('with an explorer-like feedback loop', () => {
        let resetToSaved: (() => void) | undefined;
        let latestParentConfig: ChartConfig | undefined;

        const FeedbackParent: FC<{ initial: ChartConfig }> = ({ initial }) => {
            const [chartConfig, setChartConfig] = useState(initial);
            latestParentConfig = chartConfig;
            resetToSaved = () => setChartConfig(structuredClone(initial));
            return (
                <VisualizationProvider
                    {...baseProps}
                    chartConfig={chartConfig}
                    onChartConfigChange={setChartConfig}
                >
                    {probes}
                </VisualizationProvider>
            );
        };

        it('settles after mount and an edit costs extra provider passes', () => {
            render(<FeedbackParent initial={cartesianConfig} />);
            const before = renderedCounts();
            const colorIdentitiesBefore = counts.seriesColorIdentities.size;

            act(() => editXAxisName?.('Edited'));
            const after = renderedCounts();

            expect(latestParentConfig?.type).toBe(ChartType.CARTESIAN);
            expect(
                latestParentConfig?.type === ChartType.CARTESIAN &&
                    latestParentConfig.config?.eChartsConfig.xAxis?.[0]?.name,
            ).toBe('Edited');
            // One edit: the hook's own state render, then the parent's
            // echoed config render, which also rebuilds the series colours.
            expect(after.config - before.config).toBe(2);
            expect(after.loading - before.loading).toBe(2);
            expect(
                counts.seriesColorIdentities.size - colorIdentitiesBefore,
            ).toBe(1);
        });

        it('ignores an external reset to the saved config and re-applies the edit', () => {
            render(<FeedbackParent initial={cartesianConfig} />);
            act(() => editXAxisName?.('Edited'));

            act(() => resetToSaved?.());

            // Baseline quirk: the editor hook only reads its initial config
            // on mount, so a same-instance reset (e.g. cancel without a
            // remount) is overwritten by the still-dirty hook state.
            expect(
                latestParentConfig?.type === ChartType.CARTESIAN &&
                    latestParentConfig.config?.eChartsConfig.xAxis?.[0]?.name,
            ).toBe('Edited');
        });
    });

    it('remounts the consumer subtree when the chart type changes', () => {
        const { rerender } = render(
            <VisualizationProvider {...baseProps} chartConfig={tableConfig}>
                {probes}
            </VisualizationProvider>,
        );
        expect(counts.mounts).toBe(1);

        rerender(
            <VisualizationProvider {...baseProps} chartConfig={cartesianConfig}>
                {probes}
            </VisualizationProvider>,
        );

        expect(counts.mounts).toBe(2);
    });
});
