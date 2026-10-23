import { ChartType, type ChartConfig } from '@lightdash/common';
import { act, cleanup } from '@testing-library/react';
import { useState, type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LightdashVisualization from '.';
import {
    buildInitialExplorerState,
    createExplorerStore,
} from '../../features/explorer/store';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { defaultState } from '../../providers/Explorer/defaultState';
import { renderWithProviders } from '../../testing/testUtils';
import { ConfigTabs as BigNumberConfigTabs } from '../VisualizationConfigs/BigNumberConfig/BigNumberConfigTabs';
import { ConfigTabs as ChartConfigTabs } from '../VisualizationConfigs/ChartConfigPanel/ConfigTabs';
import { ConfigTabs as PieChartConfigTabs } from '../VisualizationConfigs/PieChartConfig/PieChartConfigTabs';
import { ConfigTabs as TableConfigTabs } from '../VisualizationConfigs/TableConfigPanel/TableConfigTabs';
import {
    cartesianCases,
    columnOrder,
    otherCases,
    results,
} from './visualizationDifferential.fixtures';
import VisualizationProvider from './VisualizationProvider';

// Counts how often real chart and config components read the visualization
// contexts (one hook call per consumer render) when only the container size
// changes.

const consumerRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('./useVisualizationContext', async (importOriginal) => {
    const actual = await importOriginal<Record<string, () => unknown>>();
    return Object.fromEntries(
        Object.entries(actual).map(([name, hook]) => [
            name,
            () => {
                consumerRenders.count += 1;
                return hook();
            },
        ]),
    );
});

vi.mock('../MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
}));

// Real ECharts measures text via node-canvas; its cold font init times out CI.
vi.mock('../EChartsReactWrapper', () => ({ default: () => null }));

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

const Shell: FC<PropsWithChildren<{ chartConfig: ChartConfig }>> = ({
    chartConfig,
    children,
}) => {
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({
                isEditMode: true,
                initialState: {
                    unsavedChartVersion: {
                        ...defaultState.unsavedChartVersion,
                        tableName: 'orders',
                        metricQuery: results.metricQuery,
                        chartConfig,
                    },
                },
            }),
        }),
    );
    return (
        <Provider store={store}>
            <MemoryRouter>
                <ChartColorMappingContextProvider>
                    {children}
                </ChartColorMappingContextProvider>
            </MemoryRouter>
        </Provider>
    );
};

const palette = ['#111111', '#222222'];

const firstOfType = (type: ChartType) =>
    otherCases().find((c) => c.chartConfig.type === type)!.chartConfig;

const cases: [string, ChartConfig, FC][] = [
    ['table', firstOfType(ChartType.TABLE), TableConfigTabs],
    ['big number', firstOfType(ChartType.BIG_NUMBER), BigNumberConfigTabs],
    ['pie', firstOfType(ChartType.PIE), PieChartConfigTabs],
    ['cartesian', cartesianCases(0)[0].chartConfig, ChartConfigTabs],
];

describe('VisualizationProvider consumers on resize', () => {
    afterEach(() => cleanup());

    it.each(cases)(
        '%s chart and config panel skip size changes',
        (_, chartConfig, ConfigTabs) => {
            let setWidth: (width: number) => void = () => {};
            let setLoading: (loading: boolean) => void = () => {};
            // Hoisted so only context changes can re-render the subtrees.
            const children = (
                <>
                    <LightdashVisualization />
                    <ConfigTabs />
                </>
            );
            // Like a chart card: only the size owner re-renders on resize.
            const Host: FC = () => {
                const [width, setState] = useState(400);
                const [loading, setLoadingState] = useState(false);
                setWidth = setState;
                setLoading = setLoadingState;
                return (
                    <VisualizationProvider
                        initialPivotDimensions={undefined}
                        resultsData={results}
                        isLoading={loading}
                        columnOrder={columnOrder}
                        colorPalette={palette}
                        chartConfig={chartConfig}
                        containerWidth={width}
                        containerHeight={300}
                    >
                        {children}
                    </VisualizationProvider>
                );
            };
            renderWithProviders(
                <Shell chartConfig={chartConfig}>
                    <Host />
                </Shell>,
            );
            const afterMount = consumerRenders.count;
            expect(afterMount).toBeGreaterThan(0);

            for (let width = 401; width <= 410; width += 1) {
                act(() => setWidth(width));
            }

            expect(consumerRenders.count - afterMount).toBe(0);

            // Data changes still reach the same consumers.
            act(() => setLoading(true));
            expect(consumerRenders.count - afterMount).toBeGreaterThan(0);
        },
    );
});
