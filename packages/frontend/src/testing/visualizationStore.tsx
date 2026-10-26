import { type ChartConfig } from '@lightdash/common';
import { type FC, type PropsWithChildren } from 'react';
import {
    buildInitialVisualizationState,
    createVisualizationStore,
} from '../features/visualization/store';
import { VisualizationStoreTestProvider } from './VisualizationStoreTestProvider';

/** A `renderHook` wrapper with a fresh visualization store seeded from a chart config */
export const withVisualizationStore = (
    chartConfig: ChartConfig,
): FC<PropsWithChildren> => {
    const store = createVisualizationStore(
        buildInitialVisualizationState(chartConfig, undefined),
    );
    return ({ children }) => (
        <VisualizationStoreTestProvider store={store}>
            {children}
        </VisualizationStoreTestProvider>
    );
};
