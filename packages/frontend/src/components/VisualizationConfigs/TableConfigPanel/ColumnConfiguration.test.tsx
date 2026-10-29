import { ChartType } from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import { useSyncExternalStore, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import ChartColorMappingContextProvider from '../../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { renderWithProviders } from '../../../testing/testUtils';
import {
    columnOrder,
    results,
} from '../../LightdashVisualization/visualizationDifferential.fixtures';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';

vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', async (io) => ({
    ...(await io<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));

type ExplorerStore = ReturnType<typeof createExplorerStore>;

const createStore = () =>
    createExplorerStore({
        explorer: buildInitialExplorerState({
            isEditMode: true,
            initialState: {
                unsavedChartVersion: {
                    ...defaultState.unsavedChartVersion,
                    tableName: 'orders',
                    metricQuery: results.metricQuery,
                    chartConfig: { type: ChartType.TABLE, config: {} },
                },
            },
        }),
    });

// Mounts the editor the way the explorer card does: the config round-trips through the explorer store
const ExplorerHost: FC<{ store: ExplorerStore }> = ({ store }) => {
    const chartConfig = useSyncExternalStore(
        store.subscribe,
        () => store.getState().explorer.unsavedChartVersion.chartConfig,
    );
    return (
        <VisualizationProvider
            initialPivotDimensions={undefined}
            resultsData={results}
            isLoading={false}
            columnOrder={columnOrder}
            colorPalette={['#111111']}
            chartConfig={chartConfig}
            unsavedMetricQuery={results.metricQuery}
            onChartConfigChange={(next) =>
                store.dispatch(
                    explorerActions.setChartConfig({ chartConfig: next }),
                )
            }
        >
            {chartConfig.type === ChartType.TABLE ? (
                <ColumnConfiguration fieldId="orders_status" />
            ) : null}
        </VisualizationProvider>
    );
};

const renderInExplorer = async (store: ExplorerStore) => {
    renderWithProviders(
        <MemoryRouter>
            <ChartColorMappingContextProvider>
                <ExplorerHost store={store} />
            </ChartColorMappingContextProvider>
        </MemoryRouter>,
    );
    await act(async () => {});
};

const savedColumnName = (store: ExplorerStore) => {
    const { chartConfig } = store.getState().explorer.unsavedChartVersion;
    return chartConfig.type === ChartType.TABLE
        ? (chartConfig.config?.columns?.orders_status?.name ?? null)
        : null;
};

const columnNameInput = () => screen.getByPlaceholderText(/status/i);

// The input commits on every change, so the saved name never lags the input
describe('ColumnConfiguration under the explorer', () => {
    it('saves exactly what was typed straight after each change', async () => {
        const store = createStore();
        await renderInExplorer(store);
        for (const typed of ['O', 'Order', 'Order state']) {
            fireEvent.change(columnNameInput(), { target: { value: typed } });
            expect(savedColumnName(store)).toBe(typed);
        }
    });

    it('keeps the saved name and shows it again after a chart type switch', async () => {
        const store = createStore();
        await renderInExplorer(store);
        fireEvent.change(columnNameInput(), {
            target: { value: 'Order state' },
        });
        act(() => {
            store.dispatch(
                explorerActions.setChartType({ chartType: ChartType.PIE }),
            );
        });
        act(() => {
            store.dispatch(
                explorerActions.setChartType({ chartType: ChartType.TABLE }),
            );
        });
        await act(async () => {});
        expect(savedColumnName(store)).toBe('Order state');
        expect(columnNameInput()).toHaveValue('Order state');
    });
});
