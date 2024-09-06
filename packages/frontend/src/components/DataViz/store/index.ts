import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { barChartConfigSlice, type BarChartActionsType } from './barChartSlice';
import {
    lineChartConfigSlice,
    type LineChartActionsType,
} from './lineChartSlice';
import { pieChartConfigSlice } from './pieChartSlice';
import { tableVisSlice } from './tableVisSlice';

// This store is not used, but instantiated to produce the right types
const dummyStore = configureStore({
    reducer: {
        barChartConfig: barChartConfigSlice.reducer,
        lineChartConfig: lineChartConfigSlice.reducer,
        pieChartConfig: pieChartConfigSlice.reducer,
        tableVisConfig: tableVisSlice.reducer,
    },
    devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof dummyStore.getState>;
export type AppDispatch = typeof dummyStore.dispatch;

export const useVizDispatch = useDispatch.withTypes<AppDispatch>();
export const useVizSelector = useSelector.withTypes<RootState>();

export type CartesianChartActionsType =
    | BarChartActionsType
    | LineChartActionsType;
