import {
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateGranularity,
    type InteractivityOptions,
    type ParameterDefinitions,
    type ParameterValue,
    type SortField,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

// ts-unused-exports:disable-next-line
export type DashboardFiltersState = {
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    originalDashboardFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    dateZoomGranularity: DateGranularity | string | undefined;
    isDateZoomDisabled: boolean;
    chartsWithDateZoomApplied: string[];
    dateZoomGranularities: (DateGranularity | string)[];
    haveDateZoomGranularitiesChanged: boolean;
    defaultDateZoomGranularity: DateGranularity | string | undefined;
    hasDefaultDateZoomGranularityChanged: boolean;
    isAddFilterDisabled: boolean;
    savedParameters: DashboardParameters;
    parameters: DashboardParameters;
    pinnedParameters: string[];
    havePinnedParametersChanged: boolean;
    parameterDefinitions: ParameterDefinitions;
    tileParameterReferences: Record<string, string[]>;
    chartSort: Record<string, SortField[]>;
    embedDashboard: (Dashboard & InteractivityOptions) | undefined;
};

const initialState: DashboardFiltersState = {
    dashboardFilters: emptyFilters,
    dashboardTemporaryFilters: emptyFilters,
    originalDashboardFilters: emptyFilters,
    haveFiltersChanged: false,
    dateZoomGranularity: undefined,
    isDateZoomDisabled: false,
    chartsWithDateZoomApplied: [],
    dateZoomGranularities: [],
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: undefined,
    hasDefaultDateZoomGranularityChanged: false,
    isAddFilterDisabled: false,
    savedParameters: {},
    parameters: {},
    pinnedParameters: [],
    havePinnedParametersChanged: false,
    parameterDefinitions: {},
    tileParameterReferences: {},
    chartSort: {},
    embedDashboard: undefined,
};

// ts-unused-exports:disable-next-line
export const dashboardFiltersSlice = createSlice({
    name: 'dashboardFilters',
    initialState,
    reducers: {
        setDashboardFilters: (
            state,
            action: PayloadAction<DashboardFilters>,
        ) => {
            state.dashboardFilters = action.payload;
        },
        setDashboardTemporaryFilters: (
            state,
            action: PayloadAction<DashboardFilters>,
        ) => {
            state.dashboardTemporaryFilters = action.payload;
        },
        setOriginalDashboardFilters: (
            state,
            action: PayloadAction<DashboardFilters>,
        ) => {
            state.originalDashboardFilters = action.payload;
        },
        setHaveFiltersChanged: (state, action: PayloadAction<boolean>) => {
            state.haveFiltersChanged = action.payload;
        },
        addDimensionFilter: (
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                isTemporary: boolean;
            }>,
        ) => {
            const target = action.payload.isTemporary
                ? state.dashboardTemporaryFilters
                : state.dashboardFilters;
            target.dimensions.push(action.payload.filter);
            state.haveFiltersChanged = true;
        },
        updateDimensionFilter: (
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                index: number;
                isTemporary: boolean;
            }>,
        ) => {
            const target = action.payload.isTemporary
                ? state.dashboardTemporaryFilters
                : state.dashboardFilters;
            target.dimensions[action.payload.index] = action.payload.filter;
            state.haveFiltersChanged = true;
        },
        removeDimensionFilter: (
            state,
            action: PayloadAction<{
                index: number;
                isTemporary: boolean;
            }>,
        ) => {
            const target = action.payload.isTemporary
                ? state.dashboardTemporaryFilters
                : state.dashboardFilters;
            target.dimensions.splice(action.payload.index, 1);
            state.haveFiltersChanged = true;
        },
        addMetricFilter: (
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                isTemporary: boolean;
            }>,
        ) => {
            const target = action.payload.isTemporary
                ? state.dashboardTemporaryFilters
                : state.dashboardFilters;
            target.metrics.push(action.payload.filter);
            state.haveFiltersChanged = true;
        },
        updateMetricFilter: (
            state,
            action: PayloadAction<{
                filter: DashboardFilterRule;
                index: number;
                isTemporary: boolean;
            }>,
        ) => {
            const target = action.payload.isTemporary
                ? state.dashboardTemporaryFilters
                : state.dashboardFilters;
            target.metrics[action.payload.index] = action.payload.filter;
            state.haveFiltersChanged = true;
        },
        removeMetricFilter: (
            state,
            action: PayloadAction<{
                index: number;
                isTemporary: boolean;
            }>,
        ) => {
            const target = action.payload.isTemporary
                ? state.dashboardTemporaryFilters
                : state.dashboardFilters;
            target.metrics.splice(action.payload.index, 1);
            state.haveFiltersChanged = true;
        },
        resetFilters: (state, action: PayloadAction<DashboardFilters>) => {
            state.dashboardFilters = action.payload;
            state.dashboardTemporaryFilters = emptyFilters;
            state.haveFiltersChanged = false;
        },
        setDateZoomGranularity: (
            state,
            action: PayloadAction<DateGranularity | string | undefined>,
        ) => {
            state.dateZoomGranularity = action.payload;
        },
        setIsDateZoomDisabled: (state, action: PayloadAction<boolean>) => {
            state.isDateZoomDisabled = action.payload;
        },
        setChartsWithDateZoomApplied: (
            state,
            action: PayloadAction<string[]>,
        ) => {
            state.chartsWithDateZoomApplied = action.payload;
        },
        setDateZoomGranularities: (
            state,
            action: PayloadAction<(DateGranularity | string)[]>,
        ) => {
            state.dateZoomGranularities = action.payload;
            state.haveDateZoomGranularitiesChanged = true;
        },
        setDateZoomGranularitiesRaw: (
            state,
            action: PayloadAction<(DateGranularity | string)[]>,
        ) => {
            state.dateZoomGranularities = action.payload;
        },
        setHaveDateZoomGranularitiesChanged: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.haveDateZoomGranularitiesChanged = action.payload;
        },
        setDefaultDateZoomGranularity: (
            state,
            action: PayloadAction<DateGranularity | string | undefined>,
        ) => {
            state.defaultDateZoomGranularity = action.payload;
            state.hasDefaultDateZoomGranularityChanged = true;
        },
        setDefaultDateZoomGranularityRaw: (
            state,
            action: PayloadAction<DateGranularity | string | undefined>,
        ) => {
            state.defaultDateZoomGranularity = action.payload;
        },
        setHasDefaultDateZoomGranularityChanged: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.hasDefaultDateZoomGranularityChanged = action.payload;
        },
        setIsAddFilterDisabled: (state, action: PayloadAction<boolean>) => {
            state.isAddFilterDisabled = action.payload;
        },
        setSavedParameters: (
            state,
            action: PayloadAction<DashboardParameters>,
        ) => {
            state.savedParameters = action.payload;
            state.parameters = action.payload;
        },
        setParameter: (
            state,
            action: PayloadAction<{
                key: string;
                value: ParameterValue | null;
            }>,
        ) => {
            const { key, value } = action.payload;
            if (
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0)
            ) {
                delete state.parameters[key];
            } else {
                state.parameters[key] = { parameterName: key, value };
            }
        },
        clearAllParameters: (state) => {
            state.parameters = {};
        },
        setPinnedParameters: (state, action: PayloadAction<string[]>) => {
            state.pinnedParameters = action.payload;
            state.havePinnedParametersChanged = true;
        },
        toggleParameterPin: (state, action: PayloadAction<string>) => {
            const key = action.payload;
            if (state.pinnedParameters.includes(key)) {
                state.pinnedParameters = state.pinnedParameters.filter(
                    (k) => k !== key,
                );
            } else {
                state.pinnedParameters.push(key);
            }
            state.havePinnedParametersChanged = true;
        },
        setHavePinnedParametersChanged: (
            state,
            action: PayloadAction<boolean>,
        ) => {
            state.havePinnedParametersChanged = action.payload;
        },
        addParameterDefinitions: (
            state,
            action: PayloadAction<ParameterDefinitions>,
        ) => {
            Object.assign(state.parameterDefinitions, action.payload);
        },
        setTileParameterReferences: (
            state,
            action: PayloadAction<{
                tileUuid: string;
                references: string[];
            }>,
        ) => {
            state.tileParameterReferences[action.payload.tileUuid] =
                action.payload.references;
        },
        cleanupStaleTileParameterReferences: (
            state,
            action: PayloadAction<string[]>,
        ) => {
            for (const tileId of Object.keys(state.tileParameterReferences)) {
                if (!action.payload.includes(tileId)) {
                    delete state.tileParameterReferences[tileId];
                }
            }
        },
        setChartSort: (
            state,
            action: PayloadAction<Record<string, SortField[]>>,
        ) => {
            state.chartSort = action.payload;
        },
        setEmbedDashboard: (
            state,
            action: PayloadAction<DashboardFiltersState['embedDashboard']>,
        ) => {
            state.embedDashboard = action.payload;
        },
    },
});

// ts-unused-exports:disable-next-line
export const dashboardFiltersActions = dashboardFiltersSlice.actions;
// ts-unused-exports:disable-next-line
export const dashboardFiltersReducer = dashboardFiltersSlice.reducer;
