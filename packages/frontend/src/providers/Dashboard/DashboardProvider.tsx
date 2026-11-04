import {
    applyDimensionOverrides,
    isStandardDateGranularity,
    type DashboardConfig,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameters,
    type DateGranularity,
    type LanguageMap,
    type ParametersValuesMap,
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
import {
    useGetComments,
    type useDashboardCommentsCheck,
} from '../../features/comments';
import {
    buildInitialDashboardState,
    createDashboardStore,
    dashboardDateZoomActions,
    dashboardEditActions,
    dashboardParametersActions,
    dashboardSourceActions,
    DashboardStoreContext,
    getFilterableFieldsByTileUuid,
    getSavedDateZoomSettings,
    getTemporaryFilterLocks,
    initialDashboardProviderState,
    selectActiveTab,
    selectAvailableCustomGranularities,
    selectDashboardTabs,
    selectDashboardTiles,
    selectDateZoomGranularities,
    selectDateZoomGranularity,
    selectDefaultDateZoomGranularity,
    selectEmbedDashboard,
    selectHaveCustomMetricsChanged,
    selectSavedChartUuidsAndTileUuids,
    selectSavedChartUuidsAndTileUuidsKey,
    selectTileUuidsKey,
    useAreAllChartsLoaded,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
    useDefaultDateZoomGranularity,
    type DashboardProviderState,
    type DashboardStore,
} from '../../features/dashboard/store';
import {
    useDashboardQuery,
    useDashboardsAvailableFilters,
    useDashboardVersionRefresh,
} from '../../hooks/dashboard/useDashboard';
import { useDashboardTileParameterReferences } from '../../hooks/dashboard/useDashboardTileParameterReferences';
import useToaster from '../../hooks/toaster/useToaster';
import DashboardDateZoomSync from './DashboardDateZoomSync';
import DashboardFiltersSync from './DashboardFiltersSync';
import DashboardParametersSync from './DashboardParametersSync';
import DashboardTileStatusProvider from './DashboardTileStatusProvider';
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

    // All dashboard state lives in a per-mount store so edits only re-render
    // the components that select it
    const [{ store, urlRestoreErrors }] = useState(() => {
        const initial = buildInitialDashboardState({
            search,
            isEditMode,
            parameterLabelOverrides,
            dateZoom,
            invalidateCache: defaultInvalidateCache === true,
            // What is loaded before the store exists; the rest syncs below
            source: {
                ...initialDashboardProviderState,
                projectUuid,
                includeUnpublishedDraft,
                embedToken,
                queryDashboard: dashboard,
                isDashboardLoading,
                dashboardError: dashboardError ?? null,
                dashboardCommentsCheck,
            },
        });
        return {
            store: createDashboardStore(initial.state),
            urlRestoreErrors: initial.urlRestoreErrors,
        };
    });

    // Embedded dashboards will not be using this query hook to load the dashboard,
    // so they set the dashboard on the store instead
    const embedDashboard = useStoreValue(store, selectEmbedDashboard);
    const dashboardUuid = (dashboard ?? embedDashboard)?.uuid;
    const { mutateAsync: versionRefresh } = useDashboardVersionRefresh(
        dashboardUuid,
        projectUuid,
    );

    // Config-derived state must read from whichever holds the dashboard.
    const currentDashboardConfig = (dashboard ?? embedDashboard)?.config;

    const { data: dashboardComments } = useGetComments(
        dashboardUuid,
        projectUuid,
        !!dashboardCommentsCheck &&
            !!dashboardCommentsCheck.canViewDashboardComments,
    );

    useSavedDateZoomSettingsSync(store, currentDashboardConfig);

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

    const isDashboardLoaded = (dashboard ?? embedDashboard) !== undefined;
    const savedControlSections = currentDashboardConfig?.controlSections;
    useEffect(() => {
        if (!isDashboardLoaded) return;
        store.dispatch(
            dashboardEditActions.syncControlSections(
                savedControlSections ?? [],
            ),
        );
    }, [store, isDashboardLoaded, savedControlSections]);

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
        data: availableFilters,
    } = useDashboardsAvailableFilters(
        savedChartUuidsAndTileUuids ?? [],
        projectUuid,
        embedToken,
    );
    useDashboardTileParameterReferences({ store, projectUuid, isEditMode });

    // Computed here as well as in the store, so the filter sync gets them in
    // the same render as the dashboard, not a commit later
    const filterableFieldsByTileUuid = useMemo(
        () =>
            getFilterableFieldsByTileUuid(
                dashboard,
                embedToken,
                savedChartUuidsAndTileUuids,
                availableFilters,
            ),
        [dashboard, embedToken, savedChartUuidsAndTileUuids, availableFilters],
    );
    const savedFiltersForLocks = dashboard?.filters;
    const hasTabsForLocks = (dashboard?.tabs?.length ?? 0) > 0;
    const temporaryFilterLocks = useMemo(
        () => getTemporaryFilterLocks(savedFiltersForLocks, hasTabsForLocks),
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
                store.dispatch(
                    dashboardParametersActions.setSavedParameters(
                        freshDashboard.parameters ?? {},
                    ),
                );
            }
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
        }
    }, [store, versionRefresh, dashboard]);

    // Mirrors what this provider loaded into the store before paint, one
    // commit after react-query. The reducer ignores unchanged payloads.
    const providerState = useMemo<DashboardProviderState>(
        () => ({
            projectUuid,
            includeUnpublishedDraft,
            embedToken,
            queryDashboard: dashboard,
            isDashboardLoading,
            dashboardError: dashboardError ?? null,
            availableFilters,
            isLoadingDashboardFilters,
            isFetchingDashboardFilters,
            dashboardCommentsCheck,
            dashboardComments,
            refreshDashboardVersion,
        }),
        [
            projectUuid,
            includeUnpublishedDraft,
            embedToken,
            dashboard,
            isDashboardLoading,
            dashboardError,
            availableFilters,
            isLoadingDashboardFilters,
            isFetchingDashboardFilters,
            dashboardCommentsCheck,
            dashboardComments,
            refreshDashboardVersion,
        ],
    );
    useLayoutEffect(() => {
        store.dispatch(dashboardSourceActions.sync(providerState));
    }, [store, providerState]);

    return (
        <Provider store={store} context={DashboardStoreContext}>
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
                isDashboardLoaded={isDashboardLoaded}
                isEditMode={isEditMode}
                configDefaultDateZoomGranularity={
                    currentDashboardConfig?.defaultDateZoomGranularity
                }
                isDateZoomDisabledInConfig={
                    currentDashboardConfig?.isDateZoomDisabled
                }
            />
            <DashboardActiveTabSync tabUuid={tabUuid} isEditMode={isEditMode} />
        </Provider>
    );
};

/**
 * Reads tile-status values and prunes stale granularities once all charts
 * loaded. A child of the tile status provider, which the provider renders.
 */
const DashboardGranularitySync: React.FC = () => {
    const areAllChartsLoaded = useAreAllChartsLoaded();
    const availableCustomGranularities = useDashboardSelector(
        selectAvailableCustomGranularities,
    );

    // Use refs for values we read but should NOT trigger re-runs of the effect.
    // Reading dateZoomGranularities directly in the dep array would cause an
    // infinite loop: effect filters → setDateZoomGranularities (which also sets
    // haveDateZoomGranularitiesChanged) → new value → effect re-fires.
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

/** A changed saved config replaces drafts of its date zoom settings */
const useSavedDateZoomSettingsSync = (
    store: DashboardStore,
    config: DashboardConfig | undefined,
) => {
    const savedSettings = useMemo(
        () => getSavedDateZoomSettings(config),
        [config],
    );
    useEffect(() => {
        store.dispatch(dashboardEditActions.dropStaleDrafts(savedSettings));
    }, [store, savedSettings]);
};

// The wrappers below select state so the provider itself doesn't
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
