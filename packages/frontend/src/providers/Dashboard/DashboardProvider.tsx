import {
    applyDimensionOverrides,
    getItemId,
    isStandardDateGranularity,
    type AdditionalMetric,
    type ChartZoomableField,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardConfig,
    type DashboardParameters,
    type DateGranularity,
    type DateZoomConfig,
    type FilterableDimension,
    type InteractivityOptions,
    type LanguageMap,
    type Metric,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type SortField,
} from '@lightdash/common';
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ComponentProps,
} from 'react';
import { Provider } from 'react-redux';
import { useLocation, useParams } from 'react-router';
import { useMount } from 'react-use';
import { type SdkFilter } from '../../ee/features/embed/EmbedDashboard/types';
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
import {
    buildInitialDashboardState,
    createDashboardStore,
    dashboardDateZoomActions,
    dashboardEditActions,
    dashboardFiltersActions,
    dashboardParametersActions,
    DashboardStoreContext,
    emptyDashboardFilters,
    getSavedDateZoomSettings,
    selectActiveTab,
    selectDashboardCustomMetrics,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    selectDateZoomConfig,
    selectDateZoomGranularities,
    selectDefaultDateZoomGranularity,
    selectHasDateZoomConfigChanged,
    selectHasDefaultDateZoomGranularityChanged,
    selectHasTilesThatSupportFilters,
    selectHaveCustomMetricsChanged,
    selectHaveDateZoomGranularitiesChanged,
    selectHaveTabsChanged,
    selectHaveTilesChanged,
    selectEditedRequiredFiltersNote,
    selectIsAddFilterDisabled,
    selectIsDateZoomDisabled,
    selectSavedChartUuidsAndTileUuids,
    selectSavedChartUuidsAndTileUuidsKey,
    selectTileUuidsKey,
    useDashboardDateZoomGranularities,
    useDefaultDateZoomGranularity,
    selectDateZoomGranularity,
    selectHasParameterOrderChanged,
    selectHaveFiltersChanged,
    selectHavePinnedParametersChanged,
    selectRawTemporaryFilters,
    selectAvailableCustomGranularities,
    selectSavedParameters,
    selectTilesWithDateZoomApplied,
    useAreAllChartsLoaded,
    useDashboardSelector,
    type DashboardStore,
    type TemporaryFilterLocks,
} from '../../features/dashboard/store';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
    useDashboardVersionRefresh,
} from '../../hooks/dashboard/useDashboard';
import useToaster from '../../hooks/toaster/useToaster';
import DashboardContext from './context';
import DashboardDateZoomSync from './DashboardDateZoomSync';
import DashboardFiltersSync from './DashboardFiltersSync';
import DashboardParametersSync from './DashboardParametersSync';
import DashboardTileStatusProvider from './DashboardTileStatusProvider';
import { applyEmbedFilterInteractivity } from './embedFilterInteractivity';
import { getActiveTabForTabs } from './getActiveTabForTabs';
import useDashboardContext from './useDashboardContext';

type DashboardProviderProps = React.PropsWithChildren<{
    schedulerDashboardFilters?: DashboardFilters | undefined;
    schedulerFilters?: DashboardFilterRule[] | undefined;
    schedulerParameters?: ParametersValuesMap | undefined;
    schedulerTabsSelected?: (string | null)[] | undefined;
    dateZoom?: DateGranularity | string | undefined;
    projectUuid?: string;
    embedToken?: string;
    dashboardCommentsCheck?: ReturnType<typeof useDashboardCommentsCheck>;
    defaultInvalidateCache?: boolean;
    sdkFilters?: SdkFilter[];
    parameterLabelOverrides?: LanguageMap['parameters'];
    // Interactive dashboard page only. The /minimal render used for exports
    // and scheduled deliveries must leave this off so a viewer's unpublished
    // draft never reaches a delivered image, PDF or spreadsheet.
    includeUnpublishedDraft?: boolean;
}>;

const DashboardProviderInner: React.FC<DashboardProviderProps> = ({
    schedulerDashboardFilters,
    schedulerFilters,
    schedulerParameters,
    schedulerTabsSelected,
    dateZoom,
    projectUuid,
    embedToken,
    dashboardCommentsCheck,
    defaultInvalidateCache,
    includeUnpublishedDraft = false,
    parameterLabelOverrides,
    children,
}) => {
    const { search } = useLocation();
    const { showToastWarning } = useToaster();

    const {
        dashboardUuid: dashboardIdentifier,
        tabUuid,
        mode,
    } = useParams<{
        dashboardUuid: string;
        tabUuid?: string;
        mode?: string;
    }>() as {
        dashboardUuid: string;
        tabUuid?: string;
        mode?: string;
    };

    const isEditMode = mode === 'edit';

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
        uuidOrSlug: dashboardIdentifier,
        projectUuid,
        includeUnpublishedDraft,
        useQueryOptions: {
            select: (d) => {
                if (schedulerDashboardFilters) {
                    return {
                        ...d,
                        filters: schedulerDashboardFilters,
                    };
                }

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
    const dashboardUuid = (dashboard ?? embedDashboard)?.uuid;
    const {
        mutateAsync: versionRefresh,
        isLoading: isRefreshingDashboardVersion,
    } = useDashboardVersionRefresh(dashboardUuid, projectUuid);

    // Embedded dashboards populate `embedDashboard` instead of the query hook,
    // so config-derived state must read from whichever holds the dashboard.
    const currentDashboardConfig = useMemo(
        () => (dashboard ?? embedDashboard)?.config,
        [dashboard, embedDashboard],
    );

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

    // Filter, parameter, date zoom and edit state lives in a per-mount store so
    // edits only re-render the components that select it, not every context consumer.
    const [{ store, urlRestoreErrors }] = useState(() => {
        const initial = buildInitialDashboardState({
            search,
            isEditMode,
            parameterLabelOverrides,
            dateZoom,
            invalidateCache: defaultInvalidateCache === true,
        });
        return {
            store: createDashboardStore(initial.state),
            urlRestoreErrors: initial.urlRestoreErrors,
        };
    });

    const [chartSort, setChartSort] = useState<Record<string, SortField[]>>({});

    const setDateZoomGranularity = useCallback<
        React.Dispatch<
            React.SetStateAction<DateGranularity | string | undefined>
        >
    >(
        (value) => {
            store.dispatch(
                dashboardDateZoomActions.setGranularity(
                    typeof value === 'function'
                        ? value(selectDateZoomGranularity(store.getState()))
                        : value,
                ),
            );
        },
        [store],
    );

    const editSetters = useEditSetters(store, currentDashboardConfig);

    // Allows users to disable date zoom and the add filter button on view mode;
    // config can switch them on, never back off
    useEffect(() => {
        if (dashboard?.config?.isDateZoomDisabled === true) {
            store.dispatch(dashboardEditActions.setIsDateZoomDisabled(true));
        }
        if (dashboard?.config?.isAddFilterDisabled === true) {
            store.dispatch(dashboardEditActions.setIsAddFilterDisabled(true));
        }
    }, [store, dashboard]);

    useEffect(() => {
        store.dispatch(
            dashboardParametersActions.setParameterLabelOverrides(
                parameterLabelOverrides,
            ),
        );
    }, [store, parameterLabelOverrides]);

    const addParameterDefinitions = useCallback(
        (parameters: ParameterDefinitions) => {
            store.dispatch(
                dashboardParametersActions.addParameterDefinitions(parameters),
            );
        },
        [store],
    );

    // Per-control runtime grain overrides only; an absent entry means "use the
    // control's persisted default" (the resolver applies `?? control.granularity`).
    const setControlGranularity = useCallback(
        (
            controlUuid: string,
            granularity: DateGranularity | string | undefined,
        ) => {
            store.dispatch(
                dashboardDateZoomActions.setControlGranularity({
                    controlUuid,
                    granularity,
                }),
            );
        },
        [store],
    );

    useEffect(() => {
        store.dispatch(dashboardParametersActions.setIsEditMode(isEditMode));
    }, [store, isEditMode]);

    useEffect(() => {
        if (urlRestoreErrors.parameters) {
            showToastWarning({
                title: 'Could not restore parameters from URL',
                subtitle:
                    'The link appears to be incomplete. Please ask for it to be shared again.',
            });
        }
    }, [showToastWarning, urlRestoreErrors]);

    // Set pinned parameters when dashboard is loaded
    useEffect(() => {
        if (dashboard?.config?.pinnedParameters !== undefined) {
            store.dispatch(
                dashboardParametersActions.syncPinnedParameters(
                    dashboard.config.pinnedParameters,
                ),
            );
        } else if (dashboard?.config !== undefined) {
            // Initialize empty array if dashboard has config but no pinnedParameters
            store.dispatch(dashboardParametersActions.syncPinnedParameters([]));
        }
    }, [store, dashboard?.config?.pinnedParameters, dashboard?.config]);

    // Set parameter order when dashboard is loaded
    useEffect(() => {
        if (dashboard?.config?.parameterOrder !== undefined) {
            store.dispatch(
                dashboardParametersActions.syncParameterOrder(
                    dashboard.config.parameterOrder,
                ),
            );
        } else if (dashboard?.config !== undefined) {
            store.dispatch(dashboardParametersActions.syncParameterOrder([]));
        }
    }, [store, dashboard?.config?.parameterOrder, dashboard?.config]);

    // Seed the staged custom-metrics registry from config; keep user edits
    // until save/cancel resets the changed flag.
    const haveCustomMetricsChanged = useStoreValue(
        store,
        selectHaveCustomMetricsChanged,
    );
    useEffect(() => {
        store.dispatch(
            dashboardEditActions.syncCustomMetrics(
                currentDashboardConfig?.customMetrics ?? [],
            ),
        );
    }, [
        store,
        currentDashboardConfig?.customMetrics,
        haveCustomMetricsChanged,
    ]);

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
            store.dispatch(
                dashboardParametersActions.setSavedParameters(dashboardParams),
            );
        }
    }, [store, schedulerParameters]);

    const setSavedParameters = useCallback<
        React.Dispatch<React.SetStateAction<DashboardParameters>>
    >(
        (value) => {
            store.dispatch(
                dashboardParametersActions.setSavedParameters(
                    typeof value === 'function'
                        ? value(selectSavedParameters(store.getState()))
                        : value,
                ),
            );
        },
        [store],
    );

    const setParameter = useCallback(
        (key: string, value: ParameterValue | null) => {
            store.dispatch(
                dashboardParametersActions.setParameter({ key, value }),
            );
        },
        [store],
    );

    const clearAllParameters = useCallback(() => {
        store.dispatch(dashboardParametersActions.clearAllParameters());
    }, [store]);

    const setPinnedParameters = useCallback(
        (pinnedParams: string[]) => {
            store.dispatch(
                dashboardParametersActions.setPinnedParameters(pinnedParams),
            );
        },
        [store],
    );

    const toggleParameterPin = useCallback(
        (parameterKey: string) => {
            store.dispatch(
                dashboardParametersActions.toggleParameterPin(parameterKey),
            );
        },
        [store],
    );

    const setHavePinnedParametersChanged = useCallback<
        React.Dispatch<React.SetStateAction<boolean>>
    >(
        (value) => {
            store.dispatch(
                dashboardParametersActions.setHavePinnedParametersChanged(
                    typeof value === 'function'
                        ? value(
                              selectHavePinnedParametersChanged(
                                  store.getState(),
                              ),
                          )
                        : value,
                ),
            );
        },
        [store],
    );

    const setParameterOrder = useCallback(
        (order: string[]) => {
            store.dispatch(dashboardParametersActions.setParameterOrder(order));
        },
        [store],
    );

    const setHasParameterOrderChanged = useCallback<
        React.Dispatch<React.SetStateAction<boolean>>
    >(
        (value) => {
            store.dispatch(
                dashboardParametersActions.setHasParameterOrderChanged(
                    typeof value === 'function'
                        ? value(
                              selectHasParameterOrderChanged(store.getState()),
                          )
                        : value,
                ),
            );
        },
        [store],
    );

    const addParameterReferences = useCallback(
        (tileUuid: string, references: string[]) => {
            store.dispatch(
                dashboardParametersActions.addParameterReferences({
                    tileUuid,
                    references,
                }),
            );
        },
        [store],
    );

    const setTileChartSavedParameters = useCallback(
        (tileUuid: string, values: ParametersValuesMap) => {
            store.dispatch(
                dashboardParametersActions.setTileChartSavedParameters({
                    tileUuid,
                    values,
                }),
            );
        },
        [store],
    );

    // Remove parameter references and zoomable fields for tiles that are no
    // longer in the dashboard
    const tileUuidsKey = useStoreValue(store, selectTileUuidsKey);
    useEffect(() => {
        if (tileUuidsKey === undefined) return;
        const tileUuids = tileUuidsKey === '' ? [] : tileUuidsKey.split(',');
        store.dispatch(
            dashboardParametersActions.keepTileParameterState(tileUuids),
        );
        store.dispatch(
            dashboardDateZoomActions.keepTileDateZoomState(tileUuids),
        );
    }, [store, tileUuidsKey]);

    // The date fields each chart tile can actually be zoomed on, reported up
    // from each tile (it has the explore + metricQuery). The date-zoom control
    // modal offers exactly these per tile, instead of every filterable date
    // dimension in the explore.
    const setChartZoomableFields = useCallback(
        (tileUuid: string, fields: ChartZoomableField[]) => {
            store.dispatch(
                dashboardDateZoomActions.setChartZoomableFields({
                    tileUuid,
                    fields,
                }),
            );
        },
        [store],
    );

    const setTilesWithDateZoomApplied = useCallback<
        React.Dispatch<React.SetStateAction<Set<string> | undefined>>
    >(
        (value) => {
            store.dispatch(
                dashboardDateZoomActions.setTilesWithDateZoomApplied(
                    typeof value === 'function'
                        ? value(
                              selectTilesWithDateZoomApplied(store.getState()),
                          )
                        : value,
                ),
            );
        },
        [store],
    );

    useEffect(() => {
        if (urlRestoreErrors.savedFilterOverrides) {
            showToastWarning({
                title: 'Could not restore filters from URL',
                subtitle:
                    'The link appears to be incomplete. Please ask for it to be shared again.',
            });
        }
    }, [showToastWarning, urlRestoreErrors]);

    // Only changes with the chart-tile mapping, not when tiles move or resize
    const savedChartUuidsAndTileUuidsKey = useStoreValue(
        store,
        selectSavedChartUuidsAndTileUuidsKey,
    );
    const savedChartUuidsAndTileUuids = useMemo(
        () => selectSavedChartUuidsAndTileUuids(store.getState()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [store, savedChartUuidsAndTileUuidsKey],
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

    // Temporary filters may not override a filter locked on the active tab;
    // embeds don't load the dashboard through the query, so nothing is locked.
    const savedFiltersForLocks = dashboard?.filters;
    const hasTabsForLocks = (dashboard?.tabs?.length ?? 0) > 0;
    const temporaryFilterLocks = useMemo<TemporaryFilterLocks | undefined>(
        () =>
            savedFiltersForLocks
                ? {
                      savedFilters: savedFiltersForLocks,
                      hasTabs: hasTabsForLocks,
                  }
                : undefined,
        [savedFiltersForLocks, hasTabsForLocks],
    );

    useMount(() => {
        // Temp filters and date zoom are restored when the store is built
        if (urlRestoreErrors.temporaryFilters) {
            showToastWarning({
                title: 'Could not restore filters from URL',
                subtitle:
                    'The link appears to be incomplete. Please ask for it to be shared again.',
            });
        }
    });

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

    const hiddenFilterableFieldIds = useMemo(
        () => new Set(dashboardAvailableFiltersData?.hiddenFilterableFieldIds),
        [dashboardAvailableFiltersData],
    );

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

    // Resets saved filters, temporary filters and the URL overrides of saved filters
    const resetDashboardFilters = useCallback(() => {
        const filters =
            dashboard?.filters ??
            embedDashboard?.filters ??
            emptyDashboardFilters;
        store.dispatch(
            dashboardFiltersActions.resetFilters(
                applyEmbedFilterInteractivity(filters, embedDashboard),
            ),
        );
    }, [store, dashboard?.filters, embedDashboard]);

    const hasTilesThatSupportFilters = useStoreValue(
        store,
        selectHasTilesThatSupportFilters,
    );

    const setDashboardFilters = useCallback<
        React.Dispatch<React.SetStateAction<DashboardFilters>>
    >(
        (value) => {
            store.dispatch(
                dashboardFiltersActions.setDashboardFilters(
                    typeof value === 'function'
                        ? value(selectDashboardFilters(store.getState()))
                        : value,
                ),
            );
        },
        [store],
    );

    const setDashboardTemporaryFilters = useCallback<
        React.Dispatch<React.SetStateAction<DashboardFilters>>
    >(
        (value) => {
            store.dispatch(
                dashboardFiltersActions.setTemporaryFilters(
                    typeof value === 'function'
                        ? value(selectRawTemporaryFilters(store.getState()))
                        : value,
                ),
            );
        },
        [store],
    );

    const setHaveFiltersChanged = useCallback<
        React.Dispatch<React.SetStateAction<boolean>>
    >(
        (value) => {
            store.dispatch(
                dashboardFiltersActions.setHaveFiltersChanged(
                    typeof value === 'function'
                        ? value(selectHaveFiltersChanged(store.getState()))
                        : value,
                ),
            );
        },
        [store],
    );

    const addDimensionDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            store.dispatch(
                dashboardFiltersActions.addFilter({
                    filter,
                    isTemporary,
                    category: 'dimensions',
                }),
            );
        },
        [store],
    );

    const savedDimensionFilters =
        dashboard?.filters?.dimensions || embedDashboard?.filters?.dimensions;
    const savedFilters = (dashboard || embedDashboard)?.filters;
    const updateDimensionDashboardFilter = useCallback(
        (
            filter: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) => {
            store.dispatch(
                dashboardFiltersActions.updateFilter({
                    filter,
                    index,
                    isTemporary,
                    isInEditMode,
                    isFilterSaved: (savedDimensionFilters || []).some(
                        ({ id }) => id === filter.id,
                    ),
                    originalFilter: savedFilters?.dimensions[index],
                    category: 'dimensions',
                }),
            );
        },
        [store, savedDimensionFilters, savedFilters],
    );

    const addMetricDashboardFilter = useCallback(
        (filter: DashboardFilterRule, isTemporary: boolean) => {
            store.dispatch(
                dashboardFiltersActions.addFilter({
                    filter,
                    isTemporary,
                    category: 'metrics',
                }),
            );
        },
        [store],
    );

    const savedMetricFilters =
        dashboard?.filters?.metrics || embedDashboard?.filters?.metrics;
    const updateMetricDashboardFilter = useCallback(
        (
            filter: DashboardFilterRule,
            index: number,
            isTemporary: boolean,
            isInEditMode: boolean,
        ) => {
            store.dispatch(
                dashboardFiltersActions.updateFilter({
                    filter,
                    index,
                    isTemporary,
                    isInEditMode,
                    isFilterSaved: (savedMetricFilters || []).some(
                        ({ id }) => id === filter.id,
                    ),
                    originalFilter: savedFilters?.metrics[index],
                    category: 'metrics',
                }),
            );
        },
        [store, savedMetricFilters, savedFilters],
    );

    const removeMetricDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            store.dispatch(
                dashboardFiltersActions.removeFilter({
                    index,
                    isTemporary,
                    category: 'metrics',
                }),
            );
        },
        [store],
    );

    const removeDimensionDashboardFilter = useCallback(
        (index: number, isTemporary: boolean) => {
            store.dispatch(
                dashboardFiltersActions.removeFilter({
                    index,
                    isTemporary,
                    category: 'dimensions',
                }),
            );
        },
        [store],
    );

    const refreshDashboardVersion = useCallback(async () => {
        try {
            const freshDashboard = await versionRefresh(dashboard);

            // Only update local state if we got fresh data back
            // (null means dashboard was already up-to-date)
            if (freshDashboard) {
                store.dispatch(
                    dashboardEditActions.setTiles(freshDashboard.tiles),
                );
                store.dispatch(
                    dashboardEditActions.setTabs(freshDashboard.tabs),
                );
                setSavedParameters(freshDashboard.parameters ?? {});
            }
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
            // Could optionally show a toast error here
        }
    }, [store, versionRefresh, dashboard, setSavedParameters]);

    const value = {
        projectUuid,
        includeUnpublishedDraft,
        isDashboardLoading,
        dashboard: dashboard || embedDashboard,
        setEmbedDashboard,
        dashboardError,
        ...editSetters,
        setDashboardTemporaryFilters,
        addDimensionDashboardFilter,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        addMetricDashboardFilter,
        updateMetricDashboardFilter,
        removeMetricDashboardFilter,
        resetDashboardFilters,
        setDashboardFilters,
        setHaveFiltersChanged,
        allFilterableFieldsMap,
        allFilterableMetricsMap,
        hiddenFilterableFieldIds,
        allFilterableFields: dashboardAvailableFiltersData?.allFilterableFields,
        allFilterableMetrics:
            dashboardAvailableFiltersData?.allFilterableMetrics,
        isLoadingDashboardFilters,
        isFetchingDashboardFilters,
        filterableFieldsByTileUuid,
        temporaryFilterLocks,
        setChartZoomableFields,
        hasTilesThatSupportFilters,
        chartSort,
        setChartSort,
        setDateZoomGranularity,
        setTilesWithDateZoomApplied,
        setControlGranularity,
        dashboardCommentsCheck,
        dashboardComments,
        hasTileComments,
        setSavedParameters,
        setParameter,
        clearAllParameters,
        addParameterReferences,
        setTileChartSavedParameters,
        setPinnedParameters,
        toggleParameterPin,
        setHavePinnedParametersChanged,
        setParameterOrder,
        setHasParameterOrderChanged,
        addParameterDefinitions,
        refreshDashboardVersion,
        isRefreshingDashboardVersion,
    };
    return (
        <Provider store={store} context={DashboardStoreContext}>
            <DashboardContext.Provider value={value}>
                <ConnectedDashboardTileStatusProvider
                    schedulerTabsSelected={schedulerTabsSelected}
                >
                    <DashboardGranularitySync />
                    {children}
                </ConnectedDashboardTileStatusProvider>
                {/* After children so their effects run after the page's, as when they lived in this provider */}
                <ConnectedDashboardFiltersSync
                    dashboardIdentifier={dashboardIdentifier}
                    dashboard={dashboard}
                    embedDashboard={embedDashboard}
                    savedChartUuidsAndTileUuids={savedChartUuidsAndTileUuids}
                    filterableFieldsByTileUuid={filterableFieldsByTileUuid}
                    temporaryFilterLocks={temporaryFilterLocks}
                />
                <DashboardParametersSync
                    projectUuid={projectUuid}
                    isEditMode={isEditMode}
                />
                <ConnectedDashboardDateZoomSync
                    dashboardConfig={currentDashboardConfig}
                    dashboardUuid={dashboard?.uuid}
                    isDashboardLoaded={!!(dashboard ?? embedDashboard)}
                    isEditMode={isEditMode}
                    configDefaultDateZoomGranularity={
                        currentDashboardConfig?.defaultDateZoomGranularity
                    }
                    isDateZoomDisabledInConfig={
                        currentDashboardConfig?.isDateZoomDisabled
                    }
                />
                <DashboardActiveTabSync
                    tabUuid={tabUuid}
                    isEditMode={isEditMode}
                />
            </DashboardContext.Provider>
        </Provider>
    );
};

/**
 * Bridge component that reads tile-status context values
 * and syncs them back to the main dashboard context via effects.
 * This exists because DashboardProviderInner cannot use useDashboardTileStatusContext
 * (tile status provider is rendered as its child).
 */
const DashboardGranularitySync: React.FC = () => {
    const areAllChartsLoaded = useAreAllChartsLoaded();
    const availableCustomGranularities = useDashboardSelector(
        selectAvailableCustomGranularities,
    );

    // Use refs for values we read but should NOT trigger re-runs of the effect.
    // Reading dateZoomGranularities directly in the dep array would cause an
    // infinite loop: effect filters → setDateZoomGranularities (which also sets
    // haveDateZoomGranularitiesChanged) → new context value → effect re-fires.
    const dateZoomGranularities = useDashboardDateZoomGranularities();
    const dateZoomGranularitiesRef = useRef(dateZoomGranularities);
    dateZoomGranularitiesRef.current = dateZoomGranularities;

    const defaultDateZoomGranularity = useDefaultDateZoomGranularity();
    const defaultDateZoomGranularityRef = useRef(defaultDateZoomGranularity);
    defaultDateZoomGranularityRef.current = defaultDateZoomGranularity;

    const setDateZoomGranularities = useDashboardContext(
        (c) => c.setDateZoomGranularities,
    );
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );

    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const dateZoomGranularityRef = useRef(dateZoomGranularity);
    dateZoomGranularityRef.current = dateZoomGranularity;

    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );

    // Once all charts have loaded, clean up stale custom granularities no longer
    // provided by any explore. Standard granularities (incl. sub-day) are never
    // pruned — the editor-defined list is preserved across tab switches.
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
        setDateZoomGranularities,
        setDefaultDateZoomGranularity,
        setDateZoomGranularity,
    ]);

    return null;
};

/** The provider renders the store's Provider, so it subscribes directly */
const useStoreValue = <T,>(
    store: DashboardStore,
    selector: (state: ReturnType<DashboardStore['getState']>) => T,
) => useSyncExternalStore(store.subscribe, () => selector(store.getState()));

const resolve = <T,>(value: React.SetStateAction<T>, previous: () => T): T =>
    typeof value === 'function' ? (value as (prev: T) => T)(previous()) : value;

/** Stable context setters for the edit state; they read the store at call time */
const useEditSetters = (
    store: DashboardStore,
    config: DashboardConfig | undefined,
) => {
    const savedSettings = useMemo(
        () => getSavedDateZoomSettings(config),
        [config],
    );
    const savedSettingsRef = useRef(savedSettings);
    useLayoutEffect(() => {
        savedSettingsRef.current = savedSettings;
    }, [savedSettings]);

    // A changed saved config replaces drafts of its settings
    useEffect(() => {
        store.dispatch(dashboardEditActions.dropStaleDrafts(savedSettings));
    }, [store, savedSettings]);

    return useMemo(() => {
        const { dispatch, getState } = store;
        const savedDateZoomConfig = () =>
            savedSettingsRef.current.dateZoomConfig;
        return {
            setDashboardTiles: (
                value: React.SetStateAction<Dashboard['tiles'] | undefined>,
            ) =>
                dispatch(
                    dashboardEditActions.setTiles(
                        resolve(value, () => selectDashboardTiles(getState())),
                    ),
                ),
            setHaveTilesChanged: (value: React.SetStateAction<boolean>) =>
                dispatch(
                    dashboardEditActions.setHaveTilesChanged(
                        resolve(value, () =>
                            selectHaveTilesChanged(getState()),
                        ),
                    ),
                ),
            setDashboardTabs: (
                value: React.SetStateAction<Dashboard['tabs']>,
            ) =>
                dispatch(
                    dashboardEditActions.setTabs(
                        resolve(value, () => selectDashboardTabs(getState())),
                    ),
                ),
            setHaveTabsChanged: (value: React.SetStateAction<boolean>) =>
                dispatch(
                    dashboardEditActions.setHaveTabsChanged(
                        resolve(value, () => selectHaveTabsChanged(getState())),
                    ),
                ),
            setActiveTab: (
                value: React.SetStateAction<
                    Dashboard['tabs'][number] | undefined
                >,
            ) =>
                dispatch(
                    dashboardEditActions.setActiveTab(
                        resolve(value, () => selectActiveTab(getState())),
                    ),
                ),
            setDashboardCustomMetrics: (
                value: React.SetStateAction<AdditionalMetric[]>,
            ) =>
                dispatch(
                    dashboardEditActions.setCustomMetrics(
                        resolve(value, () =>
                            selectDashboardCustomMetrics(getState()),
                        ),
                    ),
                ),
            setHaveCustomMetricsChanged: (
                value: React.SetStateAction<boolean>,
            ) =>
                dispatch(
                    dashboardEditActions.setHaveCustomMetricsChanged(
                        resolve(value, () =>
                            selectHaveCustomMetricsChanged(getState()),
                        ),
                    ),
                ),
            setIsDateZoomDisabled: (value: React.SetStateAction<boolean>) =>
                dispatch(
                    dashboardEditActions.setIsDateZoomDisabled(
                        resolve(value, () =>
                            selectIsDateZoomDisabled(getState()),
                        ),
                    ),
                ),
            setIsAddFilterDisabled: (value: React.SetStateAction<boolean>) =>
                dispatch(
                    dashboardEditActions.setIsAddFilterDisabled(
                        resolve(value, () =>
                            selectIsAddFilterDisabled(getState()),
                        ),
                    ),
                ),
            setRequiredFiltersNote: (
                value: React.SetStateAction<string | undefined>,
            ) =>
                dispatch(
                    dashboardEditActions.setRequiredFiltersNote(
                        resolve(value, () =>
                            selectEditedRequiredFiltersNote(getState()),
                        ),
                    ),
                ),
            setDateZoomConfig: (dateZoomConfig: DateZoomConfig) =>
                dispatch(
                    dashboardEditActions.setDateZoomConfig({
                        value: dateZoomConfig,
                        changed: true,
                        saved: savedDateZoomConfig(),
                    }),
                ),
            setHasDateZoomConfigChanged: (
                value: React.SetStateAction<boolean>,
            ) => {
                const saved = savedDateZoomConfig();
                const state = getState();
                dispatch(
                    dashboardEditActions.setDateZoomConfig({
                        value: selectDateZoomConfig(state, saved),
                        changed: resolve(value, () =>
                            selectHasDateZoomConfigChanged(state, saved),
                        ),
                        saved,
                    }),
                );
            },
            setDateZoomGranularities: (
                granularities: (DateGranularity | string)[],
            ) =>
                dispatch(
                    dashboardEditActions.setDateZoomGranularities({
                        value: granularities,
                        saved: savedSettingsRef.current.dateZoomGranularities,
                    }),
                ),
            setHaveDateZoomGranularitiesChanged: (
                value: React.SetStateAction<boolean>,
            ) =>
                dispatch(
                    dashboardEditActions.setHaveDateZoomGranularitiesChanged(
                        resolve(value, () =>
                            selectHaveDateZoomGranularitiesChanged(getState()),
                        ),
                    ),
                ),
            setDefaultDateZoomGranularity: (
                granularity: DateGranularity | string | undefined,
            ) =>
                dispatch(
                    dashboardEditActions.setDefaultDateZoomGranularity({
                        value: granularity,
                        saved: savedSettingsRef.current
                            .defaultDateZoomGranularity,
                    }),
                ),
            setHasDefaultDateZoomGranularityChanged: (
                value: React.SetStateAction<boolean>,
            ) =>
                dispatch(
                    dashboardEditActions.setHasDefaultDateZoomGranularityChanged(
                        resolve(value, () =>
                            selectHasDefaultDateZoomGranularityChanged(
                                getState(),
                            ),
                        ),
                    ),
                ),
        };
    }, [store]);
};

// The wrappers below select edit state so the provider itself doesn't
// re-render when tiles, tabs or the active tab change.

const ConnectedDashboardTileStatusProvider: React.FC<
    Omit<
        ComponentProps<typeof DashboardTileStatusProvider>,
        'dashboardTiles' | 'dashboardTabs' | 'activeTab'
    >
> = (props) => (
    <DashboardTileStatusProvider
        {...props}
        dashboardTiles={useDashboardSelector(selectDashboardTiles)}
        dashboardTabs={useDashboardSelector(selectDashboardTabs)}
        activeTab={useDashboardSelector(selectActiveTab)}
    />
);

const ConnectedDashboardFiltersSync: React.FC<
    Omit<ComponentProps<typeof DashboardFiltersSync>, 'activeTab'>
> = (props) => (
    <DashboardFiltersSync
        {...props}
        activeTab={useDashboardSelector(selectActiveTab)}
    />
);

// Takes the config by prop, not context, so the allowed list arrives in the
// same render as `isDashboardLoaded` and a URL value is never checked against
// the placeholder list
const ConnectedDashboardDateZoomSync: React.FC<
    Omit<
        ComponentProps<typeof DashboardDateZoomSync>,
        'dateZoomGranularities' | 'defaultDateZoomGranularity'
    > & { dashboardConfig: DashboardConfig | undefined }
> = ({ dashboardConfig, ...props }) => {
    const saved = useMemo(
        () => getSavedDateZoomSettings(dashboardConfig),
        [dashboardConfig],
    );
    const dateZoomGranularities = useDashboardSelector((state) =>
        selectDateZoomGranularities(state, saved.dateZoomGranularities),
    );
    const defaultDateZoomGranularity = useDashboardSelector((state) =>
        selectDefaultDateZoomGranularity(
            state,
            saved.defaultDateZoomGranularity,
        ),
    );
    return (
        <DashboardDateZoomSync
            {...props}
            dateZoomGranularities={dateZoomGranularities}
            defaultDateZoomGranularity={defaultDateZoomGranularity}
        />
    );
};

/**
 * Picks the active tab when the tabs or the URL tab change. In view mode,
 * hidden tabs are not selectable: a URL pointing at one falls back to the first
 * visible tab. In edit mode all tabs are selectable.
 */
const DashboardActiveTabSync: React.FC<{
    tabUuid: string | undefined;
    isEditMode: boolean;
}> = ({ tabUuid, isEditMode }) => {
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const setActiveTab = useDashboardContext((c) => c.setActiveTab);
    useEffect(() => {
        if (dashboardTabs && dashboardTabs.length > 0) {
            setActiveTab((currentActiveTab) =>
                getActiveTabForTabs(
                    dashboardTabs,
                    tabUuid,
                    isEditMode,
                    currentActiveTab,
                ),
            );
        }
    }, [dashboardTabs, tabUuid, isEditMode, setActiveTab]);
    return null;
};

const DashboardProvider: React.FC<DashboardProviderProps> = (props) => {
    return <DashboardProviderInner {...props} />;
};

export default DashboardProvider;
