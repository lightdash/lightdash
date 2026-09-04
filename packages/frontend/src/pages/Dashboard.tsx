import { subject } from '@casl/ability';
import {
    copyDateZoomTileTargets,
    excludeTilesFromTabScopedFilters,
    getDefaultChartTileSize,
    getItemId,
    getShadowedReservedNames,
    mergeDashboardCustomMetrics,
    normalizeDateZoomConfig,
    removeDateZoomTileTargets,
    ChartType,
    ContentType,
    DashboardTileTypes,
    DateGranularity,
    FeatureFlags,
    type AdditionalMetric,
    type DashboardFilterRule,
    type UpdateDashboard,
    type DashboardTile,
    type Dashboard as IDashboard,
    type SavedChart,
} from '@lightdash/common';
import { Button, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    ErrorBoundary as SentryErrorBoundary,
    captureException,
} from '@sentry/react';
import { IconAlertCircle, IconCircleCheckFilled } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { type Layout } from 'react-grid-layout';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import styles from '../components/common/Dashboard/Dashboard.module.css';
import DashboardHeader from '../components/common/Dashboard/DashboardHeader';
import ErrorState from '../components/common/ErrorState';
import MantineModal from '../components/common/MantineModal';
import DashboardDeleteModal from '../components/common/modal/DashboardDeleteModal';
import DashboardDuplicateModal from '../components/common/modal/DashboardDuplicateModal';
import { DashboardExportModal } from '../components/common/modal/DashboardExportModal';
import Page from '../components/common/Page/Page';
import DashboardChartEditorModal from '../components/DashboardTiles/DashboardChartEditorModal';
import PageSpinner from '../components/PageSpinner';
import { useDashboardCommentsCheck } from '../features/comments';
import DismissedDraftAlert from '../features/contentAsCode/components/DismissedDraftAlert';
import DraftOverlayFailureAlert from '../features/contentAsCode/components/DraftOverlayFailureAlert';
import DraftStaleAlert from '../features/contentAsCode/components/DraftStaleAlert';
import {
    useDraftStaleness,
    useRebaseDraftMutation,
    useReopenDraftMutation,
} from '../features/contentAsCode/hooks/useContentDrafts';
import { FilterBarPopoversProvider } from '../features/dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import DashboardTabs from '../features/dashboardTabs';
import {
    appendNewTilesToBottom,
    useUpdateDashboard,
} from '../hooks/dashboard/useDashboard';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useContentAction } from '../hooks/useContent';
import { useProjectUrlIdentifier } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import DashboardAiAgentContextBridge from '../providers/Dashboard/DashboardAiAgentContextBridge';
import DashboardProvider from '../providers/Dashboard/DashboardProvider';
import { DashboardChartEditContext } from '../providers/Dashboard/useDashboardChartEdit';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../providers/Dashboard/useDashboardTileStatusContext';
import useNativeFullscreenToggle from '../providers/Fullscreen/useNativeFullscreenToggle';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import { buildDashboardConfig } from '../utils/dashboardConfig';
import { isSameDashboardRoute } from '../utils/dashboardRoutes';
import '../styles/react-grid.css';

const Dashboard: FC = () => {
    const navigate = useNavigate();
    const projectUuid = useProjectUuid();
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const { dashboardUuid: routeDashboardIdentifier, mode } = useParams<{
        dashboardUuid: string;
        mode?: string;
    }>();

    const { clearIsEditingDashboardChart, clearDashboardStorage } =
        useDashboardStorage();

    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardUuid = dashboard?.uuid;
    const dashboardIdentifier = dashboard?.slug ?? routeDashboardIdentifier;
    const { mutate: reopenDraft, isLoading: isReopeningDraft } =
        useReopenDraftMutation(projectUuid);
    const { mutate: rebaseDraft, isLoading: isRebasingDraft } =
        useRebaseDraftMutation(projectUuid);
    const { data: draftStalenessDetails } = useDraftStaleness(
        projectUuid,
        dashboard?.draftStaleness?.draftUuid,
    );

    const dashboardError = useDashboardContext((c) => c.dashboardError);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const dashboardCustomMetrics = useDashboardContext(
        (c) => c.dashboardCustomMetrics,
    );
    const setDashboardCustomMetrics = useDashboardContext(
        (c) => c.setDashboardCustomMetrics,
    );
    const haveCustomMetricsChanged = useDashboardContext(
        (c) => c.haveCustomMetricsChanged,
    );
    const setHaveCustomMetricsChanged = useDashboardContext(
        (c) => c.setHaveCustomMetricsChanged,
    );

    const haveTabsChanged = useDashboardContext((c) => c.haveTabsChanged);
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const setActiveTab = useDashboardContext((c) => c.setActiveTab);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const dateZoomConfig = useDashboardContext((c) => c.dateZoomConfig);
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const isAddFilterDisabled = useDashboardContext(
        (c) => c.isAddFilterDisabled,
    );
    const requiredFiltersNote = useDashboardContext(
        (c) => c.requiredFiltersNote,
    );
    const setRequiredFiltersNote = useDashboardContext(
        (c) => c.setRequiredFiltersNote,
    );
    const areAllChartsLoaded = useDashboardTileStatusContext(
        (c) => c.areAllChartsLoaded,
    );
    const missingRequiredParameters = useDashboardContext(
        (c) => c.missingRequiredParameters,
    );
    const refreshDashboardVersion = useDashboardContext(
        (c) => c.refreshDashboardVersion,
    );

    const isEditMode = useMemo(() => mode === 'edit', [mode]);

    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    const parametersHaveChanged = useDashboardContext(
        (c) => c.parametersHaveChanged,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const clearAllParameters = useDashboardContext((c) => c.clearAllParameters);
    const hasDateZoomDisabledChanged = useMemo(() => {
        return (
            (dashboard?.config?.isDateZoomDisabled || false) !==
            isDateZoomDisabled
        );
    }, [dashboard, isDateZoomDisabled]);
    const hasAddFilterDisabledChanged = useMemo(() => {
        return (
            (dashboard?.config?.isAddFilterDisabled || false) !==
            isAddFilterDisabled
        );
    }, [dashboard, isAddFilterDisabled]);
    const hasRequiredFiltersNoteChanged = useMemo(() => {
        return (
            (dashboard?.config?.requiredFiltersNote || undefined) !==
            (requiredFiltersNote || undefined)
        );
    }, [dashboard, requiredFiltersNote]);
    const oldestCacheTime = useDashboardTileStatusContext(
        (c) => c.oldestCacheTime,
    );
    const preAggregateStatuses = useDashboardTileStatusContext(
        (c) => c.preAggregateStatuses,
    );
    const dashboardParameters = useDashboardContext(
        (c) => c.dashboardParameters,
    );
    const pinnedParameters = useDashboardContext((c) => c.pinnedParameters);
    const toggleParameterPin = useDashboardContext((c) => c.toggleParameterPin);
    const havePinnedParametersChanged = useDashboardContext(
        (c) => c.havePinnedParametersChanged,
    );
    const setHavePinnedParametersChanged = useDashboardContext(
        (c) => c.setHavePinnedParametersChanged,
    );
    const setPinnedParameters = useDashboardContext(
        (c) => c.setPinnedParameters,
    );
    const parameterOrder = useDashboardContext((c) => c.parameterOrder);
    const setParameterOrder = useDashboardContext((c) => c.setParameterOrder);
    const hasParameterOrderChanged = useDashboardContext(
        (c) => c.hasParameterOrderChanged,
    );
    const setHasParameterOrderChanged = useDashboardContext(
        (c) => c.setHasParameterOrderChanged,
    );
    const dateZoomGranularities = useDashboardContext(
        (c) => c.dateZoomGranularities,
    );
    const haveDateZoomGranularitiesChanged = useDashboardContext(
        (c) => c.haveDateZoomGranularitiesChanged,
    );
    const setDateZoomGranularities = useDashboardContext(
        (c) => c.setDateZoomGranularities,
    );
    const setHaveDateZoomGranularitiesChanged = useDashboardContext(
        (c) => c.setHaveDateZoomGranularitiesChanged,
    );
    const defaultDateZoomGranularity = useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    );
    const hasDefaultDateZoomGranularityChanged = useDashboardContext(
        (c) => c.hasDefaultDateZoomGranularityChanged,
    );
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );
    const setHasDefaultDateZoomGranularityChanged = useDashboardContext(
        (c) => c.setHasDefaultDateZoomGranularityChanged,
    );
    const hasDateZoomConfigChanged = useDashboardContext(
        (c) => c.hasDateZoomConfigChanged,
    );
    const setHasDateZoomConfigChanged = useDashboardContext(
        (c) => c.setHasDateZoomConfigChanged,
    );

    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );

    const parameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );

    const referencedParameters = useMemo(() => {
        return Object.fromEntries(
            Object.entries(parameterDefinitions).filter(([key]) =>
                parameterReferences.has(key),
            ),
        );
    }, [parameterDefinitions, parameterReferences]);

    const shadowedReservedNames = useMemo(
        () => getShadowedReservedNames(Object.keys(referencedParameters)),
        [referencedParameters],
    );

    const {
        enabled: isFullScreenFeatureEnabled,
        isFullscreen,
        handleToggleFullscreen,
    } = useNativeFullscreenToggle();
    const { user } = useApp();
    const { showToastError } = useToaster();

    const { data: organization } = useOrganization();
    const hasTemporaryFilters = useMemo(
        () =>
            dashboardTemporaryFilters.dimensions.length > 0 ||
            dashboardTemporaryFilters.metrics.length > 0,
        [dashboardTemporaryFilters],
    );
    // Callback to sync local state with server response after save
    // This is needed when the backend modifies tiles (e.g., duplicating charts during tab duplication)
    const handleDashboardUpdateSuccess = useCallback(
        (updatedDashboard: IDashboard) => {
            setDashboardTiles(updatedDashboard.tiles);
            setDashboardTabs(updatedDashboard.tabs);
        },
        [setDashboardTiles, setDashboardTabs],
    );

    const {
        mutate,
        isSuccess,
        reset,
        isLoading: isSaving,
    } = useUpdateDashboard(
        dashboardUuid,
        projectUuid,
        false,
        handleDashboardUpdateSuccess,
    );

    const { mutateAsync: contentAction, isLoading: isContentActionLoading } =
        useContentAction(projectUuid);

    const [isDeleteModalOpen, deleteModalHandlers] = useDisclosure();
    const [isDuplicateModalOpen, duplicateModalHandlers] = useDisclosure();
    const [isExportDashboardModalOpen, exportDashboardModalHandlers] =
        useDisclosure();
    const [isSaveVerificationModalOpen, saveVerificationModalHandlers] =
        useDisclosure();

    // tabs state
    const [addingTab, setAddingTab] = useState<boolean>(false);

    const tabsEnabled = dashboardTabs && dashboardTabs.length > 0;

    const defaultTab = dashboardTabs?.[0];

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(dashboard?.tiles ?? []);
        setDashboardTabs(dashboard?.tabs ?? []);
        setSavedParameters(dashboard?.parameters ?? {});
    }, [
        isDashboardLoading,
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTabs,
        setSavedParameters,
    ]);

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles === undefined) return;
        if (!dashboardUuid) return;

        clearIsEditingDashboardChart();

        const tilesStorageKey = `unsavedDashboardTiles:${dashboardUuid}`;
        const unsavedDashboardTilesRaw =
            sessionStorage.getItem(tilesStorageKey);
        if (unsavedDashboardTilesRaw) {
            sessionStorage.removeItem(tilesStorageKey);

            try {
                const unsavedDashboardTiles = JSON.parse(
                    unsavedDashboardTilesRaw,
                );
                // If there are unsaved tiles, add them to the dashboard
                setDashboardTiles(unsavedDashboardTiles);

                setHaveTilesChanged(!!unsavedDashboardTiles);
            } catch {
                showToastError({
                    title: 'Error parsing chart',
                    subtitle: 'Unable to save chart in dashboard',
                });
                captureException(
                    `Error parsing chart in dashboard. Attempted to parse: ${unsavedDashboardTilesRaw} `,
                );
            }
        }

        const tabsStorageKey = `dashboardTabs:${dashboardUuid}`;
        const unsavedDashboardTabsRaw = sessionStorage.getItem(tabsStorageKey);

        sessionStorage.removeItem(tabsStorageKey);

        if (unsavedDashboardTabsRaw) {
            try {
                const unsavedDashboardTabs = JSON.parse(
                    unsavedDashboardTabsRaw,
                );
                setDashboardTabs(unsavedDashboardTabs);
                setHaveTabsChanged(!!unsavedDashboardTabs);
            } catch {
                showToastError({
                    title: 'Error parsing tabs',
                    subtitle: 'Unable to save tabs in dashboard',
                });
                captureException(
                    `Error parsing tabs in dashboard. Attempted to parse: ${unsavedDashboardTabsRaw} `,
                );
            }
        }
    }, [
        isDashboardLoading,
        dashboardTiles,
        dashboardUuid,
        activeTab,
        setHaveTilesChanged,
        setDashboardTiles,
        setDashboardTabs,
        setHaveTabsChanged,
        clearIsEditingDashboardChart,
        showToastError,
    ]);

    const [gridWidth, setGridWidth] = useState(0);

    useEffect(() => {
        if (isSuccess) {
            setHaveTilesChanged(false);
            setHaveCustomMetricsChanged(false);
            setHaveFiltersChanged(false);
            setHavePinnedParametersChanged(false);
            setHaveDateZoomGranularitiesChanged(false);
            setHasDefaultDateZoomGranularityChanged(false);
            setHasDateZoomConfigChanged(false);
            // The saved config is the source of truth again
            setRequiredFiltersNote(undefined);
            setDashboardTemporaryFilters({
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            });
            reset();
            if (dashboardTabs.length > 1) {
                void navigate(
                    `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/view/tabs/${activeTab?.uuid}`,
                    { replace: true },
                );
            } else {
                void navigate(
                    `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/view`,
                    { replace: true },
                );
            }
        }
    }, [
        dashboardIdentifier,
        navigate,
        isSuccess,
        projectUrlIdentifier,
        reset,
        setDashboardTemporaryFilters,
        setHaveFiltersChanged,
        setHaveTilesChanged,
        setHaveCustomMetricsChanged,
        setHavePinnedParametersChanged,
        setHaveDateZoomGranularitiesChanged,
        setHasDefaultDateZoomGranularityChanged,
        setHasDateZoomConfigChanged,
        setRequiredFiltersNote,
        dashboardTabs,
        activeTab,
    ]);

    const handleParameterChange = useDashboardContext((c) => c.setParameter);

    const handleUpdateTiles = useCallback(
        async (layout: Layout[]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.map((tile) => {
                    const layoutTile = layout.find(({ i }) => i === tile.uuid);
                    if (
                        layoutTile &&
                        (tile.x !== layoutTile.x ||
                            tile.y !== layoutTile.y ||
                            tile.h !== layoutTile.h ||
                            tile.w !== layoutTile.w)
                    ) {
                        return {
                            ...tile,
                            x: layoutTile.x,
                            y: layoutTile.y,
                            h: layoutTile.h,
                            w: layoutTile.w,
                        };
                    }
                    return tile;
                }),
            );

            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleAddTiles = useCallback(
        async (
            tiles: IDashboard['tiles'][number][],
            // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
            tileUuidMapping?: Record<string, string>,
        ) => {
            let newTiles = tiles;
            if (tabsEnabled) {
                newTiles = tiles.map((tile: DashboardTile) => ({
                    ...tile,
                    tabUuid: activeTab ? activeTab.uuid : defaultTab?.uuid,
                }));
                setHaveTabsChanged(true);
            }
            setDashboardTiles((currentDashboardTiles) =>
                appendNewTilesToBottom(currentDashboardTiles, newTiles),
            );

            setHaveTilesChanged(true);

            // For each duplicated tile, copy the source tile's per-filter
            // override (enabled/disabled + field mapping) onto the new tile's
            // UUID. Without this, the new UUID is absent from `tileTargets`
            // and `getDashboardFilterRulesForTile` falls back to auto-applying
            // every matching filter — ignoring whatever was configured on the
            // original.
            if (tileUuidMapping && Object.keys(tileUuidMapping).length > 0) {
                setDashboardFilters((prev) => {
                    const remapRules = <T extends DashboardFilterRule>(
                        rules: T[],
                    ): T[] =>
                        rules.map((filter) => {
                            if (!filter.tileTargets) return filter;
                            const nextTileTargets = { ...filter.tileTargets };
                            let changed = false;
                            for (const [newUuid, oldUuid] of Object.entries(
                                tileUuidMapping,
                            )) {
                                if (oldUuid in nextTileTargets) {
                                    nextTileTargets[newUuid] =
                                        nextTileTargets[oldUuid];
                                    changed = true;
                                }
                            }
                            return changed
                                ? { ...filter, tileTargets: nextTileTargets }
                                : filter;
                        });
                    return {
                        ...prev,
                        dimensions: remapRules(prev.dimensions),
                        metrics: remapRules(prev.metrics),
                        tableCalculations: remapRules(prev.tableCalculations),
                    };
                });
                setHaveFiltersChanged(true);

                // Mirror the filter remap for date-zoom controls: copy each
                // source tile's target onto its duplicate.
                const mapping = Object.entries(tileUuidMapping).map(
                    ([toTileUuid, fromTileUuid]) => ({
                        fromTileUuid,
                        toTileUuid,
                    }),
                );
                const nextDateZoomConfig = copyDateZoomTileTargets(
                    dateZoomConfig,
                    mapping,
                );
                if (nextDateZoomConfig !== dateZoomConfig) {
                    setDateZoomConfig(nextDateZoomConfig);
                }
            } else if (dashboardTiles) {
                // Tab-aware auto-apply: a filter that already excludes every
                // chart tile on the target tab is scoped away from that tab,
                // so exclude the newly added tiles from it too.
                const scopedFilters = excludeTilesFromTabScopedFilters(
                    dashboardFilters,
                    newTiles,
                    dashboardTiles,
                );
                if (scopedFilters !== dashboardFilters) {
                    setDashboardFilters(() => scopedFilters);
                    setHaveFiltersChanged(true);
                }
            }
        },
        [
            activeTab,
            defaultTab,
            tabsEnabled,
            setDashboardTiles,
            setHaveTilesChanged,
            setHaveTabsChanged,
            dashboardFilters,
            dashboardTiles,
            setDashboardFilters,
            setHaveFiltersChanged,
            dateZoomConfig,
            setDateZoomConfig,
        ],
    );

    const handleDeleteTile = useCallback(
        async (tile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.filter(
                    (filteredTile) => filteredTile.uuid !== tile.uuid,
                ),
            );

            setHaveTilesChanged(true);

            // Drop the deleted tile's date-zoom target and prune any control
            // left with no charts, so deleting the last attached tile doesn't
            // leave a dangling control behind.
            const nextDateZoomConfig = removeDateZoomTileTargets(
                dateZoomConfig,
                [tile.uuid],
            );
            if (nextDateZoomConfig !== dateZoomConfig) {
                setDateZoomConfig(nextDateZoomConfig);
            }
        },
        [
            setDashboardTiles,
            setHaveTilesChanged,
            dateZoomConfig,
            setDateZoomConfig,
        ],
    );

    const handleBatchDeleteTiles = (
        tilesToDelete: IDashboard['tiles'][number][],
    ) => {
        setDashboardTiles((currentDashboardTiles) =>
            currentDashboardTiles?.filter(
                (tile) => !tilesToDelete.includes(tile),
            ),
        );
        setHaveTilesChanged(true);

        const nextDateZoomConfig = removeDateZoomTileTargets(
            dateZoomConfig,
            tilesToDelete.map((tile) => tile.uuid),
        );
        if (nextDateZoomConfig !== dateZoomConfig) {
            setDateZoomConfig(nextDateZoomConfig);
        }
    };

    const handleEditTiles = useCallback(
        (updatedTile: IDashboard['tiles'][number]) => {
            setDashboardTiles((currentDashboardTiles) =>
                currentDashboardTiles?.map((tile) =>
                    tile.uuid === updatedTile.uuid ? updatedTile : tile,
                ),
            );
            setHaveTilesChanged(true);
        },
        [setDashboardTiles, setHaveTilesChanged],
    );

    const handleCancel = useCallback(() => {
        if (!dashboard) return;

        sessionStorage.clear();

        setDashboardTiles(dashboard.tiles);
        setHaveTilesChanged(false);
        setDashboardCustomMetrics(dashboard.config?.customMetrics ?? []);
        setHaveCustomMetricsChanged(false);
        setDashboardFilters(dashboard.filters);
        setHaveFiltersChanged(false);
        setHaveTabsChanged(false);
        setDashboardTabs(dashboard.tabs);
        setSavedParameters(dashboard.parameters ?? {});
        setPinnedParameters(dashboard.config?.pinnedParameters ?? []);
        setHavePinnedParametersChanged(false);
        setHasParameterOrderChanged(false);
        setDateZoomGranularities(
            dashboard.config?.dateZoomGranularities ??
                Object.values(DateGranularity),
        );
        setHaveDateZoomGranularitiesChanged(false);
        setDefaultDateZoomGranularity(
            dashboard.config?.defaultDateZoomGranularity,
        );
        setHasDefaultDateZoomGranularityChanged(false);
        setDateZoomConfig(normalizeDateZoomConfig(dashboard.config));
        setHasDateZoomConfigChanged(false);
        setRequiredFiltersNote(undefined);

        if (dashboardTabs.length > 0) {
            void navigate(
                `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/view/tabs/${activeTab?.uuid}`,
                { replace: true },
            );
        } else {
            void navigate(
                `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/view`,
                { replace: true },
            );
        }
    }, [
        dashboard,
        dashboardIdentifier,
        navigate,
        projectUrlIdentifier,
        setDashboardTiles,
        setHaveFiltersChanged,
        setDashboardFilters,
        setHaveTilesChanged,
        setDashboardCustomMetrics,
        setHaveCustomMetricsChanged,
        setHaveTabsChanged,
        setDashboardTabs,
        dashboardTabs,
        activeTab,
        setSavedParameters,
        setPinnedParameters,
        setHavePinnedParametersChanged,
        setDateZoomGranularities,
        setHaveDateZoomGranularitiesChanged,
        setDefaultDateZoomGranularity,
        setHasDefaultDateZoomGranularityChanged,
        setDateZoomConfig,
        setHasDateZoomConfigChanged,
        setHasParameterOrderChanged,
        setRequiredFiltersNote,
    ]);

    const handleMoveDashboardToSpace = useCallback(
        async (spaceUuid: string) => {
            if (!dashboard) return;

            await contentAction({
                action: {
                    type: 'move',
                    targetSpaceUuid: spaceUuid,
                },
                item: {
                    uuid: dashboard.uuid,
                    contentType: ContentType.DASHBOARD,
                },
            });
        },
        [dashboard, contentAction],
    );

    useEffect(() => {
        const checkReload = (event: BeforeUnloadEvent) => {
            if (
                isEditMode &&
                (haveTilesChanged ||
                    haveFiltersChanged ||
                    haveCustomMetricsChanged)
            ) {
                const message =
                    'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?';
                event.returnValue = message;
                return message;
            }
        };
        window.addEventListener('beforeunload', checkReload);
        return () => window.removeEventListener('beforeunload', checkReload);
    }, [
        haveTilesChanged,
        haveFiltersChanged,
        haveCustomMetricsChanged,
        isEditMode,
    ]);

    // Block navigating away if there are unsaved changes
    const blocker = useBlocker(({ nextLocation }) => {
        if (
            isEditMode &&
            (haveTilesChanged ||
                haveFiltersChanged ||
                haveTabsChanged ||
                haveCustomMetricsChanged) &&
            // A URL may carry either the uuid or the slug for both the project
            // and the dashboard, so accept any combination — but compare whole
            // segments, and require the project to match too: dashboard slugs
            // are only unique within a project.
            !isSameDashboardRoute({
                location: nextLocation,
                projectUuid,
                projectSlug: projectUrlIdentifier,
                dashboardUuid,
                dashboardSlug: dashboardIdentifier,
            }) &&
            // Allow user to add a new table
            !sessionStorage.getItem(`unsavedDashboardTiles:${dashboardUuid}`)
        ) {
            return true; //blocks navigation
        }
        return false; // allow navigation
    });

    const handleEnterEditMode = useCallback(async () => {
        resetDashboardFilters();

        await refreshDashboardVersion();

        // Defer the redirect
        void Promise.resolve().then(() => {
            return navigate(
                {
                    pathname:
                        dashboardTabs.length > 0
                            ? `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/edit/tabs/${activeTab?.uuid}`
                            : `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/edit`,
                    search: '',
                },
                { replace: true },
            );
        });
    }, [
        projectUrlIdentifier,
        dashboardIdentifier,
        resetDashboardFilters,
        refreshDashboardVersion,
        navigate,
        activeTab?.uuid,
        dashboardTabs.length,
    ]);

    const hasTilesThatSupportFilters = useDashboardContext(
        (c) => c.hasTilesThatSupportFilters,
    );

    const dashboardCustomMetricsFlag = useServerFeatureFlag(
        FeatureFlags.DashboardCustomMetrics,
    );
    const isDashboardCustomMetricsEnabled =
        dashboardCustomMetricsFlag.data?.enabled === true;
    const [isNewChartOpen, setIsNewChartOpen] = useState(false);
    const [chartToEdit, setChartToEdit] = useState<SavedChart | undefined>();

    const queryClient = useQueryClient();
    const { track } = useTracking();
    const handleRegistryMetricEdited = useCallback(
        (metric: AdditionalMetric) => {
            // Server already persisted the swap; mirror it into the staged
            // registry without clobbering other staged additions.
            setDashboardCustomMetrics((current) =>
                current.map((entry) =>
                    getItemId(entry) === getItemId(metric) ? metric : entry,
                ),
            );
            // Affected charts got new versions; refetch so tiles pick them up.
            void queryClient.invalidateQueries(['saved_query']);
            void queryClient.invalidateQueries(['dashboard_chart_ready_query']);
            // And refresh the dashboard itself: a later save builds its config
            // from the cached dashboard, which now holds a stale registry.
            void queryClient.invalidateQueries(['saved_dashboard_query']);
        },
        [setDashboardCustomMetrics, queryClient],
    );

    const handleOpenNewChart = useCallback(() => {
        setIsNewChartOpen(true);
    }, []);

    const handleChartEditorSaved = useCallback(
        (chart: SavedChart) => {
            // Only the in-dashboard builder contributes to the registry.
            const previousRegistryIds = new Set(
                dashboardCustomMetrics.map(getItemId),
            );
            const mergedCustomMetrics = mergeDashboardCustomMetrics(
                dashboardCustomMetrics,
                chart.metricQuery.additionalMetrics ?? [],
            );
            if (mergedCustomMetrics !== dashboardCustomMetrics) {
                setDashboardCustomMetrics(mergedCustomMetrics);
                setHaveCustomMetricsChanged(true);
            }

            if (dashboardUuid) {
                const workbookEventProperties = {
                    projectUuid,
                    dashboardUuid,
                    exploreName: chart.tableName,
                    registrySize: mergedCustomMetrics.length,
                    // Distinct base tables — the closest explore proxy we hold
                    distinctExploreCount: new Set(
                        mergedCustomMetrics.map((metric) => metric.table),
                    ).size,
                };
                mergedCustomMetrics.forEach((metric) => {
                    if (!previousRegistryIds.has(getItemId(metric))) {
                        track({
                            name: EventName.DASHBOARD_CUSTOM_METRIC_CREATED,
                            properties: workbookEventProperties,
                        });
                    }
                });
                // Selected metrics that were already shared = duplication avoided
                (chart.metricQuery.metrics ?? []).forEach((metricId) => {
                    if (previousRegistryIds.has(metricId)) {
                        track({
                            name: EventName.DASHBOARD_CUSTOM_METRIC_REUSED,
                            properties: workbookEventProperties,
                        });
                    }
                });
                track({
                    name:
                        chart.uuid !== chartToEdit?.uuid
                            ? EventName.DASHBOARD_CHART_CREATED_IN_PLACE
                            : EventName.DASHBOARD_CHART_EDITED_IN_PLACE,
                    properties: workbookEventProperties,
                });
            }

            // New uuid means a brand-new chart; an existing tile refreshes
            // itself via the update mutation's query cache reset.
            if (chart.uuid !== chartToEdit?.uuid) {
                void handleAddTiles([
                    {
                        uuid: uuid4(),
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: {
                            // Created against this dashboard, so the tile owns it.
                            belongsToDashboard: true,
                            savedChartUuid: chart.uuid,
                            chartName: chart.name,
                            hideTitle:
                                chart.chartConfig.type === ChartType.BIG_NUMBER
                                    ? true
                                    : undefined,
                        },
                        tabUuid: activeTab?.uuid,
                        ...getDefaultChartTileSize(chart.chartConfig.type),
                    },
                ]);
            }
            setChartToEdit(undefined);
            setIsNewChartOpen(false);
        },
        [
            chartToEdit,
            handleAddTiles,
            activeTab?.uuid,
            dashboardCustomMetrics,
            setDashboardCustomMetrics,
            setHaveCustomMetricsChanged,
            dashboardUuid,
            projectUuid,
            track,
        ],
    );

    if (isDashboardLoading) {
        return <PageSpinner />;
    }

    if (dashboardError) {
        return <ErrorState error={dashboardError.error} />;
    }

    if (!dashboard) {
        return (
            <ErrorState
                error={{
                    name: 'NotExistsError',
                    statusCode: 404,
                    message: 'Dashboard not found',
                    data: {},
                }}
            />
        );
    }

    const canManageContentVerification =
        user.data?.ability?.can(
            'manage',
            subject('ContentVerification', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) === true;

    const isOwnVerification =
        dashboard?.verification?.verifiedBy.userUuid === user.data?.userUuid;

    const canPreserveVerification =
        canManageContentVerification || isOwnVerification;

    const shouldShowVerificationSaveOptions = !!dashboard?.verification;

    const handleSaveDashboard = (preserveVerification?: boolean) => {
        const dimensionFilters = [
            ...dashboardFilters.dimensions,
            ...dashboardTemporaryFilters.dimensions,
        ];
        // Reset value for required filter on save dashboard
        const requiredFiltersWithoutValues = dimensionFilters.map((filter) => {
            if (filter.required || filter.requiredGroupId) {
                return {
                    ...filter,
                    disabled: true,
                    values: [],
                };
            }
            return filter;
        });

        const dashboardUpdate: UpdateDashboard = {
            tiles: dashboardTiles,
            filters: {
                dimensions: requiredFiltersWithoutValues,
                metrics: [
                    ...dashboardFilters.metrics,
                    ...dashboardTemporaryFilters.metrics,
                ],
                tableCalculations: [
                    ...dashboardFilters.tableCalculations,
                    ...dashboardTemporaryFilters.tableCalculations,
                ],
            },
            name: dashboard.name,
            tabs: dashboardTabs,
            config: buildDashboardConfig({
                existingConfig: dashboard.config,
                isDateZoomDisabled,
                isAddFilterDisabled,
                pinnedParameters,
                parameterOrder,
                hasParameterOrderChanged,
                dateZoomGranularities,
                haveDateZoomGranularitiesChanged,
                defaultDateZoomGranularity,
                hasDefaultDateZoomGranularityChanged,
                dateZoomConfig,
                hasDateZoomConfigChanged,
                requiredFiltersNote,
                stagedCustomMetrics: haveCustomMetricsChanged
                    ? dashboardCustomMetrics
                    : undefined,
            }),
            parameters: dashboardParameters,
            ...(preserveVerification !== undefined
                ? { preserveVerification }
                : {}),
        };

        mutate(dashboardUpdate);
    };

    const dashboardHeaderProps = {
        dashboard,
        organizationUuid: organization?.organizationUuid,
        isEditMode,
        isSaving,
        oldestCacheTime,
        preAggregateStatuses,
        allTilesLoaded: areAllChartsLoaded,
        isFullscreen,
        activeTabUuid: activeTab?.uuid,
        dashboardTabs,
        dashboardTiles,
        isFullScreenFeatureEnabled,
        onToggleFullscreen: handleToggleFullscreen,
        hasDashboardChanged:
            haveTilesChanged ||
            haveCustomMetricsChanged ||
            haveFiltersChanged ||
            hasTemporaryFilters ||
            haveTabsChanged ||
            hasDateZoomDisabledChanged ||
            hasAddFilterDisabledChanged ||
            hasRequiredFiltersNoteChanged ||
            parametersHaveChanged ||
            havePinnedParametersChanged ||
            hasParameterOrderChanged ||
            haveDateZoomGranularitiesChanged ||
            hasDefaultDateZoomGranularityChanged ||
            hasDateZoomConfigChanged,
        onAddTiles: handleAddTiles,
        onNewChart:
            isDashboardCustomMetricsEnabled && isEditMode
                ? handleOpenNewChart
                : undefined,
        onSaveDashboard: () => {
            if (shouldShowVerificationSaveOptions) {
                saveVerificationModalHandlers.open();
                return;
            }
            handleSaveDashboard();
        },
        onCancel: handleCancel,
        onMoveToSpace: handleMoveDashboardToSpace,
        isMovingDashboardToSpace: isContentActionLoading,
        onDuplicate: duplicateModalHandlers.open,
        onDelete: deleteModalHandlers.open,
        onExport: exportDashboardModalHandlers.open,
        setAddingTab,
        onSwitchTab: setActiveTab,
        onEditClicked: handleEnterEditMode,
        ...(isEditMode && { className: styles.stickyHeader }),
    };

    return (
        <>
            {blocker.state === 'blocked' && (
                <MantineModal
                    opened
                    onClose={() => {
                        blocker.reset();
                    }}
                    role="alertdialog"
                    title="Unsaved changes"
                    icon={IconAlertCircle}
                    cancelLabel="Stay"
                    actions={
                        <Button
                            color="red"
                            onClick={() => {
                                clearDashboardStorage();
                                blocker.proceed();
                            }}
                        >
                            Leave
                        </Button>
                    }
                >
                    <Text fw={500}>
                        You have unsaved changes to your dashboard! Are you sure
                        you want to leave without saving?
                    </Text>
                </MantineModal>
            )}

            <MantineModal
                opened={isSaveVerificationModalOpen}
                onClose={saveVerificationModalHandlers.close}
                title="Save verified dashboard"
            >
                {canPreserveVerification ? (
                    <>
                        <Text mb="md">
                            Keep this dashboard verified after saving?
                        </Text>
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                loading={isSaving}
                                onClick={() => {
                                    saveVerificationModalHandlers.close();
                                    handleSaveDashboard(false);
                                }}
                            >
                                Save
                            </Button>
                            <Button
                                color="green.7"
                                leftSection={
                                    <IconCircleCheckFilled size={16} />
                                }
                                loading={isSaving}
                                onClick={() => {
                                    saveVerificationModalHandlers.close();
                                    handleSaveDashboard(true);
                                }}
                            >
                                Save & verify
                            </Button>
                        </Group>
                    </>
                ) : (
                    <>
                        <Text mb="md">
                            This dashboard is verified. Saving your changes will
                            remove its verified status until someone verifies it
                            again.
                        </Text>
                        <Group justify="flex-end">
                            <Button
                                variant="default"
                                onClick={saveVerificationModalHandlers.close}
                            >
                                Cancel
                            </Button>
                            <Button
                                loading={isSaving}
                                onClick={() => {
                                    saveVerificationModalHandlers.close();
                                    handleSaveDashboard(false);
                                }}
                            >
                                Save anyway
                            </Button>
                        </Group>
                    </>
                )}
            </MantineModal>

            <Page
                title={dashboard.name}
                noContentPadding
                withFullHeight
                fullPageScroll
            >
                <div>
                    <DashboardHeader {...dashboardHeaderProps} />

                    {isDashboardCustomMetricsEnabled && dashboard.uuid ? (
                        <DashboardChartEditorModal
                            opened={isNewChartOpen || chartToEdit !== undefined}
                            dashboardUuid={dashboard.uuid}
                            dashboardName={dashboard.name}
                            editChart={chartToEdit}
                            onChartSaved={handleChartEditorSaved}
                            onRegistryMetricEdited={handleRegistryMetricEdited}
                            onClose={() => {
                                setIsNewChartOpen(false);
                                setChartToEdit(undefined);
                            }}
                        />
                    ) : null}

                    {dashboard.draftOverlayError ? (
                        <DraftOverlayFailureAlert
                            error={dashboard.draftOverlayError}
                        />
                    ) : null}

                    {dashboard.dismissedDraftUuid ? (
                        <DismissedDraftAlert
                            isReopening={isReopeningDraft}
                            onReopen={() =>
                                reopenDraft(dashboard.dismissedDraftUuid!)
                            }
                        />
                    ) : null}

                    {dashboard.draftStaleness ? (
                        <DraftStaleAlert
                            contentLabel="dashboard"
                            staleness={dashboard.draftStaleness}
                            details={draftStalenessDetails}
                            isUpdating={isRebasingDraft}
                            onUpdate={(resolutions) =>
                                rebaseDraft({
                                    draftUuid:
                                        dashboard.draftStaleness!.draftUuid,
                                    resolutions,
                                })
                            }
                        />
                    ) : null}

                    {/* Coordinates filter chip / rules popovers across the dashboard */}
                    <DashboardChartEditContext.Provider
                        value={
                            isDashboardCustomMetricsEnabled
                                ? setChartToEdit
                                : undefined
                        }
                    >
                        <FilterBarPopoversProvider>
                            <DashboardTabs
                                isEditMode={isEditMode}
                                hasTilesThatSupportFilters={
                                    hasTilesThatSupportFilters
                                }
                                // parameters
                                shadowedReservedNames={shadowedReservedNames}
                                parameterValues={parameterValues}
                                onParameterChange={handleParameterChange}
                                onParameterClearAll={clearAllParameters}
                                isParameterLoading={!areAllChartsLoaded}
                                missingRequiredParameters={
                                    missingRequiredParameters
                                }
                                pinnedParameters={pinnedParameters}
                                onParameterPin={toggleParameterPin}
                                parameterOrder={parameterOrder}
                                onParameterReorder={setParameterOrder}
                                // tabs
                                activeTab={activeTab}
                                addingTab={addingTab}
                                dashboardTiles={dashboardTiles}
                                handleAddTiles={handleAddTiles}
                                handleUpdateTiles={handleUpdateTiles}
                                handleDeleteTile={handleDeleteTile}
                                handleBatchDeleteTiles={handleBatchDeleteTiles}
                                handleEditTile={handleEditTiles}
                                setGridWidth={setGridWidth}
                                setAddingTab={setAddingTab}
                                onNewChart={
                                    isDashboardCustomMetricsEnabled &&
                                    isEditMode
                                        ? handleOpenNewChart
                                        : undefined
                                }
                            />
                        </FilterBarPopoversProvider>
                    </DashboardChartEditContext.Provider>
                </div>
                {isDeleteModalOpen && (
                    <DashboardDeleteModal
                        opened
                        uuid={dashboard.uuid}
                        onClose={deleteModalHandlers.close}
                        onConfirm={() => {
                            void navigate(
                                `/projects/${projectUrlIdentifier}/dashboards`,
                                {
                                    replace: true,
                                },
                            );
                        }}
                    />
                )}
                {isExportDashboardModalOpen && (
                    <DashboardExportModal
                        opened={isExportDashboardModalOpen}
                        onClose={exportDashboardModalHandlers.close}
                        dashboard={dashboard}
                        gridWidth={gridWidth}
                    />
                )}
                {isDuplicateModalOpen && (
                    <DashboardDuplicateModal
                        opened={isDuplicateModalOpen}
                        uuid={dashboard.uuid}
                        onClose={duplicateModalHandlers.close}
                        onConfirm={duplicateModalHandlers.close}
                    />
                )}
            </Page>
        </>
    );
};

const DashboardPage: FC = () => {
    const projectUuid = useProjectUuid();
    const { dashboardUuid } = useParams<{
        dashboardUuid: string;
    }>();
    const { user } = useApp();
    const dashboardCommentsCheck = useDashboardCommentsCheck(user?.data);

    return (
        <DashboardProvider
            key={dashboardUuid}
            projectUuid={projectUuid}
            dashboardCommentsCheck={dashboardCommentsCheck}
            includeUnpublishedDraft
        >
            <SentryErrorBoundary fallback={() => <></>}>
                <DashboardAiAgentContextBridge />
            </SentryErrorBoundary>
            <Dashboard />
        </DashboardProvider>
    );
};

export default DashboardPage;
