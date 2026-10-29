import { type ChartConfig } from '@lightdash/common';
import { createRef, type FC, type PropsWithChildren } from 'react';
import {
    ServicesContext,
    StateContext,
    type VisualizationServices,
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
    savedChartUuid: undefined,
    apiErrorDetail: undefined,
    isDashboard: undefined,
    isEditMode: undefined,
    resolvedTimezone: undefined,
    dateZoom: undefined,
};

/** No-op services whose `getInputs` reads the given inputs */
export const visualizationTestServices = (
    getInputs: () => VisualizationState,
): VisualizationServices => ({
    chartRef: createRef(),
    leafletMapRef: createRef(),
    setStacking: () => {},
    setCartesianType: () => {},
    setChartType: () => {},
    setPivotDimensions: () => {},
    setPivotRows: () => {},
    getInputs,
    isTouchDevice: false,
});

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
    const services = visualizationTestServices(() => state);
    return ({ children }) => (
        <VisualizationStoreTestProvider store={store}>
            <ServicesContext.Provider value={services}>
                <StateContext.Provider value={state}>
                    {children}
                </StateContext.Provider>
            </ServicesContext.Provider>
        </VisualizationStoreTestProvider>
    );
};
