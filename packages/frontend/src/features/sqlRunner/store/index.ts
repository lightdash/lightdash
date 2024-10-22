// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { barChartConfigSlice } from '../../../components/DataViz/store/barChartSlice';
import { lineChartConfigSlice } from '../../../components/DataViz/store/lineChartSlice';
import { pieChartConfigSlice } from '../../../components/DataViz/store/pieChartSlice';
import { tableVisSlice } from '../../../components/DataViz/store/tableVisSlice';
import { semanticViewerSlice } from '../../semanticViewer/store/semanticViewerSlice';
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
    },
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
