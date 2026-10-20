import {
    applyDimensionOverrides,
    DashboardTileTypes,
    DateGranularity,
    EMPTY_DATE_ZOOM_CONFIG,
    getItemId,
    isDashboardChartTileType,
    isStandardDateGranularity,
    isSubDayGranularity,
    normalizeDateZoomConfig,
    type AdditionalMetric,
    type ChartZoomableField,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateZoomConfig,
    type FilterableDimension,
    type InteractivityOptions,
    type LanguageMap,
    type Metric,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
    type SavedChartsInfoForDashboardAvailableFilters,
    type SortField,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import sortBy from 'lodash/sortBy';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
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
    dashboardFiltersActions,
    dashboardParametersActions,
    DashboardStoreContext,
    emptyDashboardFilters,
    selectDashboardFilters,
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

    const [dashboardTiles, setDashboardTiles] = useState<Dashboard['tiles']>();
    const [haveTilesChanged, setHaveTilesChanged] = useState<boolean>(false);
    const [dashboardCustomMetrics, setDashboardCustomMetrics] = useState<
        AdditionalMetric[]
    >([]);
    const [haveCustomMetricsChanged, setHaveCustomMetricsChanged] =
        useState<boolean>(false);
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

    // Filter, parameter and date zoom state lives in a per-mount store so edits only
    // re-render the components that select it, not every context consumer.
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

    // Editor-authored note shown to viewers while filter rules are unmet;
    // unsaved edits win over the saved config value
    const [editedRequiredFiltersNote, setRequiredFiltersNote] =
        useState<string>();
    const requiredFiltersNote =
        editedRequiredFiltersNote ??
        currentDashboardConfig?.requiredFiltersNote;

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

    // Date zoom granularities state.
    // Default offers every standard granularity except sub-day ones; editors can
    // still enable sub-day granularities (Second/Minute/Hour) explicitly.
    const defaultStandardGranularities = useMemo(
        () =>
            Object.values(DateGranularity).filter(
                (g) => !isSubDayGranularity(g),
            ),
        [],
    );

    const [dateZoomGranularities, setDateZoomGranularitiesState] = useState<
        (DateGranularity | string)[]
    >(defaultStandardGranularities);
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

    // Configurable date zoom controls (named controls + per-tile targets).
    const [dateZoomConfig, setDateZoomConfigState] = useState<DateZoomConfig>(
        EMPTY_DATE_ZOOM_CONFIG,
    );
    const [hasDateZoomConfigChanged, setHasDateZoomConfigChanged] =
        useState(false);

    const setDateZoomConfig = useCallback((config: DateZoomConfig) => {
        setDateZoomConfigState(config);
        setHasDateZoomConfigChanged(true);
    }, []);

    // Persisted config, used to seed editable state on load and after save.
    const persistedDateZoomConfig = useMemo(
        () => normalizeDateZoomConfig(currentDashboardConfig),
        [currentDashboardConfig],
    );
    const [syncedDateZoomConfig, setSyncedDateZoomConfig] =
        useState<DateZoomConfig | null>(null);

    // Re-seed editable state when persisted content changes (load + post-save),
    // adjusting during render so a no-op refetch can't clobber in-progress edits.
    if (!isEqual(persistedDateZoomConfig, syncedDateZoomConfig)) {
        setSyncedDateZoomConfig(persistedDateZoomConfig);
        setDateZoomConfigState(persistedDateZoomConfig);
        setHasDateZoomConfigChanged(false);
    }

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

    // Sync date zoom granularities from dashboard config during render, so the
    // URL granularity is never validated against a stale list
    // Note: Custom granularities from explores are added by DashboardGranularitySync
    const persistedDateZoomGranularities =
        currentDashboardConfig?.dateZoomGranularities ??
        defaultStandardGranularities;
    const [syncedDateZoomGranularities, setSyncedDateZoomGranularities] =
        useState<(DateGranularity | string)[]>(defaultStandardGranularities);
    if (persistedDateZoomGranularities !== syncedDateZoomGranularities) {
        setSyncedDateZoomGranularities(persistedDateZoomGranularities);
        setDateZoomGranularitiesState(persistedDateZoomGranularities);
    }

    // Seed the staged custom-metrics registry from config; keep user edits
    // until save/cancel resets the changed flag.
    useEffect(() => {
        if (haveCustomMetricsChanged) return;
        setDashboardCustomMetrics(currentDashboardConfig?.customMetrics ?? []);
    }, [currentDashboardConfig?.customMetrics, haveCustomMetricsChanged]);

    // Sync default date zoom granularity from dashboard config, also during render
    const persistedDefaultDateZoomGranularity =
        currentDashboardConfig?.defaultDateZoomGranularity;
    const [
        syncedDefaultDateZoomGranularity,
        setSyncedDefaultDateZoomGranularity,
    ] = useState<DateGranularity | string | undefined>(undefined);
    if (
        persistedDefaultDateZoomGranularity !== syncedDefaultDateZoomGranularity
    ) {
        setSyncedDefaultDateZoomGranularity(
            persistedDefaultDateZoomGranularity,
        );
        setDefaultDateZoomGranularityState(persistedDefaultDateZoomGranularity);
    }

    // Set active tab when dashboard and tabs are loaded.
    // In view mode, hidden tabs are not selectable — fall back to the first
    // visible tab if the URL points at a hidden tab. In edit mode all tabs are selectable.
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
    }, [dashboardTabs, tabUuid, isEditMode]);

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

    // Remove parameter references for tiles that are no longer in the dashboard
    useEffect(() => {
        if (dashboardTiles) {
            store.dispatch(
                dashboardParametersActions.keepTileParameterState(
                    dashboardTiles.map((tile) => tile.uuid),
                ),
            );
        }
    }, [store, dashboardTiles]);

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

    // Drop zoomable fields for tiles no longer on the dashboard
    useEffect(() => {
        if (dashboardTiles) {
            store.dispatch(
                dashboardDateZoomActions.keepTileDateZoomState(
                    dashboardTiles.map((tile) => tile.uuid),
                ),
            );
        }
    }, [store, dashboardTiles]);

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

    const hasTilesThatSupportFilters = useMemo(() => {
        const tileTypesThatSupportFilters = [
            DashboardTileTypes.SQL_CHART,
            DashboardTileTypes.SAVED_CHART,
        ];
        return !!dashboardTiles?.some(({ type }) =>
            tileTypesThatSupportFilters.includes(type),
        );
    }, [dashboardTiles]);

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

    const value = {
        projectUuid,
        includeUnpublishedDraft,
        isDashboardLoading,
        dashboard: dashboard || embedDashboard,
        setEmbedDashboard,
        dashboardError,
        dashboardTiles,
        setDashboardTiles,
        haveTilesChanged,
        setHaveTilesChanged,
        dashboardCustomMetrics,
        setDashboardCustomMetrics,
        haveCustomMetricsChanged,
        setHaveCustomMetricsChanged,
        haveTabsChanged,
        setHaveTabsChanged,
        dashboardTabs,
        setDashboardTabs,
        activeTab,
        setActiveTab,
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
        dateZoomConfig,
        setDateZoomConfig,
        hasDateZoomConfigChanged,
        setHasDateZoomConfigChanged,
        setControlGranularity,
        dashboardCommentsCheck,
        dashboardComments,
        hasTileComments,
        isDateZoomDisabled,
        setIsDateZoomDisabled,
        isAddFilterDisabled,
        setIsAddFilterDisabled,
        requiredFiltersNote,
        setRequiredFiltersNote,
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
        <Provider store={store} context={DashboardStoreContext}>
            <DashboardContext.Provider value={value}>
                <DashboardTileStatusProvider
                    dashboardTiles={dashboardTiles}
                    dashboardTabs={dashboardTabs}
                    activeTab={activeTab}
                    schedulerTabsSelected={schedulerTabsSelected}
                >
                    <DashboardGranularitySync />
                    {children}
                </DashboardTileStatusProvider>
                {/* After children so their effects run after the page's, as when they lived in this provider */}
                <DashboardFiltersSync
                    dashboardIdentifier={dashboardIdentifier}
                    dashboard={dashboard}
                    embedDashboard={embedDashboard}
                    activeTab={activeTab}
                    savedChartUuidsAndTileUuids={savedChartUuidsAndTileUuids}
                    filterableFieldsByTileUuid={filterableFieldsByTileUuid}
                    temporaryFilterLocks={temporaryFilterLocks}
                />
                <DashboardParametersSync
                    projectUuid={projectUuid}
                    isEditMode={isEditMode}
                />
                <DashboardDateZoomSync
                    dashboardUuid={dashboard?.uuid}
                    isDashboardLoaded={!!(dashboard ?? embedDashboard)}
                    isEditMode={isEditMode}
                    configDefaultDateZoomGranularity={
                        currentDashboardConfig?.defaultDateZoomGranularity
                    }
                    isDateZoomDisabledInConfig={
                        currentDashboardConfig?.isDateZoomDisabled
                    }
                    dateZoomGranularities={dateZoomGranularities}
                    defaultDateZoomGranularity={defaultDateZoomGranularity}
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

const DashboardProvider: React.FC<DashboardProviderProps> = (props) => {
    return <DashboardProviderInner {...props} />;
};

export default DashboardProvider;
