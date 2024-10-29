// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { barChartConfigSlice } from '../../../components/DataViz/store/barChartSlice';
import { lineChartConfigSlice } from '../../../components/DataViz/store/lineChartSlice';
import { pieChartConfigSlice } from '../../../components/DataViz/store/pieChartSlice';
import { tableVisSlice } from '../../../components/DataViz/store/tableVisSlice';
import { metricsCatalogSlice } from '../../metricsCatalog/store/metricsCatalogSlice';
import { semanticViewerSlice } from '../../semanticViewer/store/semanticViewerSlice';
import { listenerMiddleware } from './listenerMiddleware';
import { sqlRunnerSlice } from './sqlRunnerSlice';

// TODO: move this store to `frontend/src`
export const store = configureStore({
    reducer: {
        // TODO: important because selectors assume that
        [sqlRunnerSlice.name]: sqlRunnerSlice.reducer,
        barChartConfig: barChartConfigSlice.reducer,
        lineChartConfig: lineChartConfigSlice.reducer,
        pieChartConfig: pieChartConfigSlice.reducer,
        tableVisConfig: tableVisSlice.reducer,
        [semanticViewerSlice.name]: semanticViewerSlice.reducer,
        [metricsCatalogSlice.name]: metricsCatalogSlice.reducer,
    },
    // Add the listener middleware to the store, this is useful for listening to actions and running side effects
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // Ignore the getChartSpec function in the payload when pivoting chart data
                // This is because the function is not serializable, but we need to keep its instance to get the correct chart spec (see prepareAndFetchChartData thunk)
                ignoredActionPaths: ['payload.getChartSpec'],
            },
        }).prepend(listenerMiddleware.middleware),
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
