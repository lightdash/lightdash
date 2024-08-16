// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { barChartConfigSlice } from '../../../components/DataViz/store/barChartSlice';
import { lineChartConfigSlice } from '../../../components/DataViz/store/lineChartSlice';
import { pieChartConfigSlice } from '../../../components/DataViz/store/pieChartSlice';
import { tableVisSlice } from '../../../components/DataViz/store/tableVisSlice';
import { sqlRunnerSlice } from './sqlRunnerSlice';

export const store = configureStore({
    reducer: {
        sqlRunner: sqlRunnerSlice.reducer,
        barChartConfig: barChartConfigSlice.reducer,
        lineChartConfig: lineChartConfigSlice.reducer,
        pieChartConfig: pieChartConfigSlice.reducer,
        tableVisConfig: tableVisSlice.reducer,
    },
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
