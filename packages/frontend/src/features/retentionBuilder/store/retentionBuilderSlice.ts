import {
    RETENTION_DEFAULT_PERIODS,
    type ApiErrorDetail,
    type EventAnalyticsDatePreset,
    type Filters,
    type RetentionCohortType,
    type RetentionCriteria,
    type RetentionMode,
    type RetentionQueryResult,
    type RetentionUnit,
} from '@lightdash/common';
import {
    createSlice,
    type PayloadAction,
    type SerializedError,
} from '@reduxjs/toolkit';
import { fetchRetentionEventNames, runRetentionQuery } from './thunks';

export type RetentionSidebarTab = 'fields' | 'retention';

export interface RetentionBuilderState {
    projectUuid: string;
    activeTab: RetentionSidebarTab;

    // Event stream mapping (shared with the funnel builder)
    exploreName: string | null;
    timestampFieldId: string | null;
    userIdFieldId: string | null;
    eventNameFieldId: string | null;
    breakdownDimensionId: string | null;

    // Retention behaviour
    bornEvent: string | null;
    /** Null means any event */
    returnEvent: string | null;
    cohortType: RetentionCohortType;
    unit: RetentionUnit;
    periods: number;
    criteria: RetentionCriteria;
    mode: RetentionMode;

    // Cohort window
    dateRangePreset: EventAnalyticsDatePreset;
    customDateRange: [string | null, string | null];

    // Dimension filters, same payload as the semantic layer
    filters: Filters;

    eventNames: string[];
    eventNamesLoading: boolean;
    eventNamesError: ApiErrorDetail | SerializedError | null;

    results: RetentionQueryResult | null;
    queryLoading: boolean;
    queryError: ApiErrorDetail | SerializedError | null;
}

const initialState: RetentionBuilderState = {
    projectUuid: '',
    activeTab: 'fields',
    exploreName: null,
    timestampFieldId: null,
    userIdFieldId: null,
    eventNameFieldId: null,
    breakdownDimensionId: null,
    bornEvent: null,
    returnEvent: null,
    cohortType: 'first_time',
    unit: 'week',
    periods: RETENTION_DEFAULT_PERIODS.week,
    criteria: 'on',
    mode: 'calendar',
    dateRangePreset: 'last_90_days',
    customDateRange: [null, null],
    filters: {},
    eventNames: [],
    eventNamesLoading: false,
    eventNamesError: null,
    results: null,
    queryLoading: false,
    queryError: null,
};

export const retentionBuilderSlice = createSlice({
    name: 'retentionBuilder',
    initialState,
    selectors: {
        selectActiveTab: (state) => state.activeTab,
        selectExploreName: (state) => state.exploreName,
        selectTimestampFieldId: (state) => state.timestampFieldId,
        selectUserIdFieldId: (state) => state.userIdFieldId,
        selectEventNameFieldId: (state) => state.eventNameFieldId,
        selectBreakdownDimensionId: (state) => state.breakdownDimensionId,
        selectBornEvent: (state) => state.bornEvent,
        selectReturnEvent: (state) => state.returnEvent,
        selectCohortType: (state) => state.cohortType,
        selectUnit: (state) => state.unit,
        selectPeriods: (state) => state.periods,
        selectCriteria: (state) => state.criteria,
        selectMode: (state) => state.mode,
        selectDateRangePreset: (state) => state.dateRangePreset,
        selectCustomDateRange: (state) => state.customDateRange,
        selectFilters: (state) => state.filters,
        selectEventNames: (state) => state.eventNames,
        selectEventNamesLoading: (state) => state.eventNamesLoading,
        selectEventNamesError: (state) => state.eventNamesError,
        selectResults: (state) => state.results,
        selectQueryLoading: (state) => state.queryLoading,
        selectQueryError: (state) => state.queryError,
    },
    reducers: {
        resetState: () => initialState,
        setProjectUuid: (state, action: PayloadAction<string>) => {
            state.projectUuid = action.payload;
        },
        setActiveTab: (state, action: PayloadAction<RetentionSidebarTab>) => {
            state.activeTab = action.payload;
        },
        setExploreName: (state, action: PayloadAction<string | null>) => {
            state.exploreName = action.payload;
            state.timestampFieldId = null;
            state.userIdFieldId = null;
            state.eventNameFieldId = null;
            state.breakdownDimensionId = null;
            state.bornEvent = null;
            state.returnEvent = null;
            state.filters = {};
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
        setBornEvent: (state, action: PayloadAction<string | null>) => {
            state.bornEvent = action.payload;
        },
        setReturnEvent: (state, action: PayloadAction<string | null>) => {
            state.returnEvent = action.payload;
        },
        setCohortType: (state, action: PayloadAction<RetentionCohortType>) => {
            state.cohortType = action.payload;
        },
        setUnit: (state, action: PayloadAction<RetentionUnit>) => {
            state.unit = action.payload;
            state.periods = RETENTION_DEFAULT_PERIODS[action.payload];
        },
        setPeriods: (state, action: PayloadAction<number>) => {
            state.periods = action.payload;
        },
        setCriteria: (state, action: PayloadAction<RetentionCriteria>) => {
            state.criteria = action.payload;
        },
        setMode: (state, action: PayloadAction<RetentionMode>) => {
            state.mode = action.payload;
        },
        setDateRangePreset: (
            state,
            action: PayloadAction<EventAnalyticsDatePreset>,
        ) => {
            state.dateRangePreset = action.payload;
        },
        setCustomDateRange: (
            state,
            action: PayloadAction<[string | null, string | null]>,
        ) => {
            state.customDateRange = action.payload;
        },
        setFilters: (state, action: PayloadAction<Filters>) => {
            state.filters = action.payload;
        },
        clearResults: (state) => {
            state.results = null;
            state.queryError = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchRetentionEventNames.pending, (state) => {
                state.eventNamesLoading = true;
                state.eventNamesError = null;
            })
            .addCase(fetchRetentionEventNames.fulfilled, (state, action) => {
                state.eventNamesLoading = false;
                state.eventNames = action.payload;
            })
            .addCase(fetchRetentionEventNames.rejected, (state, action) => {
                state.eventNamesLoading = false;
                state.eventNamesError = action.payload ?? action.error;
            })
            .addCase(runRetentionQuery.pending, (state) => {
                state.queryLoading = true;
                state.queryError = null;
            })
            .addCase(runRetentionQuery.fulfilled, (state, action) => {
                state.queryLoading = false;
                state.results = action.payload;
            })
            .addCase(runRetentionQuery.rejected, (state, action) => {
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
    setBornEvent,
    setReturnEvent,
    setCohortType,
    setUnit,
    setPeriods,
    setCriteria,
    setMode,
    setDateRangePreset,
    setCustomDateRange,
    setFilters,
    clearResults,
} = retentionBuilderSlice.actions;

export const {
    selectActiveTab,
    selectExploreName,
    selectTimestampFieldId,
    selectUserIdFieldId,
    selectEventNameFieldId,
    selectBreakdownDimensionId,
    selectBornEvent,
    selectReturnEvent,
    selectCohortType,
    selectUnit,
    selectPeriods,
    selectCriteria,
    selectMode,
    selectDateRangePreset,
    selectCustomDateRange,
    selectFilters,
    selectEventNames,
    selectEventNamesLoading,
    selectEventNamesError,
    selectResults,
    selectQueryLoading,
    selectQueryError,
} = retentionBuilderSlice.selectors;
