import {
    type ApiError,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DateGranularity,
    type FilterableDimension,
    type ResultColumn,
    type SortField,
} from '@lightdash/common';
import { type Dispatch, type SetStateAction } from 'react';
import {
    type useDashboardCommentsCheck,
    type useGetComments,
} from '../../features/comments';

export type SqlChartTileMetadata = {
    columns: ResultColumn[];
};
export type DashboardContextType = {
    projectUuid?: string;
    isDashboardLoading: boolean;
    dashboard: Dashboard | undefined;
    setEmbedDashboard: Dispatch<SetStateAction<Dashboard | undefined>>;
    dashboardError: ApiError | null;
    dashboardTiles: Dashboard['tiles'] | undefined;
    setDashboardTiles: Dispatch<SetStateAction<Dashboard['tiles'] | undefined>>;
    haveTilesChanged: boolean;
    setHaveTilesChanged: Dispatch<SetStateAction<boolean>>;
    haveTabsChanged: boolean;
    setHaveTabsChanged: Dispatch<SetStateAction<boolean>>;
    dashboardTabs: Dashboard['tabs'];
    setDashboardTabs: Dispatch<SetStateAction<Dashboard['tabs']>>;
    dashboardFilters: DashboardFilters;
    dashboardTemporaryFilters: DashboardFilters;
    allFilters: DashboardFilters;
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
        isEditMode: boolean,
    ) => void;
    removeDimensionDashboardFilter: (
        index: number,
        isTemporary: boolean,
    ) => void;
    addMetricDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    haveFiltersChanged: boolean;
    setHaveFiltersChanged: Dispatch<SetStateAction<boolean>>;
    addResultsCacheTime: (cacheMetadata: CacheMetadata) => void;
    oldestCacheTime: Date | undefined;
    invalidateCache: boolean | undefined;
    isAutoRefresh: boolean;
    setIsAutoRefresh: (autoRefresh: boolean) => void;
    clearCacheAndFetch: () => void;
    allFilterableFieldsMap: Record<string, FilterableDimension>;
    allFilterableFields: FilterableDimension[] | undefined;
    filterableFieldsByTileUuid:
        | Record<string, FilterableDimension[]>
        | undefined;
    hasTilesThatSupportFilters: boolean;
    chartSort: Record<string, SortField[]>;
    setChartSort: (sort: Record<string, SortField[]>) => void;
    sqlChartTilesMetadata: Record<string, SqlChartTileMetadata>;
    updateSqlChartTilesMetadata: (
        tileUuid: string,
        metadata: SqlChartTileMetadata,
    ) => void;
    dateZoomGranularity: DateGranularity | undefined;
    setDateZoomGranularity: Dispatch<
        SetStateAction<DateGranularity | undefined>
    >;
    chartsWithDateZoomApplied: Set<string> | undefined;
    setChartsWithDateZoomApplied: Dispatch<
        SetStateAction<Set<string> | undefined>
    >;
    dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
    dashboardComments?: ReturnType<typeof useGetComments>['data'];
    hasTileComments: (tileUuid: string) => boolean;
    requiredDashboardFilters: Pick<DashboardFilterRule, 'id' | 'label'>[];
    isDateZoomDisabled: boolean;
    setIsDateZoomDisabled: Dispatch<SetStateAction<boolean>>;
};
