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

export const defaultVisualizationInputs: VisualizationState = {
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

/** A `renderHook` wrapper seeding a fresh store as the provider would; `hasConfigOwner` mimics an owner */
export const withVisualizationStore = (
    chartConfig: ChartConfig,
    inputs: Partial<VisualizationState> = {},
    { hasConfigOwner = false }: { hasConfigOwner?: boolean } = {},
): FC<PropsWithChildren> => {
    const state: VisualizationState = {
        ...defaultVisualizationInputs,
        ...inputs,
    };
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
