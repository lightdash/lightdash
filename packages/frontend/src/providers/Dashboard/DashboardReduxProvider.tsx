import {
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    convertDashboardFiltersParamToDashboardFilters,
    DateGranularity,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    isStandardDateGranularity,
    isSubDayGranularity,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type ParametersValuesMap,
    type SavedChartsInfoForDashboardAvailableFilters,
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
import { Provider as ReduxProvider } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useDeepCompareEffect, useMount } from 'react-use';
import { type SdkFilter } from '../../ee/features/embed/EmbedDashboard/types';
import { convertSdkFilterToDashboardFilter } from '../../ee/features/embed/EmbedDashboard/utils';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import { useEmbedEventEmitter } from '../../ee/features/embed/hooks/useEmbedEventEmitter';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
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
import { DashboardBridgeProvider } from './DashboardBridgeProvider';
import { dashboardDataActions } from './store/dashboardDataSlice';
import {
    dashboardFiltersActions,
    EMPTY_FILTERS,
} from './store/dashboardFiltersSlice';
import { useDashboardDispatch, useDashboardSelector } from './store/hooks';
import { createDashboardStore } from './store/index';

type Props = React.PropsWithChildren<{
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

/**
 * Inner component that runs inside the Redux Provider.
 * It uses the same hooks as the original DashboardProvider but dispatches
 * results to the Redux store instead of useState.
 */
const DashboardReduxSync: React.FC<Props> = ({
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
    const dispatch = useDashboardDispatch();

    // Read state from Redux
    const dashboardFilters = useDashboardSelector(
        (s) => s.dashboardFilters.dashboardFilters,
    );
    const dashboardTemporaryFilters = useDashboardSelector(
        (s) => s.dashboardFilters.dashboardTemporaryFilters,
    );
    const originalDashboardFilters = useDashboardSelector(
        (s) => s.dashboardFilters.originalDashboardFilters,
    );
    const dashboardTiles = useDashboardSelector(
        (s) => s.dashboardData.dashboardTiles,
    );
    const dashboardTabs = useDashboardSelector(
        (s) => s.dashboardData.dashboardTabs,
    );
    const activeTab = useDashboardSelector((s) => s.dashboardData.activeTab);
    const embedDashboard = useDashboardSelector(
        (s) => s.dashboardData.embedDashboard,
    );
    const dateZoomGranularity = useDashboardSelector(
        (s) => s.dashboardData.dateZoomGranularity,
    );
    const dateZoomGranularities = useDashboardSelector(
        (s) => s.dashboardData.dateZoomGranularities,
    );
    const defaultDateZoomGranularity = useDashboardSelector(
        (s) => s.dashboardData.defaultDateZoomGranularity,
    );
    const availableCustomGranularities = useDashboardSelector(
        (s) => s.dashboardData.availableCustomGranularities,
    );
    const tilesWithTimestampDimension = useDashboardSelector(
        (s) => s.dashboardData.tilesWithTimestampDimension,
    );
    const loadedTiles = useDashboardSelector(
        (s) => s.dashboardData.loadedTiles,
    );
    const tileParameterReferences = useDashboardSelector(
        (s) => s.dashboardData.tileParameterReferences,
    );
    const parameters = useDashboardSelector((s) => s.dashboardData.parameters);
    const savedParameters = useDashboardSelector(
        (s) => s.dashboardData.savedParameters,
    );
    const parameterDefinitions = useDashboardSelector(
        (s) => s.dashboardData.parameterDefinitions,
    );
    const _screenshotReadyTiles = useDashboardSelector(
        (s) => s.dashboardData.screenshotReadyTiles,
    );
    const _screenshotErroredTiles = useDashboardSelector(
        (s) => s.dashboardData.screenshotErroredTiles,
    );

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

    // Set project uuid
    useEffect(() => {
        dispatch(dashboardDataActions.setProjectUuid(projectUuid));
    }, [dispatch, projectUuid]);

    // Set default invalidate cache
    useEffect(() => {
        if (defaultInvalidateCache === true) {
            dispatch(dashboardDataActions.setInvalidateCache(true));
        }
    }, [dispatch, defaultInvalidateCache]);

    // Set date zoom from prop
    useEffect(() => {
        if (dateZoom !== undefined) {
            dispatch(dashboardDataActions.setDateZoomGranularity(dateZoom));
        }
    }, [dispatch, dateZoom]);

    // Set dashboard comments check
    useEffect(() => {
        dispatch(
            dashboardDataActions.setDashboardCommentsCheck(
                dashboardCommentsCheck,
            ),
        );
    }, [dispatch, dashboardCommentsCheck]);

    const {
        mutateAsync: versionRefresh,
        isLoading: isRefreshingDashboardVersion,
    } = useDashboardVersionRefresh(dashboardUuid, projectUuid);

    useEffect(() => {
        dispatch(
            dashboardDataActions.setIsRefreshingDashboardVersion(
                isRefreshingDashboardVersion,
            ),
        );
    }, [dispatch, isRefreshingDashboardVersion]);

    // Dashboard query
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

    // Sync dashboard query results to Redux
    useEffect(() => {
        dispatch(dashboardDataActions.setDashboard(dashboard ?? undefined));
        dispatch(
            dashboardDataActions.setIsDashboardLoading(isDashboardLoading),
        );
        dispatch(dashboardDataActions.setDashboardError(dashboardError));
    }, [dispatch, dashboard, isDashboardLoading, dashboardError]);

    // Dashboard comments
    const { data: dashboardComments } = useGetComments(
        dashboardUuid,
        projectUuid,
        !!dashboardCommentsCheck &&
            !!dashboardCommentsCheck.canViewDashboardComments,
    );

    useEffect(() => {
        dispatch(dashboardDataActions.setDashboardComments(dashboardComments));
    }, [dispatch, dashboardComments]);

    // Embed
    const { dispatchEmbedEvent } = useEmbedEventEmitter();
    const embed = useEmbed();
    const previousFiltersRef = useRef<DashboardFilters | null>(null);

    // Set tiles/tabs when dashboard loads
    useEffect(() => {
        if (dashboard?.tiles) {
            dispatch(dashboardDataActions.setDashboardTiles(dashboard.tiles));
        }
    }, [dispatch, dashboard?.tiles]);

    useEffect(() => {
        if (dashboard?.tabs) {
            dispatch(
                dashboardDataActions.setDashboardTabs(
                    sortBy(dashboard.tabs, 'order'),
                ),
            );
        }
    }, [dispatch, dashboard?.tabs]);

    // Sync parameters from dashboard
    useEffect(() => {
        if (dashboard?.parameters) {
            dispatch(
                dashboardDataActions.setSavedParameters(
                    dashboard.parameters ?? {},
                ),
            );
        }
    }, [dispatch, dashboard?.parameters]);

    // Set parameters to saved parameters when they are loaded
    useEffect(() => {
        if (savedParameters) {
            dispatch(dashboardDataActions.setParameters(savedParameters));
        }
    }, [dispatch, savedParameters]);

    // Date zoom disabled
    useEffect(() => {
        if (dashboard?.config?.isDateZoomDisabled === true) {
            dispatch(dashboardDataActions.setIsDateZoomDisabled(true));
        }
    }, [dispatch, dashboard]);

    // Add filter disabled
    useEffect(() => {
        if (dashboard?.config?.isAddFilterDisabled === true) {
            dispatch(dashboardDataActions.setIsAddFilterDisabled(true));
        }
    }, [dispatch, dashboard]);

    // Set pinned parameters when dashboard is loaded
    useEffect(() => {
        if (dashboard?.config?.pinnedParameters !== undefined) {
            dispatch(
                dashboardDataActions.setPinnedParameters(
                    dashboard.config.pinnedParameters,
                ),
            );
        } else if (dashboard?.config !== undefined) {
            dispatch(dashboardDataActions.setPinnedParameters([]));
        }
    }, [dispatch, dashboard?.config?.pinnedParameters, dashboard?.config]);

    // All standard granularities
    const allStandardGranularities = useMemo(
        () => Object.values(DateGranularity),
        [],
    );

    const dashboardHasTimestampDimension = tilesWithTimestampDimension.size > 0;

    const allGranularities = useMemo(
        () => [
            ...allStandardGranularities,
            ...Object.keys(availableCustomGranularities),
        ],
        [allStandardGranularities, availableCustomGranularities],
    );

    // Sync date zoom granularities from dashboard config
    useEffect(() => {
        if (dashboard?.config?.dateZoomGranularities !== undefined) {
            dispatch(
                dashboardDataActions.setDateZoomGranularitiesState(
                    dashboard.config.dateZoomGranularities,
                ),
            );
        } else {
            dispatch(
                dashboardDataActions.setDateZoomGranularitiesState(
                    allGranularities,
                ),
            );
        }
    }, [dispatch, dashboard?.config?.dateZoomGranularities, allGranularities]);

    // Sync default date zoom granularity from dashboard config
    useEffect(() => {
        dispatch(
            dashboardDataActions.setDefaultDateZoomGranularityState(
                dashboard?.config?.defaultDateZoomGranularity,
            ),
        );
    }, [dispatch, dashboard?.config?.defaultDateZoomGranularity]);

    // Set active tab when dashboard and tabs are loaded
    useEffect(() => {
        if (dashboardTabs && dashboardTabs.length > 0) {
            const matchedTab =
                dashboardTabs.find((tab) => tab.uuid === tabUuid) ??
                dashboardTabs[0];
            dispatch(dashboardDataActions.setActiveTab(matchedTab));
        }
    }, [dispatch, dashboardTabs, tabUuid]);

    // Apply scheduler parameters when provided
    useEffect(() => {
        if (schedulerParameters) {
            const dashboardParams = Object.fromEntries(
                Object.entries(schedulerParameters).map(([key, value]) => [
                    key,
                    { parameterName: key, value },
                ]),
            );
            dispatch(dashboardDataActions.setSavedParameters(dashboardParams));
        }
    }, [dispatch, schedulerParameters]);

    // Set parametersHaveChanged
    useEffect(() => {
        if (!isEqual(parameters, savedParameters)) {
            dispatch(dashboardDataActions.setParametersHaveChanged(true));
        }
    }, [dispatch, parameters, savedParameters]);

    // Parameter values
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

    useEffect(() => {
        dispatch(
            dashboardDataActions.setSelectedParametersCount(
                selectedParametersCount,
            ),
        );
    }, [dispatch, selectedParametersCount]);

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
            dispatch(
                dashboardDataActions.addParameterDefinitions(projectParameters),
            );
        }
    }, [dispatch, projectParameters]);

    // Determine if all chart tiles have loaded
    const areAllChartsLoaded = useMemo(() => {
        if (!dashboardTiles) return false;
        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab)
            return false;

        const chartTileUuids = dashboardTiles
            .filter(isDashboardChartTileType)
            .filter((tile) => {
                if (!activeTab) return true;
                return !tile.tabUuid || tile.tabUuid === activeTab.uuid;
            })
            .map((tile) => tile.uuid);

        return chartTileUuids.every((tileUuid) => loadedTiles.has(tileUuid));
    }, [dashboardTiles, loadedTiles, activeTab, dashboardTabs]);

    // Clean up stale granularities once all charts loaded
    useEffect(() => {
        if (!areAllChartsLoaded) return;

        const availableCustomGranularityKeys = new Set(
            Object.keys(availableCustomGranularities),
        );
        const isAvailable = (g: string) => {
            if (!isStandardDateGranularity(g)) {
                return availableCustomGranularityKeys.has(g);
            }
            if (!dashboardHasTimestampDimension && isSubDayGranularity(g)) {
                return false;
            }
            return true;
        };

        const filtered = dateZoomGranularities.filter(isAvailable);
        if (
            filtered.length !== dateZoomGranularities.length ||
            !filtered.every((g, i) => dateZoomGranularities[i] === g)
        ) {
            dispatch(dashboardDataActions.setDateZoomGranularities(filtered));
        }

        if (
            defaultDateZoomGranularity &&
            !isAvailable(defaultDateZoomGranularity)
        ) {
            dispatch(
                dashboardDataActions.setDefaultDateZoomGranularity(undefined),
            );
        }
    }, [
        areAllChartsLoaded,
        availableCustomGranularities,
        dashboardHasTimestampDimension,
        dateZoomGranularities,
        defaultDateZoomGranularity,
        dispatch,
    ]);

    // Screenshot tracking
    const expectedScreenshotTileUuids = useMemo(() => {
        if (!dashboardTiles) return [];

        if (schedulerTabsSelected && schedulerTabsSelected.length > 0) {
            return dashboardTiles
                .filter(
                    (tile) =>
                        isDashboardChartTileType(tile) ||
                        isDashboardSqlChartTile(tile),
                )
                .filter((tile) => schedulerTabsSelected.includes(tile.tabUuid!))
                .map((tile) => tile.uuid);
        }

        if (dashboardTabs && dashboardTabs.length > 0 && !activeTab) return [];

        return dashboardTiles
            .filter(
                (tile) =>
                    isDashboardChartTileType(tile) ||
                    isDashboardSqlChartTile(tile),
            )
            .filter((tile) => {
                if (!activeTab) return true;
                return !tile.tabUuid || tile.tabUuid === activeTab.uuid;
            })
            .map((tile) => tile.uuid);
    }, [dashboardTiles, activeTab, dashboardTabs, schedulerTabsSelected]);

    // Reset screenshot tiles when tiles or active tab change
    useEffect(() => {
        dispatch(dashboardDataActions.resetScreenshotTiles());
    }, [dispatch, dashboardTiles, activeTab]);

    // Missing required parameters
    const missingRequiredParameters = useMemo(() => {
        if (!dashboardParameterReferences.size) return [];
        return Array.from(dashboardParameterReferences).filter(
            (parameterName) =>
                !parameters[parameterName] &&
                !parameterDefinitions[parameterName]?.default,
        );
    }, [dashboardParameterReferences, parameters, parameterDefinitions]);

    // Remove parameter references for tiles no longer in the dashboard
    useEffect(() => {
        if (dashboardTiles) {
            const tileIds = new Set(dashboardTiles.map((tile) => tile.uuid));
            const filtered = Object.fromEntries(
                Object.entries(tileParameterReferences).filter(([tileId]) =>
                    tileIds.has(tileId),
                ),
            );
            if (
                Object.keys(filtered).length !==
                Object.keys(tileParameterReferences).length
            ) {
                dispatch(
                    dashboardDataActions.setTileParameterReferences(filtered),
                );
            }
        }
    }, [dispatch, dashboardTiles, tileParameterReferences]);

    // URL sync for date zoom
    useEffect(() => {
        if (embed.mode === 'sdk') return;

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
                { pathname, search: newParams.toString() },
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

    // Chart tile mapping key
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

    // Sync available filters data to Redux
    useEffect(() => {
        dispatch(
            dashboardDataActions.setIsLoadingDashboardFilters(
                isLoadingDashboardFilters,
            ),
        );
        dispatch(
            dashboardDataActions.setIsFetchingDashboardFilters(
                isFetchingDashboardFilters,
            ),
        );
        if (dashboardAvailableFiltersData) {
            dispatch(
                dashboardDataActions.setDashboardAvailableFiltersData({
                    allFilterableFields:
                        dashboardAvailableFiltersData.allFilterableFields,
                    allFilterableMetrics:
                        dashboardAvailableFiltersData.allFilterableMetrics,
                    savedQueryFilters:
                        dashboardAvailableFiltersData.savedQueryFilters,
                    savedQueryMetricFilters:
                        dashboardAvailableFiltersData.savedQueryMetricFilters,
                }),
            );
        }
    }, [
        dispatch,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        dashboardAvailableFiltersData,
    ]);

    const filterableFieldsByTileUuid = useMemo(() => {
        if (
            (!dashboard && !embedToken) ||
            !savedChartUuidsAndTileUuids ||
            !dashboardAvailableFiltersData
        )
            return undefined;

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
            if (!embedDashboard) return filters;
            if (!embedDashboard.dashboardFiltersInteractivity)
                return EMPTY_FILTERS;
            const interactivityOptions =
                embedDashboard.dashboardFiltersInteractivity;
            const filterInteractivityValue = getFilterInteractivityValue(
                interactivityOptions.enabled,
            );
            if (filterInteractivityValue === FilterInteractivityValues.none)
                return EMPTY_FILTERS;
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
            return filters;
        },
        [embedDashboard],
    );

    // Apply filters on dashboard load
    useEffect(() => {
        const currentDashboard = dashboard || embedDashboard;
        if (!currentDashboard) return;

        if (dashboardFilters === EMPTY_FILTERS) {
            const overrides = clone(overridesForSavedDashboardFilters);
            let updatedDashboardFilters = clone(currentDashboard.filters);

            // SDK filters
            const sdkFilters =
                embed.mode === 'sdk' && embed.filters ? embed.filters : [];
            if (sdkFilters.length > 0) {
                if (isLoadingDashboardFilters) return;
                updatedDashboardFilters.dimensions = sdkFilters.map(
                    (sdkFilter: SdkFilter) =>
                        convertSdkFilterToDashboardFilter(
                            sdkFilter,
                            filterableFieldsByTileUuid,
                        ),
                );
            }

            // Apply overrides from URL
            if (embed.mode === 'direct') {
                if (hasSavedFiltersOverrides(overrides)) {
                    updatedDashboardFilters = {
                        ...updatedDashboardFilters,
                        dimensions: applyDimensionOverrides(
                            updatedDashboardFilters,
                            overrides,
                        ),
                    };
                    dispatch(
                        dashboardFiltersActions.setHaveFiltersChanged(true),
                    );
                } else {
                    dispatch(
                        dashboardFiltersActions.setHaveFiltersChanged(false),
                    );
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
                    dispatch(
                        dashboardFiltersActions.setHaveFiltersChanged(true),
                    );
                } else {
                    dispatch(
                        dashboardFiltersActions.setHaveFiltersChanged(false),
                    );
                }
            }

            // Apply interactivity filtering
            updatedDashboardFilters = applyInteractivityFiltering(
                updatedDashboardFilters,
            );

            dispatch(
                dashboardFiltersActions.setDashboardFilters(
                    updatedDashboardFilters,
                ),
            );
        }

        dispatch(
            dashboardFiltersActions.setOriginalDashboardFilters(
                currentDashboard.filters,
            ),
        );
    }, [
        dashboard,
        embedDashboard,
        dashboardFilters,
        overridesForSavedDashboardFilters,
        embed,
        applyInteractivityFiltering,
        isLoadingDashboardFilters,
        filterableFieldsByTileUuid,
        dispatch,
    ]);

    // URL sync for temp and overridden filters
    useDeepCompareEffect(() => {
        if (embed.mode === 'sdk') return;

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

        const newSearch = newParams.toString();
        const currentSearch = currentParams.toString();
        if (newSearch !== currentSearch) {
            void navigate({ pathname, search: newSearch }, { replace: true });
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

    // Apply overrides when saved filters change
    useEffect(() => {
        if (
            dashboard?.filters &&
            hasSavedFiltersOverrides(overridesForSavedDashboardFilters)
        ) {
            const updated: DashboardFilters = {
                ...dashboardFilters,
                dimensions: applyDimensionOverrides(
                    dashboardFilters,
                    overridesForSavedDashboardFilters,
                ),
                metrics:
                    overridesForSavedDashboardFilters.metrics?.length > 0
                        ? dashboardFilters.metrics.map((metric) => {
                              const override =
                                  overridesForSavedDashboardFilters.metrics.find(
                                      (m) => m.id === metric.id,
                                  );
                              return override
                                  ? {
                                        ...override,
                                        tileTargets: metric.tileTargets,
                                    }
                                  : metric;
                          })
                        : dashboardFilters.metrics,
                tableCalculations: dashboardFilters.tableCalculations,
            };
            dispatch(dashboardFiltersActions.setDashboardFilters(updated));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboard?.filters, overridesForSavedDashboardFilters, dispatch]);

    // Read filters/dateZoom from URL on mount
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
                dispatch(
                    dashboardDataActions.setDateZoomGranularity(standardMatch),
                );
            } else {
                dispatch(
                    dashboardDataActions.setDateZoomGranularity(dateZoomParam),
                );
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
                dispatch(
                    dashboardFiltersActions.setDashboardFilters(
                        unsavedDashboardFilters,
                    ),
                );
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
                dispatch(
                    dashboardFiltersActions.setDashboardTemporaryFilters(
                        convertDashboardFiltersParamToDashboardFilters(
                            JSON.parse(tempFilterSearchParam),
                        ),
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

    // Apply default date zoom granularity
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
            if (!dateZoomParam) {
                dispatch(
                    dashboardDataActions.setDateZoomGranularity(
                        dashboard.config.defaultDateZoomGranularity,
                    ),
                );
            }
        }
    }, [
        dispatch,
        dashboard?.config?.defaultDateZoomGranularity,
        dashboard?.config?.isDateZoomDisabled,
        isEditMode,
    ]);

    // Reset dateZoomGranularity if not in allowed list
    useEffect(() => {
        if (
            dateZoomGranularity &&
            dateZoomGranularities.length > 0 &&
            !dateZoomGranularities.includes(dateZoomGranularity)
        ) {
            dispatch(
                dashboardDataActions.setDateZoomGranularity(
                    defaultDateZoomGranularity ?? undefined,
                ),
            );
        }
    }, [
        dispatch,
        dateZoomGranularities,
        dateZoomGranularity,
        defaultDateZoomGranularity,
    ]);

    // allFilters
    const allFilters = useMemo(
        () => ({
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
        }),
        [dashboardFilters, dashboardTemporaryFilters],
    );

    // Filter change events
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

    // Store complex derived data that the bridge needs but that doesn't fit neatly into redux
    // These are passed via a ref context so the bridge can read them
    const derivedDataRef = useRef({
        allFilters,
        filterableFieldsByTileUuid,
        dashboardAvailableFiltersData,
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
        applyInteractivityFiltering,
        versionRefresh,
        missingRequiredParameters,
        expectedScreenshotTileUuids,
        areAllChartsLoaded,
        dashboardParameterReferences,
        parameterValues,
        selectedParametersCount,
        dashboard: dashboard || embedDashboard,
        originalDashboardFilters,
    });

    // Keep ref up to date
    derivedDataRef.current = {
        allFilters,
        filterableFieldsByTileUuid,
        dashboardAvailableFiltersData,
        overridesForSavedDashboardFilters,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
        applyInteractivityFiltering,
        versionRefresh,
        missingRequiredParameters,
        expectedScreenshotTileUuids,
        areAllChartsLoaded,
        dashboardParameterReferences,
        parameterValues,
        selectedParametersCount,
        dashboard: dashboard || embedDashboard,
        originalDashboardFilters,
    };

    return (
        <DashboardBridgeProvider
            derivedDataRef={derivedDataRef}
            dashboardCommentsCheck={dashboardCommentsCheck}
        >
            {children}
        </DashboardBridgeProvider>
    );
};

/**
 * Outer component that creates the Redux store and wraps children.
 */
const DashboardReduxProvider: React.FC<Props> = (props) => {
    const [store] = useState(() => createDashboardStore());
    return (
        <ReduxProvider store={store}>
            <DashboardReduxSync {...props} />
        </ReduxProvider>
    );
};

export default DashboardReduxProvider;
