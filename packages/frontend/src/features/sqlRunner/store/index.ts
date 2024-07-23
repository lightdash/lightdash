// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars

import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { barChartSlice } from './barChartSlice';
import { sqlRunnerSlice } from './sqlRunnerSlice';

const rootReducer = combineReducers({
    sqlRunner: sqlRunnerSlice.reducer,
    barChartSlice: barChartSlice.reducer,
});

export const store = configureStore({
    reducer: rootReducer,
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
