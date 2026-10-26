import { type FC, type PropsWithChildren } from 'react';
import { createVisualizationStore } from '../features/visualization/store';
import { VisualizationStoreTestProvider } from './VisualizationStoreTestProvider';

/** A `renderHook` wrapper with a fresh visualization store */
export const withVisualizationStore = (): FC<PropsWithChildren> => {
    const store = createVisualizationStore();
    return ({ children }) => (
        <VisualizationStoreTestProvider store={store}>
            {children}
        </VisualizationStoreTestProvider>
    );
};
