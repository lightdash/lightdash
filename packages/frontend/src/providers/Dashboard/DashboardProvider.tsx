import {
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    DashboardTileTypes,
    DateGranularity,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    getItemId,
    isDashboardChartTileType,
    isStandardDateGranularity,
    isSubDayGranularity,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type FilterableDimension,
    type InteractivityOptions,
    type Metric,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SortField,
} from '@lightdash/common';
import clone from 'lodash/clone';
import isEqual from 'lodash/isEqual';
import sortBy from 'lodash/sortBy';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDeepCompareEffect, useMount } from 'react-use';
import { getConditionalRuleLabelFromItem } from '../../components/common/Filters/FilterInputs/utils';
import { type SdkFilter } from '../../ee/features/embed/EmbedDashboard/types';
import {
    convertSdkFilterToDashboardFilter,
    shouldDeferSdkFilters,
} from '../../ee/features/embed/EmbedDashboard/utils';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import { useEmbedEventEmitter } from '../../ee/features/embed/hooks/useEmbedEventEmitter';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
import { hasSavedFilterValueChanged } from '../../features/dashboardFilters/FilterConfiguration/utils';
import { useParameters } from '../../features/parameters';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
    useDashboardVersionRefresh,
} from '../../hooks/dashboard/useDashboard';
import useToaster from '../../hooks/toaster/useToaster';
import {
    hasSavedFiltersOverrides,
    useSavedDashboardFiltersOverrides,
} from '../../hooks/useSavedDashboardFiltersOverrides';
import DashboardContext from './context';
import DashboardTileStatusProvider from './DashboardTileStatusProvider';
import useDashboardContext from './useDashboardContext';
import useDashboardTileStatusContext from './useDashboardTileStatusContext';

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

type DashboardProviderProps = React.PropsWithChildren<{
    schedulerFilters?: DashboardFilterRule[] | undefined;
    schedulerParameters?: ParametersValuesMap | undefined;
    schedulerTabsSelected?: string[] | undefined;
    dateZoom?: DateGranularity | string | undefined;
    projectUuid?: string;
    embedToken?: string;
    dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
    defaultInvalidateCache?: boolean;
    sdkFilters?: SdkFilter[];
}>;

const DashboardProviderInner: React.FC<DashboardProviderProps> = ({
    schedulerFilters,
    schedulerParameters,
    schedulerTabsSelected,
    dateZoom,
    projectUuid,
    embedToken,
    dashboardCommentsCheck,
    defaultInvalidateCache,
    children,
}) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const { showToastWarning } = useToaster();

    const { dashboardUuid, tabUuid, mode } = useParams<{
        dashboardUuid: string;
        tabUuid?: string;
        mode?: string;
    }>() as {
        dashboardUuid: string;
        tabUuid?: string;
        mode?: string;
    };
    const isEditMode = mode === 'edit';

    const {
        mutateAsync: versionRefresh,
        isLoading: isRefreshingDashboardVersion,
    } = useDashboardVersionRefresh(dashboardUuid, projectUuid);

    // Embedded dashboards will not be using this query hook to load the dashboard,
    // so we need to set the dashboard manually
    const [embedDashboard, setEmbedDashboard] = useState<
        Dashboard & InteractivityOptions
    >();
    const {
        data: dashboard,
        isInitialLoading: isDashboardLoading,
        error: dashboardError,
    } = useDashboardQuery({
        uuidOrSlug: dashboardUuid,
        projectUuid,
        useQueryOptions: {
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
        },
    });

    const { data: dashboardComments } = useGetComments(
        dashboardUuid,
        projectUuid,
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
    const [dashboardTabs, setDashboardTabsInternal] = useState<
        Dashboard['tabs']
    >([]);
    const setDashboardTabs = useCallback<
        React.Dispatch<React.SetStateAction<Dashboard['tabs']>>
    >((tabs) => {
        setDashboardTabsInternal((prevTabs) => {
            const newTabs = typeof tabs === 'function' ? tabs(prevTabs) : tabs;
            return sortBy(newTabs, 'order');
        });
    }, []);
    const [activeTab, setActiveTab] = useState<
        Dashboard['tabs'][number] | undefined
    >();
    const [dashboardTemporaryFilters, setDashboardTemporaryFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [dashboardFilters, setDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [originalDashboardFilters, setOriginalDashboardFilters] =
        useState<DashboardFilters>(emptyFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] =
        useState<boolean>(false);
    // Event system for filter change tracking
    const { dispatchEmbedEvent } = useEmbedEventEmitter();
    const embed = useEmbed();
    const previousFiltersRef = useRef<DashboardFilters | null>(null);

    const [chartSort, setChartSort] = useState<Record<string, SortField[]>>({});

    const [dateZoomGranularity, setDateZoomGranularity] = useState<
        DateGranularity | string | undefined
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

    // Allows users to disable add filter button on view mode,
    // by default it is enabled
    const [isAddFilterDisabled, setIsAddFilterDisabled] =
        useState<boolean>(false);
    useEffect(() => {
        if (dashboard?.config?.isAddFilterDisabled === true) {
            setIsAddFilterDisabled(true);
        }
    }, [dashboard]);

    const [parameterDefinitions, setParameterDefinitions] =
        useState<ParameterDefinitions>({});

    const addParameterDefinitions = useCallback(
        (parameters: ParameterDefinitions) => {
            setParameterDefinitions((prev) => ({
                ...prev,
                ...parameters,
            }));
        },
        [],
    );

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

    // Parameter order state
    const [parameterOrder, setParameterOrderState] = useState<string[]>([]);
    const [hasParameterOrderChanged, setHasParameterOrderChanged] =
        useState<boolean>(false);

    // Date zoom granularities state
    const allStandardGranularities = useMemo(
        () => Object.values(DateGranularity),
        [],
    );

    const [dateZoomGranularities, setDateZoomGranularitiesState] = useState<
        (DateGranularity | string)[]
    >(allStandardGranularities);
    const [
        haveDateZoomGranularitiesChanged,
        setHaveDateZoomGranularitiesChanged,
    ] = useState<boolean>(false);

    const [defaultDateZoomGranularity, setDefaultDateZoomGranularityState] =
        useState<DateGranularity | string | undefined>(undefined);
    const [
        hasDefaultDateZoomGranularityChanged,
        setHasDefaultDateZoomGranularityChanged,
    ] = useState<boolean>(false);

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

    // Set parameter order when dashboard is loaded
    useEffect(() => {
        if (dashboard?.config?.parameterOrder !== undefined) {
            setParameterOrderState(dashboard.config.parameterOrder);
        } else if (dashboard?.config !== undefined) {
            setParameterOrderState([]);
        }
    }, [dashboard?.config?.parameterOrder, dashboard?.config]);

    // Sync date zoom granularities from dashboard config
    // Note: Custom granularities from explores are added by DashboardGranularitySync
    useEffect(() => {
        if (dashboard?.config?.dateZoomGranularities !== undefined) {
            setDateZoomGranularitiesState(
                dashboard.config.dateZoomGranularities,
            );
        } else {
            setDateZoomGranularitiesState(allStandardGranularities);
        }
    }, [dashboard?.config?.dateZoomGranularities, allStandardGranularities]);

    // Sync default date zoom granularity from dashboard config
    useEffect(() => {
        setDefaultDateZoomGranularityState(
            dashboard?.config?.defaultDateZoomGranularity,
        );
    }, [dashboard?.config?.defaultDateZoomGranularity]);

    // Set active tab when dashboard and tabs are loaded
    useEffect(() => {
        if (dashboardTabs && dashboardTabs.length > 0) {
            const matchedTab =
                dashboardTabs.find((tab) => tab.uuid === tabUuid) ??
                dashboardTabs[0];

            setActiveTab(matchedTab);
        }
    }, [dashboardTabs, tabUuid]);

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
        (key: string, value: ParameterValue | null) => {
            const isEmpty =
                value === null ||
                value === undefined ||
                value === '' ||
                (Array.isArray(value) && value.length === 0);

            if (isEmpty) {
                // In view mode, reverting to "no value" should fall back to the
                // dashboard-saved default (which the tile queries also use), keeping
                // the widget and queries in sync. In edit mode, clearing fully removes
                // the override so authors can drop it.
                const savedParam = savedParameters[key];
                if (!isEditMode && savedParam) {
                    setParameters((prev) => ({
                        ...prev,
                        [key]: savedParam,
                    }));
                } else {
                    setParameters((prev) => {
                        const newParams = { ...prev };
                        delete newParams[key];
                        return newParams;
                    });
                }
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
        [isEditMode, savedParameters],
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

    const setParameterOrder = useCallback((order: string[]) => {
        setParameterOrderState(order);
        setHasParameterOrderChanged(true);
    }, []);

    const setDateZoomGranularities = useCallback(
        (granularities: (DateGranularity | string)[]) => {
            setDateZoomGranularitiesState(granularities);
            setHaveDateZoomGranularitiesChanged(true);
        },
        [],
    );

    const setDefaultDateZoomGranularity = useCallback(
        (granularity: DateGranularity | string | undefined) => {
            setDefaultDateZoomGranularityState(granularity);
            setHasDefaultDateZoomGranularityChanged(true);
        },
        [],
    );

    // Track parameter references from each tile
    const [tileParameterReferences, setTileParameterReferences] = useState<
        Record<string, string[]>
    >({});

    const addParameterReferences = useCallback(
        (tileUuid: string, references: string[]) => {
            setTileParameterReferences((prev) => ({
                ...prev,
                [tileUuid]: references,
            }));
        },
        [],
    );

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

    // Calculate aggregated parameter references from all tiles
    const dashboardParameterReferences = useMemo(() => {
        const allReferences = Object.values(tileParameterReferences).flat();
        return new Set(allReferences);
    }, [tileParameterReferences]);

    const { data: projectParameters } = useParameters(
        projectUuid,
        Array.from(dashboardParameterReferences ?? []),
        {
            enabled: !!projectUuid && !!dashboardParameterReferences,
        },
    );

    useEffect(() => {
        if (projectParameters) {
            addParameterDefinitions(projectParameters);
        }
    }, [projectParameters, addParameterDefinitions]);

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

    const [chartsWithDateZoomApplied, setChartsWithDateZoomApplied] =
        useState<Set<string>>();

    // Update dashboard url date zoom change
    // Only sync URL in regular dashboards or 'direct' embed mode (not 'sdk' mode)
    useEffect(() => {
        if (embed.mode === 'sdk') {
            return;
        }

        const currentParams = new URLSearchParams(search);
        const newParams = new URLSearchParams(search);
        if (dateZoomGranularity === undefined) {
            newParams.delete('dateZoom');
        } else {
            newParams.set('dateZoom', dateZoomGranularity.toLowerCase());
        }

        const currentSearch = currentParams.toString();
        const newSearch = newParams.toString();

        if (currentSearch !== newSearch) {
            void navigate(
                {
                    pathname,
                    search: newParams.toString(),
                },
                { replace: true },
            );
        }
    }, [dateZoomGranularity, search, navigate, pathname, embed.mode]);

    const {
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
    } = useSavedDashboardFiltersOverrides();

    // Stable key that only changes when the chart-tile mapping changes,
    // not when tiles are repositioned/resized (x/y/w/h changes).
    // This prevents unnecessary re-renders of the entire filter chain
    // during drag/resize operations.
    const savedChartUuidsAndTileUuidsKey = useMemo(
        () =>
            dashboardTiles
                ?.filter(isDashboardChartTileType)
                .map(
                    (tile) =>
                        `${tile.uuid}:${tile.properties.savedChartUuid ?? ''}`,
                )
                .sort()
                .join(',') ?? '',
        [dashboardTiles],
    );

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [savedChartUuidsAndTileUuidsKey],
    );

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
            !savedChartUuidsAndTileUuids ||
            !dashboardAvailableFiltersData
        )
            return;

        return savedChartUuidsAndTileUuids.reduce<
            Record<string, DashboardFilterableField[]>
        >((acc, { tileUuid }) => {
            const dimensionFields =
                dashboardAvailableFiltersData.savedQueryFilters[tileUuid]?.map(
                    (index) =>
                        dashboardAvailableFiltersData.allFilterableFields[
                            index
                        ],
                ) ?? [];

            const metricFields =
                dashboardAvailableFiltersData.savedQueryMetricFilters[
                    tileUuid
                ]?.map(
                    (index) =>
                        dashboardAvailableFiltersData.allFilterableMetrics[
                            index
                        ],
                ) ?? [];

            const combined = [...dimensionFields, ...metricFields];
            if (combined.length > 0) {
                acc[tileUuid] = combined;
            }

            return acc;
        }, {});
    }, [
        dashboard,
        dashboardAvailableFiltersData,
        savedChartUuidsAndTileUuids,
        embedToken,
    ]);

    /**
     * Apply interactivity filtering for embedded dashboards
     */
    const applyInteractivityFiltering = useCallback(
        (filters: DashboardFilters): DashboardFilters => {
            if (!embedDashboard) {
                return filters;
            }

            if (!embedDashboard.dashboardFiltersInteractivity) {
                return emptyFilters;
            }

            const interactivityOptions =
                embedDashboard.dashboardFiltersInteractivity;
            const filterInteractivityValue = getFilterInteractivityValue(
                interactivityOptions.enabled,
            );

            if (filterInteractivityValue === FilterInteractivityValues.none) {
                return emptyFilters;
            }

            if (filterInteractivityValue === FilterInteractivityValues.some) {
                return {
                    ...filters,
                    dimensions: filters.dimensions.filter((filter) =>
                        interactivityOptions.allowedFilters?.includes(
                            filter.id,
                        ),
                    ),
                };
            }

            // If 'all', return filters as-is
            return filters;
        },
        [embedDashboard],
    );

    // Apply filters on dashboard load in order of precedence:
    // 1. Start with base dashboard filters
    // 2. Apply overrides for iframe embed or replace SDK filters in SDK mode
    // 3. Apply interactivity filtering (embedded dashboards only)
    //
    // This happens on the first load when emptyFilters is the initial value of dashboardFilters
    useEffect(() => {
        const currentDashboard = dashboard || embedDashboard;

        if (!currentDashboard) return;

        if (dashboardFilters === emptyFilters) {
            let overrides = clone(overridesForSavedDashboardFilters);

            // Step 1: Start with base filters
            let updatedDashboardFilters = clone(currentDashboard.filters);

            // Step 2: Apply SDK Filters
            // For SDK mode, SDK filters replace embedded dashboard filters
            const sdkFilters =
                embed.mode === 'sdk' && embed.filters ? embed.filters : [];
            if (sdkFilters.length > 0) {
                // Wait until we have the data needed to build cross-explore
                // tileTargets. `isLoadingDashboardFilters` alone is not
                // enough because the available-filters query is disabled
                // until tile metadata loads, and React Query reports a
                // disabled query as not loading.
                if (
                    shouldDeferSdkFilters(
                        savedChartUuidsAndTileUuids,
                        filterableFieldsByTileUuid,
                    )
                ) {
                    return;
                }

                updatedDashboardFilters.dimensions = sdkFilters.map(
                    (sdkFilter) =>
                        convertSdkFilterToDashboardFilter(
                            sdkFilter,
                            filterableFieldsByTileUuid,
                        ),
                );
            }

            // Apply overrides from URL
            if (embed.mode === 'direct') {
                // For direct mode, only read from URL if not SDK mode
                if (hasSavedFiltersOverrides(overrides)) {
                    updatedDashboardFilters = {
                        ...updatedDashboardFilters,
                        dimensions: applyDimensionOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    setHaveFiltersChanged(false);
                }
            } else {
                if (overrides && overrides.dimensions.length > 0) {
                    updatedDashboardFilters = {
                        ...updatedDashboardFilters,
                        dimensions: applyDimensionOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    setHaveFiltersChanged(true);
                } else {
                    setHaveFiltersChanged(false);
                }
            }

            // Step 3: Apply interactivity filtering for embedded dashboards
            updatedDashboardFilters = applyInteractivityFiltering(
                updatedDashboardFilters,
            );

            setDashboardFilters(updatedDashboardFilters);
        }

        setOriginalDashboardFilters(currentDashboard.filters);
    }, [
        dashboard,
        embedDashboard,
        dashboardFilters,
        overridesForSavedDashboardFilters,
        embed,
        applyInteractivityFiltering,
        savedChartUuidsAndTileUuids,
        filterableFieldsByTileUuid,
    ]);

    // Updates url with temp and overridden filters and deep compare to avoid unnecessary re-renders for dashboardTemporaryFilters
    // Only sync URL in regular dashboards or 'direct' embed mode (not 'sdk' mode)
    useDeepCompareEffect(() => {
        if (embed.mode === 'sdk') {
            return;
        }

        const currentParams = new URLSearchParams(search);
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

        if (hasSavedFiltersOverrides(overridesForSavedDashboardFilters)) {
            newParams.set(
                'filters',
                JSON.stringify(
                    compressDashboardFiltersToParam(
                        overridesForSavedDashboardFilters,
                    ),
                ),
            );
        } else {
            newParams.delete('filters');
        }

        // Only navigate if search params actually changed
        const newSearch = newParams.toString();
        const currentSearch = currentParams.toString();
        if (newSearch !== currentSearch) {
            void navigate(
                {
                    pathname,
                    search: newSearch,
                },
                { replace: true },
            );
        }
    }, [
        dashboardFilters,
        dashboardTemporaryFilters,
        navigate,
        pathname,
        overridesForSavedDashboardFilters,
        search,
        embed.mode,
    ]);

    useEffect(() => {
        if (
            dashboard?.filters &&
            hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
        ) {
            setDashboardFilters((prevFilters) => {
                const updated: DashboardFilters = {
                    ...prevFilters,
                    dimensions: applyDimensionOverrides(
                        prevFilters,
                        overridesForSavedDashboardFilters,
                    ),
                };

                if (overridesForSavedDashboardFilters.metrics?.length > 0) {
                    updated.metrics = prevFilters.metrics.map((metric) => {
                        const override =
                            overridesForSavedDashboardFilters.metrics.find(
                                (m) => m.id === metric.id,
                            );
                        return override
                            ? { ...override, tileTargets: metric.tileTargets }
                            : metric;
                    });
                }

                return updated;
            });
        }
    }, [dashboard?.filters, overridesForSavedDashboardFilters]);

    // Gets filters and dateZoom from URL and storage after redirect
    useMount(() => {
        const searchParams = new URLSearchParams(search);

        // Date zoom
        const dateZoomParam = searchParams.get('dateZoom');
        if (dateZoomParam) {
            const standardMatch = Object.values(DateGranularity).find(
                (granularity) =>
                    granularity.toLowerCase() === dateZoomParam.toLowerCase(),
            );
            if (standardMatch) {
                setDateZoomGranularity(standardMatch);
            } else {
                // Custom granularity — use the param value directly
                setDateZoomGranularity(dateZoomParam);
            }
        }

        // Temp filters
        const tempFilterSearchParam = searchParams.get('tempFilters');
        const unsavedDashboardFiltersRaw = sessionStorage.getItem(
            'unsavedDashboardFilters',
        );

        sessionStorage.removeItem('unsavedDashboardFilters');
        if (unsavedDashboardFiltersRaw) {
            try {
                const unsavedDashboardFilters = JSON.parse(
                    unsavedDashboardFiltersRaw,
                );
                // TODO: this should probably merge with the filters
                // from the database. This will break if they diverge,
                // meaning there is a subtle race condition here
                setDashboardFilters(unsavedDashboardFilters);
            } catch {
                showToastWarning({
                    title: 'Could not restore unsaved filters',
                    subtitle:
                        'Your previous filter changes could not be loaded',
                });
            }
        }
        if (tempFilterSearchParam) {
            try {
                setDashboardTemporaryFilters(
                    convertDashboardFiltersParamToDashboardFilters(
                        JSON.parse(tempFilterSearchParam),
                    ),
                );
            } catch {
                showToastWarning({
                    title: 'Could not restore filters from URL',
                    subtitle:
                        'The link appears to be incomplete. Please ask for it to be shared again.',
                });
            }
        }
    });

    // Apply default date zoom granularity when dashboard loads (if no URL override).
    // Uses a ref for `search` so URL changes don't re-trigger this effect —
    // it should only fire when the configured default changes (initial load + after saves).
    const searchRef = useRef(search);
    searchRef.current = search;
    useEffect(() => {
        if (isEditMode) return;
        if (
            dashboard?.config?.defaultDateZoomGranularity &&
            !dashboard?.config?.isDateZoomDisabled
        ) {
            const searchParams = new URLSearchParams(searchRef.current);
            const dateZoomParam = searchParams.get('dateZoom');
            // Only apply default if no URL override is present
            if (!dateZoomParam) {
                setDateZoomGranularity(
                    dashboard.config.defaultDateZoomGranularity,
                );
            }
        }
    }, [
        dashboard?.config?.defaultDateZoomGranularity,
        dashboard?.config?.isDateZoomDisabled,
        isEditMode,
        setDateZoomGranularity,
    ]);

    // Reset dateZoomGranularity if it's not in the allowed list.
    // Falls back to the validated default state (not the raw config value,
    // which may reference a stale custom granularity).
    // Only validates standard granularities here — custom granularities
    // are validated by DashboardGranularitySync once all charts have loaded
    // and the full set of available custom granularities is known.
    useEffect(() => {
        if (
            dateZoomGranularity &&
            dateZoomGranularities.length > 0 &&
            isStandardDateGranularity(dateZoomGranularity) &&
            !dateZoomGranularities.includes(dateZoomGranularity)
        ) {
            setDateZoomGranularity(defaultDateZoomGranularity ?? undefined);
        }
    }, [
        dateZoomGranularities,
        dateZoomGranularity,
        defaultDateZoomGranularity,
        setDateZoomGranularity,
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

    const allFilterableMetricsMap = useMemo(() => {
        return dashboardAvailableFiltersData?.allFilterableMetrics &&
            dashboardAvailableFiltersData.allFilterableMetrics.length > 0
            ? dashboardAvailableFiltersData.allFilterableMetrics.reduce<
                  Record<string, Metric>
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

    // Watch for filter changes and emit events (skip initial render)
    useEffect(() => {
        const previousFilters = previousFiltersRef.current;
        const hasPreviousFilters =
            previousFilters &&
            previousFilters.dimensions.length +
                previousFilters.metrics.length +
                previousFilters.tableCalculations.length;

        if (hasPreviousFilters && !isEqual(previousFilters, allFilters)) {
            const filterCount =
                allFilters.dimensions.length +
                allFilters.metrics.length +
                allFilters.tableCalculations.length;

            dispatchEmbedEvent(LightdashEventType.FilterChanged, {
                hasFilters: filterCount > 0,
                filterCount,
            });
        }

        previousFiltersRef.current = allFilters;
    }, [allFilters, dispatchEmbedEvent]);

    // Resets all dashboard filters. There's a bit of a race condition
    // here because we store filters in memory in two places:
    //  1. dashboardFilters: in memory
    //  2. overridesForSavedDashboardFilters: in url
    // This resets all of them.
    // TODO: fix up the data flow for filters so that they get set
    // and read more centrally.
    const resetDashboardFilters = useCallback(() => {
        // reset in memory filters
        const filters =
            dashboard?.filters ?? embedDashboard?.filters ?? emptyFilters;
        // Apply interactivity filtering for embedded dashboards
        const filteredFilters = embedDashboard
            ? applyInteractivityFiltering(filters)
            : filters;
        setDashboardFilters(filteredFilters);
        // reset temporary filters
        setDashboardTemporaryFilters(emptyFilters);
        // reset saved filter overrides which are stored in url
        resetSavedFilterOverrides();
    }, [
        setDashboardFilters,
        setDashboardTemporaryFilters,
        dashboard?.filters,
        embedDashboard,
        resetSavedFilterOverrides,
        applyInteractivityFiltering,
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
            isInEditMode: boolean,
        ) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;

            const filters =
                dashboard?.filters?.dimensions ||
                embedDashboard?.filters?.dimensions ||
                [];
            const isFilterSaved = filters.some(({ id }) => id === item.id);

            setFunction((previousFilters) => {
                if (!isTemporary) {
                    if (isInEditMode) {
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
            embedDashboard?.filters.dimensions,
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

    const updateMetricDashboardFilter = useCallback(
        (
            item: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;

            const filters =
                dashboard?.filters?.metrics ||
                embedDashboard?.filters?.metrics ||
                [];
            const isFilterSaved = filters.some(({ id }) => id === item.id);

            setFunction((previousFilters) => {
                if (!isTemporary) {
                    if (isInEditMode) {
                        removeSavedFilterOverride(item, 'metrics');
                    } else {
                        const isReverted =
                            originalDashboardFilters.metrics[index] &&
                            !hasSavedFilterValueChanged(
                                originalDashboardFilters.metrics[index],
                                item,
                            );
                        if (isReverted) {
                            removeSavedFilterOverride(item, 'metrics');
                            setHaveFiltersChanged(false);
                        } else {
                            const hasChanged = hasSavedFilterValueChanged(
                                previousFilters.metrics[index],
                                item,
                            );

                            if (hasChanged && isFilterSaved) {
                                addSavedFilterOverride(item, 'metrics');
                            }
                        }
                    }
                }
                return {
                    dimensions: previousFilters.dimensions,
                    metrics: [
                        ...previousFilters.metrics.slice(0, index),
                        item,
                        ...previousFilters.metrics.slice(index + 1),
                    ],
                    tableCalculations: previousFilters.tableCalculations,
                };
            });
            setHaveFiltersChanged(true);
        },
        [
            addSavedFilterOverride,
            dashboard?.filters.metrics,
            embedDashboard?.filters.metrics,
            originalDashboardFilters.metrics,
            removeSavedFilterOverride,
        ],
    );

    const removeMetricDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            const setFunction = isTemporary
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFunction((previousFilters) => {
                if (!isTemporary) {
                    removeSavedFilterOverride(
                        previousFilters.metrics[index],
                        'metrics',
                    );
                }
                return {
                    dimensions: previousFilters.dimensions,
                    metrics: [
                        ...previousFilters.metrics.slice(0, index),
                        ...previousFilters.metrics.slice(index + 1),
                    ],
                    tableCalculations: previousFilters.tableCalculations,
                };
            });
            setHaveFiltersChanged(true);
        },
        [removeSavedFilterOverride],
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

    const refreshDashboardVersion = useCallback(async () => {
        try {
            const freshDashboard = await versionRefresh(dashboard);

            // Only update local state if we got fresh data back
            // (null means dashboard was already up-to-date)
            if (freshDashboard) {
                setDashboardTiles(freshDashboard.tiles);
                setDashboardTabs(freshDashboard.tabs);
                setSavedParameters(freshDashboard.parameters ?? {});
            }
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
            // Could optionally show a toast error here
        }
    }, [
        versionRefresh,
        dashboard,
        setDashboardTiles,
        setDashboardTabs,
        setSavedParameters,
    ]);

    // Filters that are required to have a value set
    const requiredDashboardFilters = useMemo(
        () =>
            [...dashboardFilters.dimensions, ...dashboardFilters.metrics]
                // Get filters that are required to have a value set (required) and that have no default value set (disabled)
                .filter((f) => f.required && f.disabled)
                .reduce<Pick<DashboardFilterRule, 'id' | 'label'>[]>(
                    (acc, f) => {
                        const field =
                            allFilterableFieldsMap[f.target.fieldId] ??
                            allFilterableMetricsMap[f.target.fieldId];

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
        [
            dashboardFilters.dimensions,
            dashboardFilters.metrics,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
        ],
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
        activeTab,
        setActiveTab,
        setDashboardTemporaryFilters,
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        updateMetricDashboardFilter,
        removeMetricDashboardFilter,
        resetDashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        allFilterableFieldsMap,
        allFilterableMetricsMap,
        allFilterableFields: dashboardAvailableFiltersData?.allFilterableFields,
        allFilterableMetrics:
            dashboardAvailableFiltersData?.allFilterableMetrics,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        filterableFieldsByTileUuid,
        allFilters,
        hasTilesThatSupportFilters,
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
        isDateZoomDisabled,
        setIsDateZoomDisabled,
        isAddFilterDisabled,
        setIsAddFilterDisabled,
        setSavedParameters,
        parametersHaveChanged,
        dashboardParameters: parameters,
        parameterValues,
        selectedParametersCount,
        setParameter,
        parameterDefinitions,
        clearAllParameters,
        dashboardParameterReferences,
        addParameterReferences,
        tileParameterReferences,
        missingRequiredParameters,
        pinnedParameters,
        setPinnedParameters,
        toggleParameterPin,
        havePinnedParametersChanged,
        setHavePinnedParametersChanged,
        parameterOrder,
        setParameterOrder,
        hasParameterOrderChanged,
        setHasParameterOrderChanged,
        dateZoomGranularities,
        setDateZoomGranularities,
        haveDateZoomGranularitiesChanged,
        setHaveDateZoomGranularitiesChanged,
        defaultDateZoomGranularity,
        setDefaultDateZoomGranularity,
        hasDefaultDateZoomGranularityChanged,
        setHasDefaultDateZoomGranularityChanged,
        addParameterDefinitions,
        refreshDashboardVersion,
        isRefreshingDashboardVersion,
    };
    return (
        <DashboardContext.Provider value={value}>
            <DashboardTileStatusProvider
                dashboardTiles={dashboardTiles}
                dashboardTabs={dashboardTabs}
                activeTab={activeTab}
                schedulerTabsSelected={schedulerTabsSelected}
                defaultInvalidateCache={defaultInvalidateCache}
            >
                <DashboardGranularitySync />
                {children}
            </DashboardTileStatusProvider>
        </DashboardContext.Provider>
    );
};

/**
 * Bridge component that reads tile-status context values
 * and syncs them back to the main dashboard context via effects.
 * This exists because DashboardProviderInner cannot use useDashboardTileStatusContext
 * (tile status provider is rendered as its child).
 */
const DashboardGranularitySync: React.FC = () => {
    const areAllChartsLoaded = useDashboardTileStatusContext(
        (c) => c.areAllChartsLoaded,
    );
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    const dashboardHasTimestampDimension = useDashboardTileStatusContext(
        (c) => c.dashboardHasTimestampDimension,
    );

    // Use refs for values we read but should NOT trigger re-runs of the effect.
    // Reading dateZoomGranularities directly in the dep array would cause an
    // infinite loop: effect filters → setDateZoomGranularities (which also sets
    // haveDateZoomGranularitiesChanged) → new context value → effect re-fires.
    const dateZoomGranularities = useDashboardContext(
        (c) => c.dateZoomGranularities,
    );
    const dateZoomGranularitiesRef = useRef(dateZoomGranularities);
    dateZoomGranularitiesRef.current = dateZoomGranularities;

    const defaultDateZoomGranularity = useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    );
    const defaultDateZoomGranularityRef = useRef(defaultDateZoomGranularity);
    defaultDateZoomGranularityRef.current = defaultDateZoomGranularity;

    const setDateZoomGranularities = useDashboardContext(
        (c) => c.setDateZoomGranularities,
    );
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );

    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const dateZoomGranularityRef = useRef(dateZoomGranularity);
    dateZoomGranularityRef.current = dateZoomGranularity;

    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );

    // Once all charts have loaded, clean up stale granularities:
    // - Custom granularities no longer provided by any explore
    // - Sub-day granularities when no TIMESTAMP dimensions exist
    // Also resets the active dateZoomGranularity if it's a stale custom value
    // (custom granularities are not validated earlier to avoid a race condition
    // where the URL param is cleared before charts finish loading).
    useEffect(() => {
        if (!areAllChartsLoaded) return;

        const currentGranularities = dateZoomGranularitiesRef.current;
        const currentDefault = defaultDateZoomGranularityRef.current;
        const currentGranularity = dateZoomGranularityRef.current;

        const availableCustomGranularityKeys = new Set(
            Object.keys(availableCustomGranularities),
        );
        const isAvailable = (g: string) => {
            if (!isStandardDateGranularity(g)) {
                return availableCustomGranularityKeys.has(g);
            }
            // Strip sub-day standard granularities when no timestamp dims
            if (!dashboardHasTimestampDimension && isSubDayGranularity(g)) {
                return false;
            }
            return true;
        };

        const filtered = currentGranularities.filter(isAvailable);
        if (
            filtered.length !== currentGranularities.length ||
            !filtered.every((g, i) => currentGranularities[i] === g)
        ) {
            setDateZoomGranularities(filtered);
        }

        if (currentDefault && !isAvailable(currentDefault)) {
            setDefaultDateZoomGranularity(undefined);
        }

        // Reset active dateZoomGranularity if it's a stale custom granularity
        if (
            currentGranularity &&
            !isStandardDateGranularity(currentGranularity) &&
            !isAvailable(currentGranularity)
        ) {
            setDateZoomGranularity(currentDefault ?? undefined);
        }
    }, [
        areAllChartsLoaded,
        availableCustomGranularities,
        dashboardHasTimestampDimension,
        setDateZoomGranularities,
        setDefaultDateZoomGranularity,
        setDateZoomGranularity,
    ]);

    return null;
};

const DashboardProvider: React.FC<DashboardProviderProps> = (props) => {
    return <DashboardProviderInner {...props} />;
};

export default DashboardProvider;
