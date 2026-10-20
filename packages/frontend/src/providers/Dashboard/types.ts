import {
    type AdditionalMetric,
    type ApiError,
    type ChartZoomableField,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateGranularity,
    type DateZoomConfig,
    type FilterableDimension,
    type Metric,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type PreAggregateMatchMiss,
    type ResultColumn,
    type SortField,
} from '@lightdash/common';
import { type Dispatch, type SetStateAction } from 'react';
import {
    type useDashboardCommentsCheck,
    type useGetComments,
} from '../../features/comments';
import { type TemporaryFilterLocks } from '../../features/dashboard/store/selectors';

export type SqlChartTileMetadata = {
    columns: ResultColumn[];
};

export type TilePreAggregateStatus = {
    tileUuid: string;
    tileName: string;
    hit: boolean;
    preAggregateName: string | null;
    reason: PreAggregateMatchMiss | null;
    reasonFieldLabel: string | null;
    hasPreAggregateMetadata: boolean;
    tabUuid: string | null | undefined;
};

export type DashboardContextType = {
    projectUuid?: string;
    includeUnpublishedDraft: boolean;
    isDashboardLoading: boolean;
    dashboard: Dashboard | undefined;
    setEmbedDashboard: Dispatch<SetStateAction<Dashboard | undefined>>;
    dashboardError: ApiError | null;
    dashboardTiles: Dashboard['tiles'] | undefined;
    setDashboardTiles: Dispatch<SetStateAction<Dashboard['tiles'] | undefined>>;
    haveTilesChanged: boolean;
    setHaveTilesChanged: Dispatch<SetStateAction<boolean>>;
    /** Staged registry of dashboard custom metrics; follows the tiles lifecycle */
    dashboardCustomMetrics: AdditionalMetric[];
    setDashboardCustomMetrics: Dispatch<SetStateAction<AdditionalMetric[]>>;
    haveCustomMetricsChanged: boolean;
    setHaveCustomMetricsChanged: Dispatch<SetStateAction<boolean>>;
    haveTabsChanged: boolean;
    setHaveTabsChanged: Dispatch<SetStateAction<boolean>>;
    dashboardTabs: Dashboard['tabs'];
    setDashboardTabs: Dispatch<SetStateAction<Dashboard['tabs']>>;
    activeTab: Dashboard['tabs'][number] | undefined;
    setActiveTab: Dispatch<
        SetStateAction<Dashboard['tabs'][number] | undefined>
    >;
    isLoadingDashboardFilters: boolean;
    isFetchingDashboardFilters: boolean;
    resetDashboardFilters: () => void;
    setDashboardFilters: Dispatch<SetStateAction<DashboardFilters>>;
    setDashboardTemporaryFilters: Dispatch<SetStateAction<DashboardFilters>>;
    addDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
        isInEditMode: boolean,
    ) => void;
    removeDimensionDashboardFilter: (
        index: number,
        isTemporary: boolean,
    ) => void;
    addMetricDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    updateMetricDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
        isInEditMode: boolean,
    ) => void;
    removeMetricDashboardFilter: (index: number, isTemporary: boolean) => void;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    allFilterableFieldsMap: Record<string, FilterableDimension>;
    allFilterableMetricsMap: Record<string, Metric>;
    hiddenFilterableFieldIds: ReadonlySet<string>;
    allFilterableFields: FilterableDimension[] | undefined;
    allFilterableMetrics: Metric[] | undefined;
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    temporaryFilterLocks: TemporaryFilterLocks | undefined;
    setChartZoomableFields: (
        tileUuid: string,
        fields: ChartZoomableField[],
    ) => void;
    hasTilesThatSupportFilters: boolean;
    chartSort: Record<string, SortField[]>;
    setChartSort: (sort: Record<string, SortField[]>) => void;
    setDateZoomGranularity: Dispatch<
        SetStateAction<DateGranularity | string | undefined>
    >;
    setTilesWithDateZoomApplied: Dispatch<
        SetStateAction<Set<string> | undefined>
    >;
    dateZoomConfig: DateZoomConfig;
    setDateZoomConfig: (config: DateZoomConfig) => void;
    hasDateZoomConfigChanged: boolean;
    setHasDateZoomConfigChanged: Dispatch<SetStateAction<boolean>>;
    setControlGranularity: (
        controlUuid: string,
        granularity: DateGranularity | string | undefined,
    ) => void;
    dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
    dashboardComments?: ReturnType<typeof useGetComments>['data'];
    hasTileComments: (tileUuid: string) => boolean;
    isDateZoomDisabled: boolean;
    setIsDateZoomDisabled: Dispatch<SetStateAction<boolean>>;
    isAddFilterDisabled: boolean;
    setIsAddFilterDisabled: Dispatch<SetStateAction<boolean>>;
    requiredFiltersNote: string | undefined;
    setRequiredFiltersNote: Dispatch<SetStateAction<string | undefined>>;
    setSavedParameters: Dispatch<SetStateAction<DashboardParameters>>;
    clearAllParameters: () => void;
    setParameter: (key: string, value: ParameterValue | null) => void;
    addParameterReferences: (tileUuid: string, references: string[]) => void;
    setTileChartSavedParameters: (
        tileUuid: string,
        values: ParametersValuesMap,
    ) => void;
    addParameterDefinitions: (parameters: ParameterDefinitions) => void;
    setPinnedParameters: (parameters: string[]) => void;
    toggleParameterPin: (parameterKey: string) => void;
    setHavePinnedParametersChanged: Dispatch<SetStateAction<boolean>>;
    setParameterOrder: (order: string[]) => void;
    setHasParameterOrderChanged: Dispatch<SetStateAction<boolean>>;
    dateZoomGranularities: (DateGranularity | string)[];
    setDateZoomGranularities: (
        granularities: (DateGranularity | string)[],
    ) => void;
    haveDateZoomGranularitiesChanged: boolean;
    setHaveDateZoomGranularitiesChanged: Dispatch<SetStateAction<boolean>>;
    defaultDateZoomGranularity: DateGranularity | string | undefined;
    setDefaultDateZoomGranularity: (
        granularity: DateGranularity | string | undefined,
    ) => void;
    hasDefaultDateZoomGranularityChanged: boolean;
    setHasDefaultDateZoomGranularityChanged: Dispatch<SetStateAction<boolean>>;
    refreshDashboardVersion: () => Promise<void>;
    isRefreshingDashboardVersion: boolean;
};
