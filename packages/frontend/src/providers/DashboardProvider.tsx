import {
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    DateGranularity,
    fieldId,
    isDashboardChartTileType,
    type ApiError,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterableField,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SchedulerFilterRule,
    type SortField,
} from '@lightdash/common';
import min from 'lodash/min';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import { createContext, useContextSelector } from 'use-context-selector';
import { getConditionalRuleLabel } from '../components/common/Filters/FilterInputs';
import {
    type FieldsWithSuggestions,
    type FieldWithSuggestions,
} from '../components/common/Filters/FiltersProvider';
import { hasSavedFilterValueChanged } from '../components/DashboardFilter/FilterConfiguration/utils';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../features/comments';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
} from '../hooks/dashboard/useDashboard';
import {
    hasSavedFiltersOverrides,
    useSavedDashboardFiltersOverrides,
} from '../hooks/useSavedDashboardFiltersOverrides';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

type DashboardContext = {
    projectUuid?: string;
    isDashboardLoading: boolean;
    dashboard: Dashboard | undefined;
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
    clearCacheAndFetch: () => void;
    fieldsWithSuggestions: FieldsWithSuggestions;
    allFilterableFields: FilterableField[] | undefined;
    filterableFieldsByTileUuid: Record<string, FilterableField[]> | undefined;
    hasChartTiles: boolean;
    chartSort: Record<string, SortField[]>;
    setChartSort: (sort: Record<string, SortField[]>) => void;
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
};

const Context = createContext<DashboardContext | undefined>(undefined);

export const DashboardProvider: React.FC<
    React.PropsWithChildren<{
        schedulerFilters?: SchedulerFilterRule[] | undefined;
        dateZoom?: DateGranularity | undefined;
        projectUuid?: string;
        dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
    }>
> = ({
    schedulerFilters,
    dateZoom,
    projectUuid,
    dashboardCommentsCheck,
    children,
}) => {
    const { search, pathname } = useLocation();
    const history = useHistory();

    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>();

    const {
        data: dashboard,
        isInitialLoading: isDashboardLoading,
        error: dashboardError,
    } = useDashboardQuery(dashboardUuid, {
        select: (d) => {
            if (schedulerFilters) {
                const overriddenDimensions = applyDimensionOverrides(
                    d.filters,
                    schedulerFilters,
                );

                return {
                    ...d,
                    filters: {
                        ...d.filters,
                        dimensions: overriddenDimensions,
                    },
                };
            }
            return d;
        },
    });

    const { data: dashboardComments } = useGetComments(
        dashboardUuid,
        !!dashboardCommentsCheck &&
            !!dashboardCommentsCheck.canViewDashboardComments,
    );
    const hasTileComments = useCallback(
        (tileUuid: string) =>
            !!(
                dashboardComments &&
                dashboardComments[tileUuid] &&
                dashboardComments[tileUuid].length > 0
            ),
        [dashboardComments],
    );

    const [dashboardTiles, setDashboardTiles] = useState<Dashboard['tiles']>();
    const [haveTilesChanged, setHaveTilesChanged] = useState<boolean>(false);
    const [haveTabsChanged, setHaveTabsChanged] = useState<boolean>(false);
    const [dashboardTabs, setDashboardTabs] = useState<Dashboard['tabs']>([]);
    const [dashboardTemporaryFilters, setDashboardTemporaryFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [dashboardFilters, setDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [originalDashboardFilters, setOriginalDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] =
        useState<boolean>(false);
    const [resultsCacheTimes, setResultsCacheTimes] = useState<Date[]>([]);

    const [invalidateCache, setInvalidateCache] = useState<boolean>(false);

    const [chartSort, setChartSort] = useState<Record<string, SortField[]>>({});

    const [dateZoomGranularity, setDateZoomGranularity] = useState<
        DateGranularity | undefined
    >(dateZoom);

    const [chartsWithDateZoomApplied, setChartsWithDateZoomApplied] =
        useState<Set<string>>();

    // Update dashboard url date zoom change
    useEffect(() => {
        const newParams = new URLSearchParams(search);
        if (dateZoomGranularity === undefined) {
            newParams.delete('dateZoom');
        } else {
            newParams.set('dateZoom', dateZoomGranularity.toLowerCase());
        }

        history.replace({
            pathname,
            search: newParams.toString(),
        });
    }, [dateZoomGranularity, search, history, pathname]);

    const {
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
    } = useSavedDashboardFiltersOverrides();

    const savedChartUuidsAndTileUuids = useMemo(
        () =>
            dashboardTiles
                ?.filter(isDashboardChartTileType)
                .reduce<SavedChartsInfoForDashboardAvailableFilters>(
                    (acc, tile) => {
                        if (tile.properties.savedChartUuid) {
                            acc.push({
                                tileUuid: tile.uuid,
                                savedChartUuid: tile.properties.savedChartUuid,
                            });
                        }
                        return acc;
                    },
                    [],
                ),
        [dashboardTiles],
    );

    useEffect(() => {
        if (dashboard) {
            if (dashboardFilters === emptyFilters) {
                let updatedDashboardFilters;

                if (
                    hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
                ) {
                    updatedDashboardFilters = {
                        ...dashboard.filters,
                        dimensions: applyDimensionOverrides(
                            dashboard.filters,
                            overridesForSavedDashboardFilters,
                        ),
                    };
                } else {
                    updatedDashboardFilters = dashboard.filters;
                }

                setDashboardFilters(updatedDashboardFilters);
                setHaveFiltersChanged(false);
            }

            setOriginalDashboardFilters(dashboard.filters);
        }
    }, [dashboard, dashboardFilters, overridesForSavedDashboardFilters]);

    // Updates url with temp filters
    useEffect(() => {
        const newParams = new URLSearchParams(search);
        if (
            dashboardTemporaryFilters?.dimensions?.length === 0 &&
            dashboardTemporaryFilters?.metrics?.length === 0
        ) {
            newParams.delete('tempFilters');
        } else {
            newParams.set(
                'tempFilters',
                JSON.stringify(
                    compressDashboardFiltersToParam(dashboardTemporaryFilters),
                ),
            );
        }

        if (overridesForSavedDashboardFilters?.dimensions?.length === 0) {
            newParams.delete('filters');
        } else if (overridesForSavedDashboardFilters?.dimensions?.length > 0) {
            newParams.set(
                'filters',
                JSON.stringify(
                    compressDashboardFiltersToParam(
                        overridesForSavedDashboardFilters,
                    ),
                ),
            );
        }

        history.replace({
            pathname,
            search: newParams.toString(),
        });
    }, [
        dashboardFilters,
        dashboardTemporaryFilters,
        history,
        pathname,
        overridesForSavedDashboardFilters,
        search,
    ]);

    useEffect(() => {
        if (
            dashboard?.filters &&
            hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
        ) {
            setDashboardFilters((prevFilters) => ({
                ...prevFilters,
                dimensions: applyDimensionOverrides(
                    prevFilters,
                    overridesForSavedDashboardFilters,
                ),
            }));
        }
    }, [dashboard?.filters, overridesForSavedDashboardFilters]);

    // Gets filters and dateZoom from URL and storage after redirect
    useMount(() => {
        const searchParams = new URLSearchParams(search);

        // Date zoom
        const dateZoomParam = searchParams.get('dateZoom');
        if (dateZoomParam) {
            const dateZoomUrl = Object.values(DateGranularity).find(
                (granularity) =>
                    granularity.toLowerCase() === dateZoomParam?.toLowerCase(),
            );
            if (dateZoomUrl) setDateZoomGranularity(dateZoomUrl);
        }

        // Temp filters
        const tempFilterSearchParam = searchParams.get('tempFilters');
        const unsavedDashboardFiltersRaw = sessionStorage.getItem(
            'unsavedDashboardFilters',
        );

        sessionStorage.removeItem('unsavedDashboardFilters');
        if (unsavedDashboardFiltersRaw) {
            const unsavedDashboardFilters = JSON.parse(
                unsavedDashboardFiltersRaw,
            );
            // TODO: this should probably merge with the filters
            // from the database. This will break if they diverge,
            // meaning there is a subtle race condition here
            setDashboardFilters(unsavedDashboardFilters);
        }
        if (tempFilterSearchParam) {
            setDashboardTemporaryFilters(
                convertDashboardFiltersParamToDashboardFilters(
                    JSON.parse(tempFilterSearchParam),
                ),
            );
        }
    });

    const {
        isInitialLoading: isLoadingDashboardFilters,
        isFetching: isFetchingDashboardFilters,
        data: dashboardAvailableFiltersData,
    } = useDashboardsAvailableFilters(savedChartUuidsAndTileUuids ?? []);

    const filterableFieldsByTileUuid = useMemo(() => {
        if (!dashboard || !dashboardTiles || !dashboardAvailableFiltersData)
            return;

        const filterFieldsMapping = savedChartUuidsAndTileUuids?.reduce<
            Record<string, FilterableField[]>
        >((acc, { tileUuid }) => {
            const filterFields =
                dashboardAvailableFiltersData.savedQueryFilters[tileUuid]?.map(
                    (index) =>
                        dashboardAvailableFiltersData.allFilterableFields[
                            index
                        ],
                );

            if (filterFields) {
                acc[tileUuid] = filterFields;
            }

            return acc;
        }, {});

        return filterFieldsMapping;
    }, [
        dashboard,
        dashboardTiles,
        dashboardAvailableFiltersData,
        savedChartUuidsAndTileUuids,
    ]);

    const fieldsWithSuggestions = useMemo(() => {
        return dashboardAvailableFiltersData &&
            dashboardAvailableFiltersData.allFilterableFields &&
            dashboardAvailableFiltersData.allFilterableFields.length > 0
            ? dashboardAvailableFiltersData.allFilterableFields.reduce<FieldsWithSuggestions>(
                  (sum, field) => ({
                      ...sum,
                      [fieldId(field)]: field,
                  }),
                  {},
              )
            : {};
    }, [dashboardAvailableFiltersData]);

    const allFilters = useMemo(() => {
        return {
            dimensions: [
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters?.dimensions,
            ],
            metrics: [
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters?.metrics,
            ],
            tableCalculations: [
                ...dashboardFilters.tableCalculations,
                ...dashboardTemporaryFilters?.tableCalculations,
            ],
        };
    }, [dashboardFilters, dashboardTemporaryFilters]);

    const hasChartTiles = useMemo(
        () =>
            Boolean(
                dashboardTiles &&
                    dashboardTiles.filter(isDashboardChartTileType).length >= 1,
            ),
        [dashboardTiles],
    );

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: [...previousFilters.dimensions, filter],
                metrics: previousFilters.metrics,
                tableCalculations: previousFilters.tableCalculations,
            }));
            setHaveFiltersChanged(true);
        },
        [setDashboardFilters],
    );

    const updateDimensionDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isEditMode: boolean,
        ) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;

            const isFilterSaved = dashboard?.filters.dimensions.some(
                ({ id }) => id === item.id,
            );

            setFunction((previousFilters) => {
                if (!isTemporary) {
                    if (isEditMode) {
                        removeSavedFilterOverride(item);
                    } else {
                        const isReverted =
                            originalDashboardFilters.dimensions[index] &&
                            !hasSavedFilterValueChanged(
                                originalDashboardFilters.dimensions[index],
                                item,
                            );
                        if (isReverted) {
                            removeSavedFilterOverride(item);
                        } else {
                            const hasChanged = hasSavedFilterValueChanged(
                                previousFilters.dimensions[index],
                                item,
                            );

                            if (hasChanged && isFilterSaved) {
                                addSavedFilterOverride(item);
                            }
                        }
                    }
                }
                return {
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        item,
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                    tableCalculations: previousFilters.tableCalculations,
                };
            });
            setHaveFiltersChanged(true);
        },
        [
            addSavedFilterOverride,
            dashboard?.filters.dimensions,
            originalDashboardFilters.dimensions,
            removeSavedFilterOverride,
        ],
    );

    const addMetricDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => ({
                dimensions: previousFilters.dimensions,
                metrics: [...previousFilters.metrics, filter],
                tableCalculations: previousFilters.tableCalculations,
            }));
            setHaveFiltersChanged(true);
        },
        [],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => {
                if (!isTemporary) {
                    removeSavedFilterOverride(
                        previousFilters.dimensions[index],
                    );
                }
                return {
                    dimensions: [
                        ...previousFilters.dimensions.slice(0, index),
                        ...previousFilters.dimensions.slice(index + 1),
                    ],
                    metrics: previousFilters.metrics,
                    tableCalculations: previousFilters.tableCalculations,
                };
            });
            setHaveFiltersChanged(true);
        },
        [removeSavedFilterOverride],
    );

    const addResultsCacheTime = useCallback((cacheMetadata: CacheMetadata) => {
        if (cacheMetadata.cacheHit && cacheMetadata.cacheUpdatedTime) {
            setResultsCacheTimes((old) =>
                cacheMetadata.cacheUpdatedTime
                    ? [...old, cacheMetadata.cacheUpdatedTime]
                    : [...old],
            );
        }
    }, []);

    const clearCacheAndFetch = useCallback(() => {
        setResultsCacheTimes([]);

        // Causes results refetch
        setInvalidateCache(true);
    }, []);

    const oldestCacheTime = useMemo(
        () => min(resultsCacheTimes),
        [resultsCacheTimes],
    );

    // Filters that are required to have a value set
    const requiredDashboardFilters = useMemo(
        () =>
            dashboardFilters.dimensions
                // Get filters that are required to have a value set (required) and that have no default value set (disabled)
                .filter((f) => f.required && f.disabled)
                .reduce<Pick<DashboardFilterRule, 'id' | 'label'>[]>(
                    (acc, f) => {
                        const field = fieldsWithSuggestions[
                            f.target.fieldId
                        ] as FieldWithSuggestions | undefined;

                        let label = '';

                        if (f.label) {
                            label = f.label;
                        } else if (field) {
                            label = getConditionalRuleLabel(f, field).field;
                        }

                        return [
                            ...acc,
                            {
                                id: f.id,
                                label,
                            },
                        ];
                    },
                    [],
                ),
        [dashboardFilters.dimensions, fieldsWithSuggestions],
    );

    const value = {
        projectUuid,
        isDashboardLoading,
        dashboard,
        dashboardError,
        dashboardTiles,
        setDashboardTiles,
        haveTilesChanged,
        setHaveTilesChanged,
        haveTabsChanged,
        setHaveTabsChanged,
        dashboardTabs,
        setDashboardTabs,
        setDashboardTemporaryFilters,
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        addResultsCacheTime,
        oldestCacheTime,
        invalidateCache,
        clearCacheAndFetch,
        fieldsWithSuggestions,
        allFilterableFields: dashboardAvailableFiltersData?.allFilterableFields,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        filterableFieldsByTileUuid,
        allFilters,
        hasChartTiles,
        chartSort,
        setChartSort,
        dateZoomGranularity,
        setDateZoomGranularity,
        chartsWithDateZoomApplied,
        setChartsWithDateZoomApplied,
        dashboardCommentsCheck,
        dashboardComments,
        hasTileComments,
        requiredDashboardFilters,
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useDashboardContext<Selected>(
    selector: (value: DashboardContext) => Selected,
) {
    return useContextSelector(Context, (context) => {
        if (context === undefined) {
            throw new Error(
                'useDashboardContext must be used within a DashboardProvider',
            );
        }
        return selector(context);
    });
}
