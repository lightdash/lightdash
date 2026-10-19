import {
    applyDimensionOverrides,
    compressDashboardFiltersToParam,
    isFilterLockedOnTab,
    stripOverridesForLockedFiltersOnTab,
    type Dashboard,
    type DashboardFilterableField,
    type DashboardFilters,
    type InteractivityOptions,
    type SavedChartsInfoForDashboardAvailableFilters,
} from '@lightdash/common';
import clone from 'lodash/clone';
import isEqual from 'lodash/isEqual';
import { useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useDeepCompareEffect } from 'react-use';
import { type SdkFilter } from '../../ee/features/embed/EmbedDashboard/types';
import {
    convertSdkFilterToDashboardFilter,
    haveSdkFiltersChanged,
    shouldDeferSdkFilters,
} from '../../ee/features/embed/EmbedDashboard/utils';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import {
    combineDashboardFilters,
    dashboardFiltersActions,
    emptyDashboardFilters,
    getSafeTemporaryFilters,
    hasSavedFiltersOverrides,
    selectDashboardFilters,
    selectRawTemporaryFilters,
    selectSavedFilterOverrides,
    useDashboardDispatch,
    useDashboardSelector,
    type TemporaryFilterLocks,
} from '../../features/dashboard/store';
import useToaster from '../../hooks/toaster/useToaster';
import { applyEmbedFilterInteractivity } from './embedFilterInteractivity';

type Props = {
    dashboardIdentifier: string;
    /** Dashboard loaded through the query; embeds use `embedDashboard` */
    dashboard: Dashboard | undefined;
    embedDashboard: (Dashboard & InteractivityOptions) | undefined;
    activeTab: Dashboard['tabs'][number] | undefined;
    savedChartUuidsAndTileUuids:
        | SavedChartsInfoForDashboardAvailableFilters
        | undefined;
    filterableFieldsByTileUuid:
        | Record<string, DashboardFilterableField[]>
        | undefined;
    temporaryFilterLocks: TemporaryFilterLocks | undefined;
};

/**
 * Applies saved, URL, session and SDK filters on load and keeps the URL and
 * embed host in sync with filter state. Renders nothing; it lives outside the
 * provider so filter edits don't re-render the whole dashboard context.
 */
const DashboardFiltersSync: FC<Props> = ({
    dashboardIdentifier,
    dashboard,
    embedDashboard,
    activeTab,
    savedChartUuidsAndTileUuids,
    filterableFieldsByTileUuid,
    temporaryFilterLocks,
}) => {
    const { search, pathname } = useLocation();
    const navigate = useNavigate();
    const { showToastInfo, showToastWarning } = useToaster();
    const embed = useEmbed();
    const { dispatchEmbedEvent } = embed;
    const dispatch = useDashboardDispatch();

    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    const overridesForSavedDashboardFilters = useDashboardSelector(
        selectSavedFilterOverrides,
    );

    const hasNotifiedLockedOverrideRef = useRef(false);
    const previousFiltersRef = useRef<DashboardFilters | null>(null);
    const appliedSdkFiltersRef = useRef<
        | {
              dashboardUuid: string;
              activeTabUuid: string | null;
              filters: SdkFilter[] | undefined;
              managedDimensionFilterIds: string[];
          }
        | undefined
    >(undefined);

    const dashboardUuid = (dashboard ?? embedDashboard)?.uuid;

    // Reset the "locked filter override" toast guard on dashboard navigation
    // so each dashboard gets a fresh chance to notify the viewer.
    useEffect(() => {
        hasNotifiedLockedOverrideRef.current = false;
    }, [dashboardIdentifier]);

    const savedDashboardFilters = (dashboard ?? embedDashboard)?.filters;
    useEffect(() => {
        if (savedDashboardFilters) {
            dispatch(
                dashboardFiltersActions.reconcileSavedFilterOverrideIds(
                    savedDashboardFilters,
                ),
            );
        }
    }, [dispatch, savedDashboardFilters]);

    const applyInteractivityFiltering = useCallback(
        (filters: DashboardFilters) =>
            applyEmbedFilterInteractivity(filters, embedDashboard),
        [embedDashboard],
    );

    // Apply filters on dashboard load in order of precedence:
    // 1. Start with restored dashboard filters, or the saved filters
    // 2. Apply overrides for iframe embed or replace SDK filters in SDK mode
    // 3. Apply interactivity filtering (embedded dashboards only)
    //
    // This runs on the initial load and whenever SDK-managed filters change.
    useEffect(() => {
        const currentDashboard = dashboard || embedDashboard;

        if (!currentDashboard) return;

        const sdkFilters = embed.mode === 'sdk' ? embed.filters : undefined;
        const sdkFilterValuesChanged = haveSdkFiltersChanged(
            appliedSdkFiltersRef.current?.filters,
            sdkFilters,
        );
        const sdkFilterContextChanged =
            sdkFilters !== undefined &&
            (appliedSdkFiltersRef.current?.dashboardUuid !==
                currentDashboard.uuid ||
                appliedSdkFiltersRef.current.activeTabUuid !==
                    (activeTab?.uuid ?? null));
        const sdkFiltersChanged =
            embed.mode === 'sdk' &&
            (sdkFilterValuesChanged || sdkFilterContextChanged);

        if (dashboardFilters === emptyDashboardFilters || sdkFiltersChanged) {
            let overrides = clone(overridesForSavedDashboardFilters);

            // Step 1: Start with restored filters when returning from the
            // chart editor. Slug routes only resolve their UUID after the
            // dashboard loads, so restore the UUID-keyed state here instead
            // of during the provider's initial mount.
            const preserveUnmanagedFilters =
                dashboardFilters !== emptyDashboardFilters &&
                sdkFilters !== undefined &&
                appliedSdkFiltersRef.current?.filters !== undefined &&
                appliedSdkFiltersRef.current.dashboardUuid ===
                    currentDashboard.uuid;
            let updatedDashboardFilters = preserveUnmanagedFilters
                ? {
                      ...clone(dashboardFilters),
                      dimensions: dashboardFilters.dimensions.filter(
                          (filter) =>
                              !appliedSdkFiltersRef.current?.managedDimensionFilterIds.includes(
                                  filter.id,
                              ),
                      ),
                  }
                : clone(currentDashboard.filters);
            const filtersStorageKey = dashboardUuid
                ? `unsavedDashboardFilters:${dashboardUuid}`
                : null;
            const unsavedDashboardFiltersRaw = filtersStorageKey
                ? sessionStorage.getItem(filtersStorageKey)
                : null;

            if (
                dashboardFilters === emptyDashboardFilters &&
                unsavedDashboardFiltersRaw &&
                filtersStorageKey
            ) {
                sessionStorage.removeItem(filtersStorageKey);
                try {
                    updatedDashboardFilters = JSON.parse(
                        unsavedDashboardFiltersRaw,
                    );
                } catch {
                    showToastWarning({
                        title: 'Could not restore unsaved filters',
                        subtitle:
                            'Your previous filter changes could not be loaded',
                    });
                }
            }

            let droppedLockedOverrides = 0;
            let managedDimensionFilterIds: string[] = [];

            // Step 2: Apply SDK Filters
            // For SDK mode, SDK filters replace embedded dashboard filters
            if (sdkFilters !== undefined) {
                if ((currentDashboard.tabs?.length ?? 0) > 0 && !activeTab) {
                    return;
                }

                // Wait until we have the data needed to build cross-explore
                // tileTargets. `isLoadingDashboardFilters` alone is not
                // enough because the available-filters query is disabled
                // until tile metadata loads, and React Query reports a
                // disabled query as not loading.
                if (
                    sdkFilters.length > 0 &&
                    shouldDeferSdkFilters(
                        savedChartUuidsAndTileUuids,
                        filterableFieldsByTileUuid,
                    )
                ) {
                    return;
                }

                const convertedSdkFilters = sdkFilters.map((sdkFilter) =>
                    convertSdkFilterToDashboardFilter(
                        sdkFilter,
                        filterableFieldsByTileUuid,
                    ),
                );
                const hasTabs = (currentDashboard.tabs?.length ?? 0) > 0;
                const sdkStripResult = stripOverridesForLockedFiltersOnTab(
                    currentDashboard.filters,
                    {
                        dimensions: convertedSdkFilters,
                        metrics: [],
                        tableCalculations: [],
                    },
                    activeTab?.uuid,
                    hasTabs,
                );
                droppedLockedOverrides += sdkStripResult.droppedCount;
                // SDK filters replace embedded dashboard filters, but
                // locked saved filters must be preserved — otherwise an
                // SDK consumer could drop a lock by simply not sending
                // a filter for that field. Mirrors how EmbedService
                // merges locked saved rules with safe overrides
                // server-side.
                const lockedSavedDimensions =
                    currentDashboard.filters.dimensions.filter((rule) =>
                        isFilterLockedOnTab(rule, activeTab?.uuid, hasTabs),
                    );
                updatedDashboardFilters.dimensions = [
                    ...lockedSavedDimensions,
                    ...sdkStripResult.filters.dimensions,
                ];
                managedDimensionFilterIds =
                    updatedDashboardFilters.dimensions.map(
                        (filter) => filter.id,
                    );
            }

            if (embed.mode === 'sdk') {
                appliedSdkFiltersRef.current = {
                    dashboardUuid: currentDashboard.uuid,
                    activeTabUuid: activeTab?.uuid ?? null,
                    filters: clone(sdkFilters),
                    managedDimensionFilterIds,
                };
            }

            // Apply overrides from URL — but never override filters locked on
            // the currently active tab (or dashboard-wide if there are no tabs).
            if (hasSavedFiltersOverrides(overrides)) {
                const urlStripResult = stripOverridesForLockedFiltersOnTab(
                    currentDashboard.filters,
                    overrides,
                    activeTab?.uuid,
                    (currentDashboard.tabs?.length ?? 0) > 0,
                );
                overrides = urlStripResult.filters;
                droppedLockedOverrides += urlStripResult.droppedCount;
            }

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

            if (
                droppedLockedOverrides > 0 &&
                !hasNotifiedLockedOverrideRef.current
            ) {
                hasNotifiedLockedOverrideRef.current = true;
                showToastInfo({
                    title: 'Locked dashboard filter',
                    subtitle:
                        droppedLockedOverrides === 1
                            ? 'A filter override was ignored because the dashboard editor locked that filter.'
                            : `${droppedLockedOverrides} filter overrides were ignored because the dashboard editor locked those filters.`,
                });
            }

            // Step 3: Apply interactivity filtering for embedded dashboards
            updatedDashboardFilters = applyInteractivityFiltering(
                updatedDashboardFilters,
            );

            dispatch(
                dashboardFiltersActions.setDashboardFilters(
                    updatedDashboardFilters,
                ),
            );
        }
    }, [
        dashboard,
        embedDashboard,
        dashboardFilters,
        overridesForSavedDashboardFilters,
        embed,
        applyInteractivityFiltering,
        savedChartUuidsAndTileUuids,
        filterableFieldsByTileUuid,
        showToastInfo,
        showToastWarning,
        activeTab,
        dashboardUuid,
        dispatch,
    ]);

    const {
        filters: safeTemporaryFilters,
        droppedCount: lockedTemporaryDroppedCount,
    } = useMemo(
        () =>
            getSafeTemporaryFilters(
                temporaryFilters,
                temporaryFilterLocks,
                activeTab?.uuid,
            ),
        [temporaryFilters, temporaryFilterLocks, activeTab?.uuid],
    );

    useEffect(() => {
        if (lockedTemporaryDroppedCount === 0) return;
        if (hasNotifiedLockedOverrideRef.current) return;
        hasNotifiedLockedOverrideRef.current = true;
        const scopeSuffix = temporaryFilterLocks?.hasTabs ? ' on this tab' : '';
        showToastInfo({
            title: 'Locked dashboard filter',
            subtitle:
                lockedTemporaryDroppedCount === 1
                    ? `A temporary filter was ignored because the dashboard editor locked it${scopeSuffix}.`
                    : `${lockedTemporaryDroppedCount} temporary filters were ignored because the dashboard editor locked them${scopeSuffix}.`,
        });
    }, [
        lockedTemporaryDroppedCount,
        showToastInfo,
        temporaryFilterLocks?.hasTabs,
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
            safeTemporaryFilters?.dimensions?.length === 0 &&
            safeTemporaryFilters?.metrics?.length === 0
        ) {
            newParams.delete('tempFilters');
        } else {
            newParams.set(
                'tempFilters',
                JSON.stringify(
                    compressDashboardFiltersToParam(safeTemporaryFilters),
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
        safeTemporaryFilters,
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
            const { filters: safeOverrides } =
                stripOverridesForLockedFiltersOnTab(
                    dashboard.filters,
                    overridesForSavedDashboardFilters,
                    activeTab?.uuid,
                    (dashboard.tabs?.length ?? 0) > 0,
                );

            if (!hasSavedFiltersOverrides(safeOverrides)) {
                return;
            }

            dispatch(
                dashboardFiltersActions.applySavedFilterOverrides(
                    safeOverrides,
                ),
            );
        }
    }, [
        dashboard?.filters,
        dashboard?.tabs,
        overridesForSavedDashboardFilters,
        activeTab,
        dispatch,
    ]);

    const allFilters = useMemo(
        () => combineDashboardFilters(dashboardFilters, safeTemporaryFilters),
        [dashboardFilters, safeTemporaryFilters],
    );

    // Watch for filter changes and emit events (skip initial render)
    useEffect(() => {
        // URL temporary filters are restored before load; don't count load as a change
        if (dashboardFilters === emptyDashboardFilters) {
            previousFiltersRef.current = null;
            return;
        }
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
    }, [allFilters, dashboardFilters, dispatchEmbedEvent]);

    return null;
};

export default DashboardFiltersSync;
