import {
    type ApiErrorDetail,
    type FunnelDatePreset,
    type FunnelQueryResult,
    type FunnelStep,
} from '@lightdash/common';
import {
    createSlice,
    type PayloadAction,
    type SerializedError,
} from '@reduxjs/toolkit';
import { fetchEventNames, runFunnelQuery } from './thunks';

export type SidebarTab = 'fields' | 'steps';

export interface FunnelBuilderState {
    projectUuid: string;
    activeTab: SidebarTab;

    // Field mapping
    exploreName: string | null;
    timestampFieldId: string | null;
    userIdFieldId: string | null;
    eventNameFieldId: string | null;
    breakdownDimensionId: string | null;

    // Funnel steps
    steps: FunnelStep[];

    // Date range
    dateRangePreset: FunnelDatePreset;
    customDateRange: [string | null, string | null]; // ISO strings for serialization

    // Conversion window
    conversionWindowValue: number;
    conversionWindowUnit: 'hours' | 'days' | 'weeks';

    // Event names (fetched when eventNameFieldId is set)
    eventNames: string[];
    eventNamesLoading: boolean;
    eventNamesError: ApiErrorDetail | SerializedError | null;

    // Query results
    results: FunnelQueryResult | null;
    queryLoading: boolean;
    queryError: ApiErrorDetail | SerializedError | null;
}

const initialState: FunnelBuilderState = {
    projectUuid: '',
    activeTab: 'fields',
    exploreName: null,
    timestampFieldId: null,
    userIdFieldId: null,
    eventNameFieldId: null,
    breakdownDimensionId: null,
    steps: [{ stepOrder: 1, eventName: '' }],
    dateRangePreset: 'last_30_days',
    customDateRange: [null, null],
    conversionWindowValue: 7,
    conversionWindowUnit: 'days',
    eventNames: [],
    eventNamesLoading: false,
    eventNamesError: null,
    results: null,
    queryLoading: false,
    queryError: null,
};

export const funnelBuilderSlice = createSlice({
    name: 'funnelBuilder',
    initialState,
    selectors: {
        selectActiveTab: (state) => state.activeTab,
        selectExploreName: (state) => state.exploreName,
        selectTimestampFieldId: (state) => state.timestampFieldId,
        selectUserIdFieldId: (state) => state.userIdFieldId,
        selectEventNameFieldId: (state) => state.eventNameFieldId,
        selectBreakdownDimensionId: (state) => state.breakdownDimensionId,
        selectSteps: (state) => state.steps,
        selectDateRangePreset: (state) => state.dateRangePreset,
        selectCustomDateRange: (state) => state.customDateRange,
        selectConversionWindowValue: (state) => state.conversionWindowValue,
        selectConversionWindowUnit: (state) => state.conversionWindowUnit,
        selectEventNames: (state) => state.eventNames,
        selectEventNamesLoading: (state) => state.eventNamesLoading,
        selectResults: (state) => state.results,
        selectQueryLoading: (state) => state.queryLoading,
        selectQueryError: (state) => state.queryError,
    },
    reducers: {
        resetState: () => initialState,
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setActiveTab: (state, action: PayloadAction<SidebarTab>) => {
            state.activeTab = action.payload;
        },
        setExploreName: (state, action: PayloadAction<string | null>) => {
            state.exploreName = action.payload;
            // Clear dependent fields when explore changes
            state.timestampFieldId = null;
            state.userIdFieldId = null;
            state.eventNameFieldId = null;
            state.breakdownDimensionId = null;
        },
        setTimestampFieldId: (state, action: PayloadAction<string | null>) => {
            state.timestampFieldId = action.payload;
        },
        setUserIdFieldId: (state, action: PayloadAction<string | null>) => {
            state.userIdFieldId = action.payload;
        },
        setEventNameFieldId: (state, action: PayloadAction<string | null>) => {
            state.eventNameFieldId = action.payload;
        },
        setBreakdownDimensionId: (
            state,
            action: PayloadAction<string | null>,
        ) => {
            state.breakdownDimensionId = action.payload;
        },
        setSteps: (state, action: PayloadAction<FunnelStep[]>) => {
            state.steps = action.payload;
        },
        addStep: (state) => {
            state.steps.push({
                stepOrder: state.steps.length + 1,
                eventName: '',
            });
        },
        removeStep: (state, action: PayloadAction<number>) => {
            state.steps = state.steps
                .filter((_, i) => i !== action.payload)
                .map((s, i) => ({ ...s, stepOrder: i + 1 }));
        },
        updateStepEventName: (
            state,
            action: PayloadAction<{ index: number; eventName: string }>,
        ) => {
            const { index, eventName } = action.payload;
            if (state.steps[index]) {
                state.steps[index].eventName = eventName;
            }
        },
        resetSteps: (state) => {
            state.steps = [{ stepOrder: 1, eventName: '' }];
        },
        setDateRangePreset: (
            state,
            action: PayloadAction<FunnelDatePreset>,
        ) => {
            state.dateRangePreset = action.payload;
        },
        setCustomDateRange: (
            state,
            action: PayloadAction<[string | null, string | null]>,
        ) => {
            state.customDateRange = action.payload;
        },
        setConversionWindowValue: (state, action: PayloadAction<number>) => {
            state.conversionWindowValue = action.payload;
        },
        setConversionWindowUnit: (
            state,
            action: PayloadAction<'hours' | 'days' | 'weeks'>,
        ) => {
            state.conversionWindowUnit = action.payload;
        },
        clearResults: (state) => {
            state.results = null;
            state.queryError = null;
        },
    },
    extraReducers: (builder) => {
        builder
            // Fetch event names
            .addCase(fetchEventNames.pending, (state) => {
                state.eventNamesLoading = true;
                state.eventNamesError = null;
            })
            .addCase(fetchEventNames.fulfilled, (state, action) => {
                state.eventNamesLoading = false;
                state.eventNames = action.payload;
            })
            .addCase(fetchEventNames.rejected, (state, action) => {
                state.eventNamesLoading = false;
                state.eventNamesError = action.payload ?? action.error;
            })
            // Run funnel query
            .addCase(runFunnelQuery.pending, (state) => {
                state.queryLoading = true;
                state.queryError = null;
            })
            .addCase(runFunnelQuery.fulfilled, (state, action) => {
                state.queryLoading = false;
                state.results = action.payload;
            })
            .addCase(runFunnelQuery.rejected, (state, action) => {
                state.queryLoading = false;
                state.queryError = action.payload ?? action.error;
            });
    },
});

export const {
    resetState,
    setProjectUuid,
    setActiveTab,
    setExploreName,
    setTimestampFieldId,
    setUserIdFieldId,
    setEventNameFieldId,
    setBreakdownDimensionId,
    setSteps,
    addStep,
    removeStep,
    updateStepEventName,
    resetSteps,
    setDateRangePreset,
    setCustomDateRange,
    setConversionWindowValue,
    setConversionWindowUnit,
    clearResults,
} = funnelBuilderSlice.actions;

export const {
    selectActiveTab,
    selectExploreName,
    selectTimestampFieldId,
    selectUserIdFieldId,
    selectEventNameFieldId,
    selectBreakdownDimensionId,
    selectSteps,
    selectDateRangePreset,
    selectCustomDateRange,
    selectConversionWindowValue,
    selectConversionWindowUnit,
    selectEventNames,
    selectEventNamesLoading,
    selectResults,
    selectQueryLoading,
} = funnelBuilderSlice.selectors;

//    selectQueryError, unused in prototype - add error handling later
