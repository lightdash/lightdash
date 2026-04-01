import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type DashboardFiltersState = {
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    originalDashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
};

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const initialState: DashboardFiltersState = {
    dashboardFilters: emptyFilters,
    dashboardTemporaryFilters: emptyFilters,
    originalDashboardFilters: emptyFilters,
    haveFiltersChanged: false,
};

const dashboardFiltersSlice = createSlice({
    name: 'dashboardFilters',
    initialState,
    reducers: {
        setDashboardFilters(state, action: PayloadAction<DashboardFilters>) {
            state.dashboardFilters = action.payload;
        },
        setDashboardTemporaryFilters(
            state,
            action: PayloadAction<DashboardFilters>,
        ) {
            state.dashboardTemporaryFilters = action.payload;
        },
        setOriginalDashboardFilters(
            state,
            action: PayloadAction<DashboardFilters>,
        ) {
            state.originalDashboardFilters = action.payload;
        },
        setHaveFiltersChanged(state, action: PayloadAction<boolean>) {
            state.haveFiltersChanged = action.payload;
        },
        addDimensionDashboardFilter(
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                isTemporary: boolean;
            }>,
        ) {
            const { filter, isTemporary } = action.payload;
            const target = isTemporary
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            state[target] = {
                dimensions: [...state[target].dimensions, filter],
                metrics: state[target].metrics,
                tableCalculations: state[target].tableCalculations,
            };
            state.haveFiltersChanged = true;
        },
        updateDimensionDashboardFilter(
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                index: number;
                isTemporary: boolean;
            }>,
        ) {
            const { filter, index, isTemporary } = action.payload;
            const target = isTemporary
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            state[target] = {
                dimensions: [
                    ...state[target].dimensions.slice(0, index),
                    filter,
                    ...state[target].dimensions.slice(index + 1),
                ],
                metrics: state[target].metrics,
                tableCalculations: state[target].tableCalculations,
            };
            state.haveFiltersChanged = true;
        },
        removeDimensionDashboardFilter(
            state,
            action: PayloadAction<{ index: number; isTemporary: boolean }>,
        ) {
            const { index, isTemporary } = action.payload;
            const target = isTemporary
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            state[target] = {
                dimensions: [
                    ...state[target].dimensions.slice(0, index),
                    ...state[target].dimensions.slice(index + 1),
                ],
                metrics: state[target].metrics,
                tableCalculations: state[target].tableCalculations,
            };
            state.haveFiltersChanged = true;
        },
        addMetricDashboardFilter(
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                isTemporary: boolean;
            }>,
        ) {
            const { filter, isTemporary } = action.payload;
            const target = isTemporary
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            state[target] = {
                dimensions: state[target].dimensions,
                metrics: [...state[target].metrics, filter],
                tableCalculations: state[target].tableCalculations,
            };
            state.haveFiltersChanged = true;
        },
        updateMetricDashboardFilter(
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                index: number;
                isTemporary: boolean;
            }>,
        ) {
            const { filter, index, isTemporary } = action.payload;
            const target = isTemporary
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            state[target] = {
                dimensions: state[target].dimensions,
                metrics: [
                    ...state[target].metrics.slice(0, index),
                    filter,
                    ...state[target].metrics.slice(index + 1),
                ],
                tableCalculations: state[target].tableCalculations,
            };
            state.haveFiltersChanged = true;
        },
        removeMetricDashboardFilter(
            state,
            action: PayloadAction<{ index: number; isTemporary: boolean }>,
        ) {
            const { index, isTemporary } = action.payload;
            const target = isTemporary
                ? 'dashboardTemporaryFilters'
                : 'dashboardFilters';
            state[target] = {
                dimensions: state[target].dimensions,
                metrics: [
                    ...state[target].metrics.slice(0, index),
                    ...state[target].metrics.slice(index + 1),
                ],
                tableCalculations: state[target].tableCalculations,
            };
            state.haveFiltersChanged = true;
        },
        resetDashboardFilters(state, action: PayloadAction<DashboardFilters>) {
            state.dashboardFilters = action.payload;
            state.dashboardTemporaryFilters = emptyFilters;
        },
    },
});

export const dashboardFiltersActions = dashboardFiltersSlice.actions;
export const EMPTY_FILTERS = emptyFilters;
export default dashboardFiltersSlice.reducer;
