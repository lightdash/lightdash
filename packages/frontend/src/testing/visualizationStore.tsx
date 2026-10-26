import { type ChartConfig } from '@lightdash/common';
import { type FC, type PropsWithChildren } from 'react';
import {
    StateContext,
    type VisualizationState,
} from '../components/LightdashVisualization/context';
import {
    buildInitialVisualizationState,
    createVisualizationStore,
} from '../features/visualization/store';
import { VisualizationStoreTestProvider } from './VisualizationStoreTestProvider';

const defaultInputs: VisualizationState = {
    resultsData: undefined,
    itemsMap: undefined,
    colorPalette: [],
    columnOrder: [],
    pivotDimensions: undefined,
    initialPivotRows: undefined,
    parameters: undefined,
    unsavedMetricQuery: undefined,
    tableCalculationsMetadata: undefined,
    dashboardFilters: undefined,
    invalidateCache: undefined,
    isLoading: false,
    minimal: false,
    getGroupColor: () => '#000000',
    hasExplorerStore: true,
};

/**
 * A `renderHook` wrapper with a fresh visualization store seeded from a chart
 * config the way the provider seeds it, and the inputs the hooks read.
 * `hasConfigOwner` seeds as a provider with an `onChartConfigChange` would.
 */
export const withVisualizationStore = (
    chartConfig: ChartConfig,
    inputs: Partial<VisualizationState> = {},
    { hasConfigOwner = false }: { hasConfigOwner?: boolean } = {},
): FC<PropsWithChildren> => {
    const state: VisualizationState = { ...defaultInputs, ...inputs };
    const store = createVisualizationStore(
        buildInitialVisualizationState(chartConfig, {
            itemsMap: state.itemsMap,
            hasConfigOwner,
        }),
    );
    return ({ children }) => (
        <VisualizationStoreTestProvider store={store}>
            <StateContext.Provider value={state}>
                {children}
            </StateContext.Provider>
        </VisualizationStoreTestProvider>
    );
};
