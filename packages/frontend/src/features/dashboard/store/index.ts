// FIXES ts2742 issue with configureStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
import type * as rtk from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';
import { dashboardEditingSlice } from './dashboardEditingSlice';

export const dashboardEditingStore = configureStore({
    reducer: {
        [dashboardEditingSlice.name]: dashboardEditingSlice.reducer,
    },
    devTools: process.env.NODE_ENV === 'development',
});

export type DashboardEditingRootState = ReturnType<
    typeof dashboardEditingStore.getState
>;

export { dashboardEditingActions } from './dashboardEditingSlice';
