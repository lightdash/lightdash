import {
    type ApiError,
    type CacheMetadata,
    type Dashboard,
    type DashboardParameters,
    type DateGranularity,
    type InteractivityOptions,
    type FilterableDimension,
    type Metric,
    type ParameterDefinitions,
    type ParameterValue,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SortField,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import min from 'lodash/min';
import {
    type useDashboardCommentsCheck,
    type useGetComments,
} from '../../../features/comments';
import {
    type SqlChartTileMetadata,
    type TilePreAggregateStatus,
} from '../types';

export type DashboardDataState = {
    projectUuid: string | undefined;
    isDashboardLoading: boolean;
    dashboard: Dashboard | undefined;
    embedDashboard: (Dashboard & InteractivityOptions) | undefined;
    dashboardError: ApiError | null;
    dashboardTiles: Dashboard['tiles'] | undefined;
    haveTilesChanged: boolean;
    haveTabsChanged: boolean;
    dashboardTabs: Dashboard['tabs'];
    activeTab: Dashboard['tabs'][number] | undefined;
    isAutoRefresh: boolean;
    oldestCacheTime: Date | undefined;
    invalidateCache: boolean;
    chartSort: Record<string, SortField[]>;
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
    dateZoomGranularity: DateGranularity | string | undefined;
    chartsWithDateZoomApplied: Set<string> | undefined;
    dashboardCommentsCheck:
        | ReturnType<typeof useDashboardCommentsCheck>
        | undefined;
    dashboardComments: ReturnType<typeof useGetComments>['data'] | undefined;
    isDateZoomDisabled: boolean;
    isAddFilterDisabled: boolean;
    savedParameters: DashboardParameters;
    parameters: DashboardParameters;
    parametersHaveChanged: boolean;
    parameterDefinitions: ParameterDefinitions;
    tileParameterReferences: Record<string, string[]>;
    loadedTiles: Set<string>;
    pinnedParameters: string[];
    havePinnedParametersChanged: boolean;
    tilesWithTimestampDimension: Set<string>;
    availableCustomGranularities: Record<string, string>;
    dateZoomGranularities: (DateGranularity | string)[];
    haveDateZoomGranularitiesChanged: boolean;
    defaultDateZoomGranularity: DateGranularity | string | undefined;
    hasDefaultDateZoomGranularityChanged: boolean;
    preAggregateStatuses: Record<string, TilePreAggregateStatus>;
    isRefreshingDashboardVersion: boolean;
    screenshotReadyTiles: Set<string>;
    screenshotErroredTiles: Set<string>;

    // Derived data from React Query (set by sync component)
    savedChartUuidsAndTileUuids:
        | SavedChartsInfoForDashboardAvailableFilters
        | undefined;
    isLoadingDashboardFilters: boolean;
    isFetchingDashboardFilters: boolean;
    dashboardAvailableFiltersAllFilterableFields: Array<FilterableDimension>;
    dashboardAvailableFiltersAllFilterableMetrics: Array<Metric>;
    dashboardAvailableFiltersSavedQueryFilters: Record<string, number[]>;
    dashboardAvailableFiltersSavedQueryMetricFilters: Record<string, number[]>;

    selectedParametersCount: number;
};

const initialState: DashboardDataState = {
    projectUuid: undefined,
    isDashboardLoading: false,
    dashboard: undefined,
    embedDashboard: undefined,
    dashboardError: null,
    dashboardTiles: undefined,
    haveTilesChanged: false,
    haveTabsChanged: false,
    dashboardTabs: [],
    activeTab: undefined,
    isAutoRefresh: false,
    oldestCacheTime: undefined,
    invalidateCache: false,
    chartSort: {},
    sqlChartTilesMetadata: {},
    dateZoomGranularity: undefined,
    chartsWithDateZoomApplied: undefined,
    dashboardCommentsCheck: undefined,
    dashboardComments: undefined,
    isDateZoomDisabled: false,
    isAddFilterDisabled: false,
    savedParameters: {},
    parameters: {},
    parametersHaveChanged: false,
    parameterDefinitions: {},
    tileParameterReferences: {},
    loadedTiles: new Set(),
    pinnedParameters: [],
    havePinnedParametersChanged: false,
    tilesWithTimestampDimension: new Set(),
    availableCustomGranularities: {},
    dateZoomGranularities: [],
    haveDateZoomGranularitiesChanged: false,
    defaultDateZoomGranularity: undefined,
    hasDefaultDateZoomGranularityChanged: false,
    preAggregateStatuses: {},
    isRefreshingDashboardVersion: false,
    screenshotReadyTiles: new Set(),
    screenshotErroredTiles: new Set(),
    savedChartUuidsAndTileUuids: undefined,
    isLoadingDashboardFilters: false,
    isFetchingDashboardFilters: false,
    dashboardAvailableFiltersAllFilterableFields: [],
    dashboardAvailableFiltersAllFilterableMetrics: [],
    dashboardAvailableFiltersSavedQueryFilters: {},
    dashboardAvailableFiltersSavedQueryMetricFilters: {},
    selectedParametersCount: 0,
};

const dashboardDataSlice = createSlice({
    name: 'dashboardData',
    initialState,
    reducers: {
        setProjectUuid(state, action: PayloadAction<string | undefined>) {
            state.projectUuid = action.payload;
        },
        setIsDashboardLoading(state, action: PayloadAction<boolean>) {
            state.isDashboardLoading = action.payload;
        },
        setDashboard(state, action: PayloadAction<Dashboard | undefined>) {
            state.dashboard = action.payload;
        },
        setEmbedDashboard(
            state,
            action: PayloadAction<
                (Dashboard & InteractivityOptions) | undefined
            >,
        ) {
            state.embedDashboard = action.payload;
        },
        setDashboardError(state, action: PayloadAction<ApiError | null>) {
            state.dashboardError = action.payload;
        },
        setDashboardTiles(
            state,
            action: PayloadAction<Dashboard['tiles'] | undefined>,
        ) {
            state.dashboardTiles = action.payload;
        },
        setHaveTilesChanged(state, action: PayloadAction<boolean>) {
            state.haveTilesChanged = action.payload;
        },
        setHaveTabsChanged(state, action: PayloadAction<boolean>) {
            state.haveTabsChanged = action.payload;
        },
        setDashboardTabs(state, action: PayloadAction<Dashboard['tabs']>) {
            state.dashboardTabs = action.payload;
        },
        setActiveTab(
            state,
            action: PayloadAction<Dashboard['tabs'][number] | undefined>,
        ) {
            state.activeTab = action.payload;
        },
        setIsAutoRefresh(state, action: PayloadAction<boolean>) {
            state.isAutoRefresh = action.payload;
        },
        addResultsCacheTime(
            state,
            action: PayloadAction<CacheMetadata | undefined>,
        ) {
            const cacheMetadata = action.payload;
            if (
                cacheMetadata &&
                cacheMetadata.cacheHit &&
                cacheMetadata.cacheUpdatedTime
            ) {
                const newTime = cacheMetadata.cacheUpdatedTime;
                state.oldestCacheTime =
                    state.oldestCacheTime === undefined
                        ? newTime
                        : min([state.oldestCacheTime, newTime])!;
            }
        },
        setInvalidateCache(state, action: PayloadAction<boolean>) {
            state.invalidateCache = action.payload;
        },
        clearCacheAndFetch(state) {
            state.oldestCacheTime = undefined;
            state.preAggregateStatuses = {};
            state.loadedTiles = new Set();
            state.invalidateCache = true;
        },
        setChartSort(
            state,
            action: PayloadAction<Record<string, SortField[]>>,
        ) {
            state.chartSort = action.payload;
        },
        updateSqlChartTilesMetadata(
            state,
            action: PayloadAction<{
                tileUuid: string;
                metadata: SqlChartTileMetadata;
            }>,
        ) {
            state.sqlChartTilesMetadata[action.payload.tileUuid] =
                action.payload.metadata;
        },
        setDateZoomGranularity(
            state,
            action: PayloadAction<DateGranularity | string | undefined>,
        ) {
            state.dateZoomGranularity = action.payload;
        },
        setChartsWithDateZoomApplied(
            state,
            action: PayloadAction<Set<string> | undefined>,
        ) {
            state.chartsWithDateZoomApplied = action.payload;
        },
        setDashboardCommentsCheck(
            state,
            action: PayloadAction<
                ReturnType<typeof useDashboardCommentsCheck> | undefined
            >,
        ) {
            state.dashboardCommentsCheck = action.payload;
        },
        setDashboardComments(
            state,
            action: PayloadAction<
                ReturnType<typeof useGetComments>['data'] | undefined
            >,
        ) {
            state.dashboardComments = action.payload;
        },
        setIsDateZoomDisabled(state, action: PayloadAction<boolean>) {
            state.isDateZoomDisabled = action.payload;
        },
        setIsAddFilterDisabled(state, action: PayloadAction<boolean>) {
            state.isAddFilterDisabled = action.payload;
        },
        setSavedParameters(state, action: PayloadAction<DashboardParameters>) {
            state.savedParameters = action.payload;
        },
        setParameters(state, action: PayloadAction<DashboardParameters>) {
            state.parameters = action.payload;
        },
        setParameter(
            state,
            action: PayloadAction<{
                key: string;
                value: ParameterValue | null;
            }>,
        ) {
            const { key, value } = action.payload;
            if (
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0)
            ) {
                const newParams = { ...state.parameters };
                delete newParams[key];
                state.parameters = newParams;
            } else {
                state.parameters = {
                    ...state.parameters,
                    [key]: { parameterName: key, value },
                };
            }
        },
        clearAllParameters(state) {
            state.parameters = {};
        },
        setParametersHaveChanged(state, action: PayloadAction<boolean>) {
            state.parametersHaveChanged = action.payload;
        },
        addParameterDefinitions(
            state,
            action: PayloadAction<ParameterDefinitions>,
        ) {
            state.parameterDefinitions = {
                ...state.parameterDefinitions,
                ...action.payload,
            };
        },
        addParameterReferences(
            state,
            action: PayloadAction<{ tileUuid: string; references: string[] }>,
        ) {
            state.tileParameterReferences[action.payload.tileUuid] =
                action.payload.references;
            state.loadedTiles = new Set(state.loadedTiles).add(
                action.payload.tileUuid,
            );
        },
        setPinnedParameters(state, action: PayloadAction<string[]>) {
            state.pinnedParameters = action.payload;
            state.havePinnedParametersChanged = true;
        },
        toggleParameterPin(state, action: PayloadAction<string>) {
            const parameterKey = action.payload;
            const isCurrentlyPinned =
                state.pinnedParameters.includes(parameterKey);
            state.pinnedParameters = isCurrentlyPinned
                ? state.pinnedParameters.filter((key) => key !== parameterKey)
                : [...state.pinnedParameters, parameterKey];
            state.havePinnedParametersChanged = true;
        },
        setHavePinnedParametersChanged(state, action: PayloadAction<boolean>) {
            state.havePinnedParametersChanged = action.payload;
        },
        setTileHasTimestampDimension(
            state,
            action: PayloadAction<{ tileUuid: string; hasTimestamp: boolean }>,
        ) {
            const { tileUuid, hasTimestamp } = action.payload;
            const next = new Set(state.tilesWithTimestampDimension);
            if (hasTimestamp) {
                next.add(tileUuid);
            } else {
                next.delete(tileUuid);
            }
            state.tilesWithTimestampDimension = next;
        },
        addAvailableCustomGranularities(
            state,
            action: PayloadAction<Record<string, string>>,
        ) {
            const granularities = action.payload;
            const newKeys = Object.keys(granularities).filter(
                (k) => !(k in state.availableCustomGranularities),
            );
            if (newKeys.length > 0) {
                state.availableCustomGranularities = {
                    ...state.availableCustomGranularities,
                    ...granularities,
                };
            }
        },
        setDateZoomGranularities(
            state,
            action: PayloadAction<(DateGranularity | string)[]>,
        ) {
            state.dateZoomGranularities = action.payload;
            state.haveDateZoomGranularitiesChanged = true;
        },
        setDateZoomGranularitiesState(
            state,
            action: PayloadAction<(DateGranularity | string)[]>,
        ) {
            state.dateZoomGranularities = action.payload;
        },
        setHaveDateZoomGranularitiesChanged(
            state,
            action: PayloadAction<boolean>,
        ) {
            state.haveDateZoomGranularitiesChanged = action.payload;
        },
        setDefaultDateZoomGranularity(
            state,
            action: PayloadAction<DateGranularity | string | undefined>,
        ) {
            state.defaultDateZoomGranularity = action.payload;
            state.hasDefaultDateZoomGranularityChanged = true;
        },
        setDefaultDateZoomGranularityState(
            state,
            action: PayloadAction<DateGranularity | string | undefined>,
        ) {
            state.defaultDateZoomGranularity = action.payload;
        },
        setHasDefaultDateZoomGranularityChanged(
            state,
            action: PayloadAction<boolean>,
        ) {
            state.hasDefaultDateZoomGranularityChanged = action.payload;
        },
        setPreAggregateStatuses(
            state,
            action: PayloadAction<Record<string, TilePreAggregateStatus>>,
        ) {
            state.preAggregateStatuses = action.payload;
        },
        addPreAggregateStatus(
            state,
            action: PayloadAction<{
                tileUuid: string;
                status: TilePreAggregateStatus;
            }>,
        ) {
            state.preAggregateStatuses[action.payload.tileUuid] =
                action.payload.status;
        },
        setIsRefreshingDashboardVersion(state, action: PayloadAction<boolean>) {
            state.isRefreshingDashboardVersion = action.payload;
        },
        markTileScreenshotReady(state, action: PayloadAction<string>) {
            state.screenshotReadyTiles = new Set(
                state.screenshotReadyTiles,
            ).add(action.payload);
        },
        markTileScreenshotErrored(state, action: PayloadAction<string>) {
            state.screenshotErroredTiles = new Set(
                state.screenshotErroredTiles,
            ).add(action.payload);
        },
        resetScreenshotTiles(state) {
            state.screenshotReadyTiles = new Set();
            state.screenshotErroredTiles = new Set();
        },
        setTileParameterReferences(
            state,
            action: PayloadAction<Record<string, string[]>>,
        ) {
            state.tileParameterReferences = action.payload;
        },
        setLoadedTiles(state, action: PayloadAction<Set<string>>) {
            state.loadedTiles = action.payload;
        },
        markTileLoaded(state, action: PayloadAction<string>) {
            state.loadedTiles = new Set(state.loadedTiles).add(action.payload);
        },

        // Bulk setters for React Query data
        setSavedChartUuidsAndTileUuids(
            state,
            action: PayloadAction<
                SavedChartsInfoForDashboardAvailableFilters | undefined
            >,
        ) {
            state.savedChartUuidsAndTileUuids = action.payload;
        },
        setIsLoadingDashboardFilters(state, action: PayloadAction<boolean>) {
            state.isLoadingDashboardFilters = action.payload;
        },
        setIsFetchingDashboardFilters(state, action: PayloadAction<boolean>) {
            state.isFetchingDashboardFilters = action.payload;
        },
        setDashboardAvailableFiltersData(
            state,
            action: PayloadAction<{
                allFilterableFields: Array<FilterableDimension>;
                allFilterableMetrics: Array<Metric>;
                savedQueryFilters: Record<string, number[]>;
                savedQueryMetricFilters: Record<string, number[]>;
            }>,
        ) {
            state.dashboardAvailableFiltersAllFilterableFields =
                action.payload.allFilterableFields;
            state.dashboardAvailableFiltersAllFilterableMetrics =
                action.payload.allFilterableMetrics;
            state.dashboardAvailableFiltersSavedQueryFilters =
                action.payload.savedQueryFilters;
            state.dashboardAvailableFiltersSavedQueryMetricFilters =
                action.payload.savedQueryMetricFilters;
        },
        setSelectedParametersCount(state, action: PayloadAction<number>) {
            state.selectedParametersCount = action.payload;
        },
    },
});

export const dashboardDataActions = dashboardDataSlice.actions;
export default dashboardDataSlice.reducer;
