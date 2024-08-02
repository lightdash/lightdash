// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { barChartConfigSlice, type BarChartActionsType } from './barChartSlice';
import {
    lineChartConfigSlice,
    type LineChartActionsType,
} from './lineChartSlice';
import { pieChartConfigSlice } from './pieChartSlice';
import { sqlRunnerSlice } from './sqlRunnerSlice';
import { tableVisSlice } from './tableVisSlice';

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

export type CartesianChartActionsType =
    | BarChartActionsType
    | LineChartActionsType;
