import { type FC, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import {
    VisualizationStoreContext,
    type VisualizationStore,
} from '../features/visualization/store';

export const VisualizationStoreTestProvider: FC<
    PropsWithChildren<{ store: VisualizationStore }>
> = ({ store, children }) => (
    <Provider store={store} context={VisualizationStoreContext}>
        {children}
    </Provider>
);
