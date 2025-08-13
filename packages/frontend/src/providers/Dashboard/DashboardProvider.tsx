import {
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    DashboardTileTypes,
    DateGranularity,
    getItemId,
    isDashboardChartTileType,
    type CacheMetadata,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type FilterableDimension,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SchedulerFilterRule,
    type SortField,
} from '@lightdash/common';
import { isEqual } from 'lodash';
import min from 'lodash/min';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDeepCompareEffect, useMount } from 'react-use';
import { hasSavedFilterValueChanged } from '../../components/DashboardFilter/FilterConfiguration/utils';
import { getConditionalRuleLabelFromItem } from '../../components/common/Filters/FilterInputs/utils';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
} from '../../hooks/dashboard/useDashboard';
import {
    hasSavedFiltersOverrides,
    useSavedDashboardFiltersOverrides,
} from '../../hooks/useSavedDashboardFiltersOverrides';
import DashboardContext from './context';
import { type SqlChartTileMetadata } from './types';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const DashboardProvider: React.FC<
    React.PropsWithChildren<{
        schedulerFilters?: SchedulerFilterRule[] | undefined;
        schedulerParameters?: ParametersValuesMap | undefined;
        dateZoom?: DateGranularity | undefined;
        projectUuid?: string;
        embedToken?: string;
        dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
        defaultInvalidateCache?: boolean;
    }>
> = ({
    schedulerFilters,
    schedulerParameters,
    dateZoom,
    projectUuid,
    embedToken,
    dashboardCommentsCheck,
    defaultInvalidateCache,
    children,
}) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();

    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>() as {
        dashboardUuid: string;
    };

    const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

    // Embedded dashboards will not be using this query hook to load the dashboard,
    // so we need to set the dashboard manually
    const [embedDashboard, setEmbedDashboard] = useState<Dashboard>();
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
    const [invalidateCache, setInvalidateCache] = useState<boolean>(
        defaultInvalidateCache === true,
    );

    const [chartSort, setChartSort] = useState<Record<string, SortField[]>>({});

    const [sqlChartTilesMetadata, setSqlChartTilesMetadata] = useState<
        Record<string, SqlChartTileMetadata>
    >({});

    const [dateZoomGranularity, setDateZoomGranularity] = useState<
        DateGranularity | undefined
    >(dateZoom);

    // Allows users to disable date zoom on view mode,
    // by default it is enabled
    const [isDateZoomDisabled, setIsDateZoomDisabled] =
        useState<boolean>(false);
    useEffect(() => {
        if (dashboard?.config?.isDateZoomDisabled === true) {
            setIsDateZoomDisabled(true);
        }
    }, [dashboard]);

    const [parameterDefinitions, setParameterDefinitions] =
        useState<ParameterDefinitions>({});

    // Saved parameters are the parameters that are saved on the server
    const [savedParameters, setSavedParameters] = useState<DashboardParameters>(
        {},
    );
    // parameters that are currently applied to the dashboard
    const [parameters, setParameters] = useState<DashboardParameters>({});
    const [parametersHaveChanged, setParametersHaveChanged] =
        useState<boolean>(false);

    // Pinned parameters state
    const [pinnedParameters, setPinnedParametersState] = useState<string[]>([]);
    const [havePinnedParametersChanged, setHavePinnedParametersChanged] =
        useState<boolean>(false);

    // Set parameters to saved parameters when they are loaded
    useEffect(() => {
        if (savedParameters) {
            setParameters(savedParameters);
        }
    }, [savedParameters]);

    // Set pinned parameters when dashboard is loaded
    useEffect(() => {
        if (dashboard?.config?.pinnedParameters !== undefined) {
            setPinnedParametersState(dashboard.config.pinnedParameters);
        } else if (dashboard?.config !== undefined) {
            // Initialize empty array if dashboard has config but no pinnedParameters
            setPinnedParametersState([]);
        }
    }, [dashboard?.config?.pinnedParameters, dashboard?.config]);

    // Apply scheduler parameters when provided (for scheduled deliveries)
    useEffect(() => {
        if (schedulerParameters) {
            // Convert ParametersValuesMap to DashboardParameters format
            const dashboardParams: DashboardParameters = Object.fromEntries(
                Object.entries(schedulerParameters).map(([key, value]) => [
                    key,
                    {
                        parameterName: key,
                        value,
                    },
                ]),
            );
            setSavedParameters(dashboardParams);
        }
    }, [schedulerParameters]);

    // Set parametersHaveChanged to true if parameters have changed
    useEffect(() => {
        if (!isEqual(parameters, savedParameters)) {
            setParametersHaveChanged(true);
        }
    }, [parameters, savedParameters]);

    const setParameter = useCallback(
        (key: string, value: string | string[] | null) => {
            if (
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0)
            ) {
                setParameters((prev) => {
                    const newParams = { ...prev };
                    delete newParams[key];
                    return newParams;
                });
            } else {
                setParameters((prev) => ({
                    ...prev,
                    [key]: {
                        parameterName: key,
                        value,
                    },
                }));
            }
        },
        [],
    );

    const clearAllParameters = useCallback(() => {
        setParameters({});
    }, []);

    const setPinnedParameters = useCallback((pinnedParams: string[]) => {
        setPinnedParametersState(pinnedParams);
        setHavePinnedParametersChanged(true);
    }, []);

    const toggleParameterPin = useCallback((parameterKey: string) => {
        setPinnedParametersState((prev) => {
            const isCurrentlyPinned = prev.includes(parameterKey);
            const newPinnedParams = isCurrentlyPinned
                ? prev.filter((key) => key !== parameterKey)
                : [...prev, parameterKey];
            return newPinnedParams;
        });
        setHavePinnedParametersChanged(true);
    }, []);

    const parameterValues = useMemo(() => {
        return Object.entries(parameters).reduce((acc, [key, parameter]) => {
            if (
                parameter.value !== null &&
                parameter.value !== undefined &&
                parameter.value !== ''
            ) {
                acc[key] = parameter.value;
            }
            return acc;
        }, {} as ParametersValuesMap);
    }, [parameters]);

    const selectedParametersCount = useMemo(() => {
        return Object.values(parameterValues).filter(
            (value) => value !== null && value !== '' && value !== undefined,
        ).length;
    }, [parameterValues]);

    // Track parameter references from each tile
    const [tileParameterReferences, setTileParameterReferences] = useState<
        Record<string, string[]>
    >({});

    // Track which tiles have loaded (to know when all are complete)
    const [loadedTiles, setLoadedTiles] = useState<Set<string>>(new Set());

    const addParameterReferences = useCallback(
        (tileUuid: string, references: string[]) => {
            setTileParameterReferences((prev) => ({
                ...prev,
                [tileUuid]: references,
            }));
            setLoadedTiles((prev) => new Set(prev).add(tileUuid));
        },
        [],
    );

    // Calculate aggregated parameter references from all tiles
    const dashboardParameterReferences = useMemo(() => {
        const allReferences = Object.values(tileParameterReferences).flat();
        return new Set(allReferences);
    }, [tileParameterReferences]);

    // Determine if all chart tiles have loaded their parameter references
    const areAllChartsLoaded = useMemo(() => {
        if (!dashboardTiles) return false;

        const chartTileUuids = dashboardTiles
            .filter(isDashboardChartTileType)
            .map((tile) => tile.uuid);

        return chartTileUuids.every((tileUuid) => loadedTiles.has(tileUuid));
    }, [dashboardTiles, loadedTiles]);

    const missingRequiredParameters = useMemo(() => {
        // If no parameter references, return empty array
        if (!dashboardParameterReferences.size) return [];

        // Missing required parameters are the ones that are not set and don't have a default value
        return Array.from(dashboardParameterReferences).filter(
            (parameterName) =>
                !parameters[parameterName] &&
                !parameterDefinitions[parameterName]?.default,
        );
    }, [dashboardParameterReferences, parameters, parameterDefinitions]);

    // Remove parameter references for tiles that are no longer in the dashboard
    useEffect(() => {
        if (dashboardTiles) {
            setTileParameterReferences((old) => {
                if (!dashboardTiles) return {};
                const tileIds = new Set(
                    dashboardTiles.map((tile) => tile.uuid),
                );
                return Object.fromEntries(
                    Object.entries(old).filter(([tileId]) =>
                        tileIds.has(tileId),
                    ),
                );
            });
        }
    }, [dashboardTiles]);

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

        void navigate(
            {
                pathname,
                search: newParams.toString(),
            },
            { replace: true },
        );
    }, [dateZoomGranularity, search, navigate, pathname]);

    const {
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
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
                    setHaveFiltersChanged(true);
                } else {
                    updatedDashboardFilters = dashboard.filters;
                    setHaveFiltersChanged(false);
                }

                setDashboardFilters(updatedDashboardFilters);
            }

            setOriginalDashboardFilters(dashboard.filters);
        }
    }, [dashboard, dashboardFilters, overridesForSavedDashboardFilters]);

    // Updates url with temp and overridden filters and deep compare to avoid unnecessary re-renders for dashboardTemporaryFilters
    useDeepCompareEffect(() => {
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

        void navigate(
            {
                pathname,
                search: newParams.toString(),
            },
            { replace: true },
        );
    }, [
        dashboardFilters,
        dashboardTemporaryFilters,
        navigate,
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
    } = useDashboardsAvailableFilters(
        savedChartUuidsAndTileUuids ?? [],
        projectUuid,
        embedToken,
    );

    const filterableFieldsByTileUuid = useMemo(() => {
        // If this is an embed dashboard, we skip the dashboard check
        if (
            (!dashboard && !embedToken) ||
            !dashboardTiles ||
            !dashboardAvailableFiltersData
        )
            return;

        const filterFieldsMapping = savedChartUuidsAndTileUuids?.reduce<
            Record<string, FilterableDimension[]>
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
        embedToken,
    ]);

    const allFilterableFieldsMap = useMemo(() => {
        return dashboardAvailableFiltersData?.allFilterableFields &&
            dashboardAvailableFiltersData.allFilterableFields.length > 0
            ? dashboardAvailableFiltersData.allFilterableFields.reduce<
                  Record<string, FilterableDimension>
              >(
                  (sum, field) => ({
                      ...sum,
                      [getItemId(field)]: field,
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

    // Resets all dashboard filters. There's a bit of a race condition
    // here because we store filters in memory in two places:
    //  1. dashboardFilters: in memory
    //  2. overridesForSavedDashboardFilters: in url
    // This resets all of them.
    // TODO: fix up the data flow for filters so that they get set
    // and read more centrally.
    const resetDashboardFilters = useCallback(() => {
        // reset in memory filters
        setDashboardFilters(dashboard?.filters ?? emptyFilters);
        // reset temporary filters
        setDashboardTemporaryFilters(emptyFilters);
        // reset saved filter overrides which are stored in url
        resetSavedFilterOverrides();
    }, [
        setDashboardFilters,
        setDashboardTemporaryFilters,
        dashboard?.filters,
        resetSavedFilterOverrides,
    ]);

    const hasTilesThatSupportFilters = useMemo(() => {
        const tileTypesThatSupportFilters = [
            DashboardTileTypes.SQL_CHART,
            DashboardTileTypes.SAVED_CHART,
        ];
        return !!dashboardTiles?.some(({ type }) =>
            tileTypesThatSupportFilters.includes(type),
        );
    }, [dashboardTiles]);

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
                            setHaveFiltersChanged(false);
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

    const addResultsCacheTime = useCallback((cacheMetadata?: CacheMetadata) => {
        if (
            cacheMetadata &&
            cacheMetadata.cacheHit &&
            cacheMetadata.cacheUpdatedTime
        ) {
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

    const updateSqlChartTilesMetadata = useCallback(
        (tileUuid: string, metadata: SqlChartTileMetadata) => {
            setSqlChartTilesMetadata((prev) => ({
                ...prev,
                [tileUuid]: metadata,
            }));
        },
        [],
    );

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
                        const field = allFilterableFieldsMap[f.target.fieldId];

                        let label = '';

                        if (f.label) {
                            label = f.label;
                        } else if (field) {
                            label = getConditionalRuleLabelFromItem(
                                f,
                                field,
                            ).field;
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
        [dashboardFilters.dimensions, allFilterableFieldsMap],
    );

    const value = {
        projectUuid,
        isDashboardLoading,
        dashboard: dashboard || embedDashboard,
        setEmbedDashboard,
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
        resetDashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        addResultsCacheTime,
        oldestCacheTime,
        invalidateCache,
        clearCacheAndFetch,
        isAutoRefresh,
        setIsAutoRefresh,
        allFilterableFieldsMap,
        allFilterableFields: dashboardAvailableFiltersData?.allFilterableFields,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        filterableFieldsByTileUuid,
        allFilters,
        hasTilesThatSupportFilters,
        chartSort,
        setChartSort,
        sqlChartTilesMetadata,
        updateSqlChartTilesMetadata,
        dateZoomGranularity,
        setDateZoomGranularity,
        chartsWithDateZoomApplied,
        setChartsWithDateZoomApplied,
        dashboardCommentsCheck,
        dashboardComments,
        hasTileComments,
        requiredDashboardFilters,
        isDateZoomDisabled,
        setIsDateZoomDisabled,
        setSavedParameters,
        parametersHaveChanged,
        dashboardParameters: parameters,
        parameterValues,
        selectedParametersCount,
        setParameter,
        setParameterDefinitions,
        parameterDefinitions,
        clearAllParameters,
        dashboardParameterReferences,
        addParameterReferences,
        tileParameterReferences,
        areAllChartsLoaded,
        missingRequiredParameters,
        pinnedParameters,
        setPinnedParameters,
        toggleParameterPin,
        havePinnedParametersChanged,
        setHavePinnedParametersChanged,
    };
    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};

export default DashboardProvider;
