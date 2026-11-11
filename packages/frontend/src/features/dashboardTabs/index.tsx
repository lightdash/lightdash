import {
    assertUnreachable,
    copyDateZoomTileTargets,
    FeatureFlags,
    getDefaultStartOfWeek,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type Dashboard as IDashboard,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Button, Flex, Group, Tabs, Tooltip } from '@mantine/core';
import { useMergedRef } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import clsx from 'clsx';
import { cloneDeep } from 'es-toolkit/compat';
import { produce } from 'immer';
import {
    Activity,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
    type FC,
} from 'react';
import { type ItemCallback, type Layout } from 'react-grid-layout';
import { useLocation, useNavigate, useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import {
    DASHBOARD_HEADER_HEIGHT,
    SCROLL_TO_TOP_BOTTOM,
    SCROLL_TO_TOP_BOTTOM_WITH_LAUNCHER,
} from '../../components/common/Dashboard/dashboard.constants';
import MantineIcon from '../../components/common/MantineIcon';
import { ScrollToTop } from '../../components/common/ScrollToTop';
import { SortableList } from '../../components/common/Sortable/Sortable';
import { StickyWithDetection } from '../../components/common/StickyWithDetection';
import EmptyStateNoTiles from '../../components/DashboardTiles/EmptyStateNoTiles';
import { useIsLauncherMounted } from '../../ee/features/aiCopilot/components/Launcher/useIsLauncherMounted';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useActiveTabParameters } from '../../hooks/dashboard/useActiveTabParameters';
import { useHighlightedTile } from '../../hooks/dashboard/useTileLink';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import { useProjectUrlIdentifier } from '../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { TrackSection } from '../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../types/Events';
import {
    selectCanvasZoom,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDateZoomGranularity,
    selectIsDateZoomDisabled,
    useDashboardDateZoomConfig,
    useDashboardSelector,
    useDashboardTemporaryFilters,
    useDashboardUnmetFilterRequirements,
} from '../dashboard/store';
import { ControlsBar } from '../dashboardControls/ControlsBar';
import { useParameterBarControls } from '../dashboardControls/useParameterBarControls';
import { useParameterEditorSelector } from '../dashboardControls/useParameterEditor';
import addFilterClasses from '../dashboardFilters/AddFilterButton.module.css';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { DashboardFiltersBarSummary } from '../dashboardFilters/DashboardFiltersBarSummary';
import { type EditFiltersVisibility } from '../dashboardFilters/EditFiltersVisibilityControl';
import { doesFilterApplyToTile } from '../dashboardFilters/FilterConfiguration/utils';
import GuidedFilterSetupOverlay from '../dashboardFilters/FilterRequirements/GuidedFilterSetupOverlay';
import { getDateZoomSummaryLabel } from '../dateZoom/utils';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';
import { AddTabModal } from './AddTabModal';
import { TabDeleteModal } from './DeleteTabModal';
import DuplicateTabModal from './DuplicateTabModal';
import { TabEditModal } from './EditTabModal';
import GridTile from './GridTile';
import {
    convertLayoutToBaseCoordinates,
    hasGridItemMoved,
    pinGridItem,
    resolveDropOverlaps,
    unpinGridItem,
    DEFAULT_ROW_HEIGHT,
    EDIT_ACTION_BAR_CLEARANCE,
    FINE_GRID_SCALE,
    FIT_TO_SCREEN_GRID_BOTTOM_PADDING,
    getDashboardLayouts,
    type DashboardLayouts,
    getResponsiveGridLayoutProps,
    getRowHeightForScale,
} from './gridUtils';
import { ResponsiveGridLayout } from './ResponsiveGridLayout';
import DraggableTab from './Tab';
import styles from './tabs.module.css';
import { getDashboardTabPath, getDashboardUrlIdentifier } from './tabUrl';
import { useAutoScrollOnDrag } from './useAutoScrollOnDrag';
import { useGridStyles } from './useGridStyles';

const EMPTY_LAYOUTS: DashboardLayouts = {
    lg: [],
    md: [],
    sm: [],
    xs: [],
};

// Unset outside edit mode, where the grid is never zoomed
type DashboardGridProps = ReturnType<typeof getResponsiveGridLayoutProps> & {
    transformScale: number | undefined;
    allowOverlap: boolean;
};

const DASHBOARD_GRID_BOTTOM_PADDING = 60;

type TabGridPanelProps = {
    tabUuid: string;
    tiles: DashboardTile[];
    layouts: DashboardLayouts;
    isActive: boolean;
    isEditMode: boolean;
    locked: boolean;
    gridProps: DashboardGridProps;
    dashboardTabs: DashboardTab[];
    onDragStart: ItemCallback;
    onDragStop: ItemCallback;
    onResizeStart: ItemCallback;
    onResizeStop: ItemCallback;
    onWidthChange: (width: number) => void;
    onDeleteTile: (tile: IDashboard['tiles'][number]) => Promise<void>;
    onEditTile: (tile: IDashboard['tiles'][number]) => void;
    onAddTiles: (
        tiles: IDashboard['tiles'][number][],
        // Map of new tile UUID → source tile UUID, so dashboard filter `tileTargets` are copied from the source.
        tileUuidMapping?: Record<string, string>,
    ) => Promise<void>;
};

/**
 * Memoized per-tab grid panel. Prevents hidden (inactive) tabs from
 * re-rendering when tiles on the active tab are dragged or resized.
 *
 * The custom comparator skips re-renders for inactive tabs unless
 * their tile set structurally changes (tiles added/removed/swapped).
 */
const TabGridPanel = memo<TabGridPanelProps>(
    ({
        tabUuid,
        tiles,
        layouts,
        isActive,
        isEditMode,
        locked,
        gridProps,
        dashboardTabs,
        onDragStart,
        onDragStop,
        onResizeStart,
        onResizeStop,
        onWidthChange,
        onDeleteTile,
        onEditTile,
        onAddTiles,
    }) => {
        return (
            <div
                key={tabUuid}
                data-tab-uuid={tabUuid}
                className={isActive ? styles.tabPane : styles.tabPaneHidden}
            >
                <ErrorBoundary>
                    <ResponsiveGridLayout
                        // react-grid-layout keeps its old layout when only the column
                        // count changes, so a new grid resolution needs a new grid
                        key={gridProps.cols.lg}
                        {...gridProps}
                        onDragStart={onDragStart}
                        onDragStop={onDragStop}
                        onResizeStart={onResizeStart}
                        onResizeStop={onResizeStop}
                        onWidthChange={onWidthChange}
                        layouts={layouts}
                    >
                        {tiles.map((tile) => (
                            <div key={tile.uuid} data-tile-uuid={tile.uuid}>
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    <GridTile
                                        locked={locked}
                                        isEditMode={isEditMode}
                                        tile={tile}
                                        onDelete={onDeleteTile}
                                        onEdit={onEditTile}
                                        tabs={dashboardTabs}
                                        onAddTiles={onAddTiles}
                                    />
                                </TrackSection>
                            </div>
                        ))}
                    </ResponsiveGridLayout>
                </ErrorBoundary>
            </div>
        );
    },
    (prevProps, nextProps) => {
        // Re-render when becoming active/inactive (visibility toggle)
        if (prevProps.isActive !== nextProps.isActive) return false;
        if (prevProps.isEditMode !== nextProps.isEditMode) return false;
        if (prevProps.locked !== nextProps.locked) return false;
        if (prevProps.tiles.length !== nextProps.tiles.length) return false;

        // Check if tile identities changed (added/removed/reordered)
        for (let i = 0; i < prevProps.tiles.length; i++) {
            if (prevProps.tiles[i].uuid !== nextProps.tiles[i].uuid)
                return false;
        }

        // For the active tab during drag/resize, layouts change frequently.
        // Re-render only when layouts reference changes.
        if (nextProps.isActive && prevProps.layouts !== nextProps.layouts)
            return false;
        if (nextProps.isActive && prevProps.gridProps !== nextProps.gridProps)
            return false;
        // Drop handlers close over the grid scale
        if (
            nextProps.isActive &&
            (prevProps.onDragStop !== nextProps.onDragStop ||
                prevProps.onResizeStop !== nextProps.onResizeStop)
        )
            return false;

        // No meaningful changes — skip re-render
        return true;
    },
);

type DashboardTabsProps = {
    isEditMode: boolean;
    // 'all' outside edit mode
    editFiltersVisibility: EditFiltersVisibility;
    onEditFiltersVisibilityChange: (value: EditFiltersVisibility) => void;
    addingTab: boolean;
    dashboardTiles: DashboardTile[] | undefined;
    activeTab: DashboardTab | undefined;
    handleAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
    handleUpdateTiles: (layout: Layout[]) => Promise<void>;
    handleDeleteTile: (tile: IDashboard['tiles'][number]) => Promise<void>;
    handleBatchDeleteTiles: (tile: IDashboard['tiles'][number][]) => void;
    handleEditTile: (tiles: IDashboard['tiles'][number]) => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    setGridWidth: (value: React.SetStateAction<number>) => void;
    onNewChart?: () => void;

    // fit to screen: the computed row height, null when not fitting
    fitToScreenRowHeight: number | null;
    // the grid springs between fitted and natural while true
    isFitToScreenSnapping: boolean;
    gridContainerRef: (element: HTMLDivElement | null) => void;

    // parameters
    hasTilesThatSupportFilters: boolean;
    parameterValues: ParametersValuesMap;
    shadowedReservedNames: string[];
    isParameterLoading: boolean;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onParameterClearAll: () => void;
    onParameterPin: (parameterKey: string) => void;
    parameterOrder: string[];
    onParameterReorder: (order: string[]) => void;
};

const DashboardTabs: FC<DashboardTabsProps> = ({
    isEditMode,
    editFiltersVisibility,
    onEditFiltersVisibilityChange,
    addingTab,
    dashboardTiles,
    activeTab,
    handleAddTiles,
    handleUpdateTiles,
    handleDeleteTile,
    handleBatchDeleteTiles,
    handleEditTile,
    setGridWidth,
    setAddingTab,
    onNewChart,
    fitToScreenRowHeight,
    isFitToScreenSnapping,
    gridContainerRef,
    // parameters
    hasTilesThatSupportFilters,
    parameterValues,
    shadowedReservedNames,
    isParameterLoading,
    missingRequiredParameters,
    pinnedParameters,
    onParameterChange,
    onParameterClearAll,
    onParameterPin,
    parameterOrder,
    onParameterReorder,
}) => {
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const mergedGridWrapperRef = useMergedRef(gridWrapperRef, gridContainerRef);
    const { showToastError } = useToaster();
    const { health } = useApp();
    const [, startTabTransition] = useTransition();

    const { data: dashboardTabsInMemoryFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardTabsInMemory,
    );
    const keepTabsInMemory = dashboardTabsInMemoryFlag?.enabled ?? false;

    const { data: dashboardControlsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardControls,
    );
    const isDashboardControlsEnabled = dashboardControlsFlag?.enabled === true;
    const { data: editErgonomicsFlag } = useServerFeatureFlag(
        FeatureFlags.DashboardEditErgonomics,
    );
    // Editing gets a grid twice as fine; stored positions stay in base units
    const isEditErgonomicsEnabled =
        isEditMode && editErgonomicsFlag?.enabled === true;
    const gridScale = isEditErgonomicsEnabled ? FINE_GRID_SCALE : 1;
    const FiltersBar = isDashboardControlsEnabled
        ? ControlsBar
        : DashboardFiltersBar;

    const [isInteracting, setIsInteracting] = useState(false);

    const showGridLines = isEditMode && isInteracting;

    const handleUpdateTilesWithScaling = useCallback(
        async (layout: Layout[]) => {
            const unscaledLayout = convertLayoutToBaseCoordinates(
                layout,
                gridScale,
            );
            await handleUpdateTiles(unscaledLayout);
        },
        [gridScale, handleUpdateTiles],
    );

    const { start: startAutoScroll, stop: stopAutoScroll } =
        useAutoScrollOnDrag();

    const handleInteractionStart = useCallback<ItemCallback>(
        (_layout, _before, _after, _placeholder, _event, node) => {
            if (isEditErgonomicsEnabled) pinGridItem(node);
            setIsInteracting(true);
            startAutoScroll();
        },
        [startAutoScroll, isEditErgonomicsEnabled],
    );
    // The grid reports its whole layout on every stop, with stored overlaps
    // pushed apart, so a click that moved nothing must not apply it
    const handleInteractionStop = useCallback<ItemCallback>(
        (layout, before, after, _placeholder, _event, node) => {
            unpinGridItem(node);
            stopAutoScroll();
            setIsInteracting(false);
            if (hasGridItemMoved(before, after)) {
                void handleUpdateTilesWithScaling(
                    isEditErgonomicsEnabled
                        ? resolveDropOverlaps(layout, after.i)
                        : layout,
                );
            }
        },
        [handleUpdateTilesWithScaling, stopAutoScroll, isEditErgonomicsEnabled],
    );
    const handleWidthChange = useCallback(
        (cw: number) => setGridWidth(cw),
        [setGridWidth],
    );

    const { search } = useLocation();
    const navigate = useNavigate();
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardUuid = dashboard?.uuid;
    const { dashboardUuid: routeDashboardUuidOrSlug } = useParams<{
        dashboardUuid: string;
    }>();
    const dashboardIdentifier = getDashboardUrlIdentifier({
        routeDashboardUuidOrSlug,
        dashboardSlug: dashboard?.slug,
    });
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const projectUrlIdentifier = useProjectUrlIdentifier();
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dateZoomConfig = useDashboardDateZoomConfig();
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const unmetFilterRequirements = useDashboardUnmetFilterRequirements();
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isDateZoomDisabled = useDashboardSelector(selectIsDateZoomDisabled);
    const getUiString = useUiStrings();
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const dashboardTemporaryFilters = useDashboardTemporaryFilters();

    // filters bar state
    const [isFiltersCollapsed, setIsFiltersCollapsed] =
        useState<boolean>(false);

    const isFiltersSummaryShown = isEditMode
        ? editFiltersVisibility === 'summary'
        : isFiltersCollapsed;

    const [isHeaderStuck, setIsHeaderStuck] = useState<boolean>(false);

    const isLauncherMounted = useIsLauncherMounted(projectUuid);
    const scrollToTopBottom = isLauncherMounted
        ? SCROLL_TO_TOP_BOTTOM_WITH_LAUNCHER
        : SCROLL_TO_TOP_BOTTOM;

    // tabs state
    const [isEditingTab, setEditingTab] = useState<boolean>(false);
    const [isDeletingTab, setDeletingTab] = useState<boolean>(false);
    const [isDuplicatingTab, setDuplicatingTab] = useState<boolean>(false);
    const [tabToDuplicate, setTabToDuplicate] = useState<DashboardTab | null>(
        null,
    );

    const defaultTab = dashboardTabs?.[0];
    // In view mode, hidden tabs are excluded from the bar and from the rendered grid.
    // In edit mode all tabs are visible (hidden tabs are styled as such).
    const visibleTabs = useMemo(
        () =>
            isEditMode
                ? dashboardTabs
                : dashboardTabs.filter((tab) => !tab.hidden),
        [dashboardTabs, isEditMode],
    );
    // Context: We don't want to show the "tabs mode" if there is only one tab in state
    // This is because the tabs mode is only useful when there are multiple tabs
    const sortedTabs = visibleTabs.length > 1 ? visibleTabs : [];
    const hasDashboardTiles = dashboardTiles && dashboardTiles.length > 0;
    const tabsEnabled = visibleTabs && visibleTabs.length > 1;

    // Track which tabs have been visited so we can lazy-mount tab content.
    // When keepTabsInMemory is enabled, tabs are mounted on first visit and
    // kept mounted (hidden) for instant re-switching.
    // When disabled, only the active tab is mounted to avoid memory bloat
    // on large dashboards (visited tabs with many charts can spike to 3 GB+).
    const visitedTabsRef = useRef(new Set<string>());
    if (activeTab) {
        if (keepTabsInMemory) {
            visitedTabsRef.current.add(activeTab.uuid);
        } else {
            visitedTabsRef.current = new Set([activeTab.uuid]);
        }
    }
    const visitedTabs = visitedTabsRef.current;

    // Group tiles by their tab UUID for per-tab grid rendering.
    // Only used when tabs are enabled. Tiles with stale/missing tab
    // references fall back to the default (first) tab.
    const tilesByTab = useMemo(() => {
        const map = new Map<string, DashboardTile[]>();
        if (!dashboardTiles || !tabsEnabled) return map;

        const tabUuids = new Set(dashboardTabs.map((t) => t.uuid));
        const defaultTabUuid = defaultTab?.uuid;

        for (const tile of dashboardTiles) {
            const effectiveTab =
                tile.tabUuid && tabUuids.has(tile.tabUuid)
                    ? tile.tabUuid
                    : defaultTabUuid;
            if (!effectiveTab) continue;
            const arr = map.get(effectiveTab);
            if (arr) {
                arr.push(tile);
            } else {
                map.set(effectiveTab, [tile]);
            }
        }
        return map;
    }, [dashboardTiles, dashboardTabs, defaultTab?.uuid, tabsEnabled]);

    // In view mode, drop tiles whose tab is hidden. Otherwise, when hiding tabs
    // leaves only one visible tab, the non-tabbed grid path below renders every
    // tile and the hidden tab's charts surface on the remaining grid.
    const visibleTiles = useMemo(() => {
        if (!dashboardTiles) return undefined;
        if (isEditMode) return dashboardTiles;
        const hiddenTabUuids = new Set(
            dashboardTabs.filter((t) => t.hidden).map((t) => t.uuid),
        );
        if (hiddenTabUuids.size === 0) return dashboardTiles;
        return dashboardTiles.filter(
            (t) => !t.tabUuid || !hiddenTabUuids.has(t.tabUuid),
        );
    }, [dashboardTiles, dashboardTabs, isEditMode]);

    const isEditActionBarShown =
        isEditMode && editErgonomicsFlag?.enabled === true;
    const dashboardGridBottomPadding =
        (fitToScreenRowHeight !== null
            ? FIT_TO_SCREEN_GRID_BOTTOM_PADDING
            : DASHBOARD_GRID_BOTTOM_PADDING +
              scrollToTopBottom -
              SCROLL_TO_TOP_BOTTOM) +
        (isEditActionBarShown ? EDIT_ACTION_BAR_CLEARANCE : 0);

    const canvasZoom = useDashboardSelector(selectCanvasZoom);
    const isCanvasZoomable = isEditMode && editErgonomicsFlag?.enabled === true;
    // Apart from the zoom, so a zoom step keeps the grid's own props stable
    const unzoomedGridProps = useMemo(
        () =>
            getResponsiveGridLayoutProps({
                isEditMode,
                gridScale,
                rowHeight:
                    gridScale > 1
                        ? getRowHeightForScale(gridScale)
                        : (fitToScreenRowHeight ?? DEFAULT_ROW_HEIGHT),
            }),
        [isEditMode, gridScale, fitToScreenRowHeight],
    );
    const gridProps: DashboardGridProps = useMemo(
        () => ({
            ...unzoomedGridProps,
            transformScale: isCanvasZoomable ? canvasZoom : undefined,
            // Only mid-gesture, so the grid still pushes stored overlaps apart
            allowOverlap: isEditErgonomicsEnabled && isInteracting,
        }),
        [
            unzoomedGridProps,
            isCanvasZoomable,
            canvasZoom,
            isEditErgonomicsEnabled,
            isInteracting,
        ],
    );
    const layoutsByTab = useMemo(() => {
        const map = new Map<string, DashboardLayouts>();
        for (const [tabUuid, tiles] of tilesByTab) {
            map.set(tabUuid, getDashboardLayouts(tiles, isEditMode, gridScale));
        }
        return map;
    }, [tilesByTab, isEditMode, gridScale]);

    // Layouts for non-tabbed dashboards (single grid with all tiles)
    const allTilesLayouts = useMemo(
        () => getDashboardLayouts(visibleTiles ?? [], isEditMode, gridScale),
        [visibleTiles, isEditMode, gridScale],
    );

    const gridLineStyles = useGridStyles({
        ref: gridWrapperRef,
        cols: unzoomedGridProps.cols,
        rowHeight: unzoomedGridProps.rowHeight,
    });

    // Compute whether there are unmet filter requirements that apply to the current tab
    // Note: We use doesFilterApplyToTile because getTabUuidsForFilterRules from common
    // skips disabled filters, but required filters ARE disabled until a value is set
    const hasUnmetFilterRequirementsForCurrentTab = useMemo(() => {
        if (unmetFilterRequirements.length === 0) {
            return false;
        }

        // If no tabs or single tab, any unmet requirement locks the dashboard
        if (!tabsEnabled) {
            return true;
        }

        const doesFilterApplyToCurrentTab = (
            filterRule: DashboardFilterRule,
        ) => {
            // If no tileTargets configuration, filter applies to all tiles
            // So it applies to the current tab
            if (!filterRule.tileTargets) {
                return true;
            }

            // Check if any tile on the current tab is targeted by this filter
            return (
                dashboardTiles?.some((tile) => {
                    if (tile.tabUuid !== activeTab?.uuid) return false;

                    return doesFilterApplyToTile(
                        filterRule,
                        tile,
                        filterableFieldsByTileUuid,
                    );
                }) ?? false
            );
        };

        return unmetFilterRequirements.some((requirement) => {
            switch (requirement.type) {
                case 'single':
                    return doesFilterApplyToCurrentTab(requirement.filter);
                case 'group':
                    // A group applies to a tab if any member applies to it
                    return requirement.filters.some(
                        doesFilterApplyToCurrentTab,
                    );
                default:
                    return assertUnreachable(
                        requirement,
                        'Unknown filter requirement type',
                    );
            }
        });
    }, [
        unmetFilterRequirements,
        tabsEnabled,
        dashboardTiles,
        activeTab?.uuid,
        filterableFieldsByTileUuid,
    ]);

    // Guided setup card over the locked grid; dismissal lasts until reload
    const [isGuidedSetupDismissed, setIsGuidedSetupDismissed] = useState(false);
    const dashboardProjectUuid = useDashboardContext((c) => c.projectUuid);
    const showGuidedSetup = useMemo(
        () =>
            !isEditMode &&
            !isGuidedSetupDismissed &&
            hasUnmetFilterRequirementsForCurrentTab &&
            !!hasDashboardTiles,
        [
            isEditMode,
            isGuidedSetupDismissed,
            hasUnmetFilterRequirementsForCurrentTab,
            hasDashboardTiles,
        ],
    );
    // Only fetched for the guided setup's startOfWeek; skip it otherwise
    const project = useProject(
        showGuidedSetup ? dashboardProjectUuid : undefined,
    );

    const warehouseConnection = project.data?.warehouseConnection;
    const startOfWeek = warehouseConnection
        ? (warehouseConnection.startOfWeek ??
          getDefaultStartOfWeek(warehouseConnection.type))
        : undefined;

    const firstSortedTabUuid = sortedTabs?.[0]?.uuid;
    const isActiveTile = useCallback(
        (tile: DashboardTile) => {
            const tileBelongsToActiveTab = tile.tabUuid === activeTab?.uuid; // tiles belongs to current tab
            const defaultTabOrFirstTabActived =
                activeTab?.uuid === defaultTab?.uuid ||
                activeTab?.uuid === firstSortedTabUuid;
            const tileHasStaleTabReference =
                !dashboardTabs?.some((tab) => tab.uuid === tile.tabUuid) &&
                defaultTabOrFirstTabActived; // tile des not belong to any tab and display it on default tab
            return (
                !tabsEnabled ||
                tileBelongsToActiveTab ||
                tileHasStaleTabReference
            );
        },
        [
            activeTab?.uuid,
            defaultTab?.uuid,
            firstSortedTabUuid,
            dashboardTabs,
            tabsEnabled,
        ],
    );

    const activeTiles = useMemo(
        () => dashboardTiles?.filter(isActiveTile),
        [dashboardTiles, isActiveTile],
    );
    const activeTabParameters = useActiveTabParameters(activeTiles);

    // Collapsed summary values
    const totalFiltersCount =
        dashboardFilters.dimensions.length +
        dashboardTemporaryFilters.dimensions.length;
    const parameterBar = useParameterBarControls();
    const isParameterViewer = useParameterEditorSelector((c) => c.isViewer);
    // With the controls, the pills the bar shows
    const totalParametersCount = isDashboardControlsEnabled
        ? parameterBar.entries.filter(
              ({ control }) => !(isParameterViewer && control.hidden),
          ).length
        : Object.keys(activeTabParameters).length;

    const currentTabHasTiles = !!dashboardTiles?.some((tile) =>
        isActiveTile(tile),
    );

    const handleChangeTab = useCallback(
        (tab: DashboardTab) => {
            // When tabs are kept in memory, instantly toggle visibility via DOM
            // manipulation for a snappier UX. When disabled, React handles
            // the mount/unmount so DOM tweaks are unnecessary.
            if (keepTabsInMemory) {
                const container = gridWrapperRef.current;
                if (container) {
                    for (const child of container.children) {
                        const panel = child as HTMLElement;
                        if (panel.dataset.tabUuid === tab.uuid) {
                            panel.style.contentVisibility = '';
                            panel.style.containIntrinsicSize = '';
                            panel.style.position = 'relative';
                            panel.style.width = '';
                            panel.style.pointerEvents = '';
                        } else {
                            panel.style.contentVisibility = 'hidden';
                            panel.style.containIntrinsicSize =
                                'auto 1px auto 1px';
                            panel.style.position = 'absolute';
                            panel.style.width = '100%';
                            panel.style.pointerEvents = 'none';
                        }
                    }

                    // Toggle the active tab indicator via DOM.
                    // Scope to our dashboard tabs root to avoid affecting other Tabs on the page.
                    // Mantine embeds the tab value in the id: "mantine-...-tab-{uuid}"
                    const tabsRoot = document.querySelector(
                        `.${styles.tabsRoot}`,
                    );
                    if (tabsRoot) {
                        const tabButtons =
                            tabsRoot.querySelectorAll('[role="tab"]');
                        for (const tabEl of tabButtons) {
                            if (tabEl.id?.includes(tab.uuid)) {
                                tabEl.setAttribute('data-active', 'true');
                                tabEl.setAttribute('aria-selected', 'true');
                            } else {
                                tabEl.removeAttribute('data-active');
                                tabEl.setAttribute('aria-selected', 'false');
                            }
                        }
                    }
                }
            }

            const newParams = new URLSearchParams(search);
            startTabTransition(() => {
                void navigate(
                    {
                        pathname: getDashboardTabPath({
                            projectUrlIdentifier,
                            dashboardUrlIdentifier: dashboardIdentifier,
                            isEditMode,
                            tabUuid: tab?.uuid,
                        }),
                        search: newParams.toString(),
                    },
                    { replace: true },
                );
            });
        },
        [
            keepTabsInMemory,
            search,
            isEditMode,
            projectUrlIdentifier,
            dashboardIdentifier,
            navigate,
            startTabTransition,
        ],
    );

    const { highlightTileUuid } = useHighlightedTile({
        enabled: !!hasDashboardTiles,
    });

    // A shared tile link can point at a tab that isn't the active one (e.g. the
    // tile was moved since), so activate the tab holding the tile first.
    const hasSwitchedToHighlightedTabRef = useRef(false);
    useEffect(() => {
        if (
            !highlightTileUuid ||
            !tabsEnabled ||
            !activeTab ||
            hasSwitchedToHighlightedTabRef.current
        ) {
            return;
        }
        const tabWithTile = visibleTabs.find((tab) =>
            tilesByTab
                .get(tab.uuid)
                ?.some((tile) => tile.uuid === highlightTileUuid),
        );
        if (!tabWithTile || tabWithTile.uuid === activeTab.uuid) return;

        hasSwitchedToHighlightedTabRef.current = true;
        handleChangeTab(tabWithTile);
    }, [
        highlightTileUuid,
        tabsEnabled,
        activeTab,
        visibleTabs,
        tilesByTab,
        handleChangeTab,
    ]);

    const maxTabsPerDashboard =
        health.data?.dashboard?.maxTabsPerDashboard || 20;
    const currentTabsCount = dashboardTabs?.length || 0;
    const canAddTab = currentTabsCount < maxTabsPerDashboard;

    const handleAddTab = (name: string) => {
        // Check tab limit
        if (currentTabsCount >= maxTabsPerDashboard) {
            showToastError({
                title: 'Tab limit reached',
                subtitle: `You've reached the maximum of ${maxTabsPerDashboard} tabs per dashboard. Consider creating a new dashboard.`,
            });
            setAddingTab(false);
            return;
        }

        if (name) {
            const newTabs = dashboardTabs ? [...dashboardTabs] : [];
            if (!dashboardTabs?.length) {
                const firstTab = {
                    name: 'Tab 1',
                    uuid: uuid4(),
                    isDefault: true,
                    order: 0,
                    hidden: false,
                };
                newTabs.push(firstTab);
                // Move all tiles to the new default tab (immutable update)
                setDashboardTiles((currentTiles) =>
                    currentTiles?.map((tile) => ({
                        ...tile,
                        tabUuid: firstTab.uuid,
                    })),
                );
                setHaveTilesChanged(true);
            }
            const lastOrd = newTabs.sort((a, b) => b.order - a.order)[0].order;
            const newTab = {
                name: name,
                uuid: uuid4(),
                isDefault: false,
                order: lastOrd + 1,
                hidden: false,
            };
            newTabs.push(newTab);
            setDashboardTabs(newTabs);
            setHaveTabsChanged(true);

            // Navigate to the new tab
            handleChangeTab(newTab);
        }
        setAddingTab(false);
    };

    const handleEditTab = (name: string, changedTabUuid: string) => {
        if (name && changedTabUuid) {
            setDashboardTabs((currentTabs) => {
                const newTabs: DashboardTab[] = currentTabs?.map((tab) => {
                    if (tab.uuid === changedTabUuid) {
                        return { ...tab, name };
                    }
                    return tab;
                });
                return newTabs;
            });
            setHaveTabsChanged(true);
            setEditingTab(false);
        }
    };

    const handleDeleteTab = (tabUuid: string) => {
        setDashboardTabs((currentTabs) => {
            const newTabs: DashboardTab[] = currentTabs?.filter(
                (t) => t.uuid !== tabUuid,
            );
            return newTabs;
        });
        if (activeTab?.uuid === tabUuid) {
            handleChangeTab(
                dashboardTabs.filter((tab) => tab.uuid !== tabUuid)?.[0],
            );
        }
        setHaveTabsChanged(true);
        setDeletingTab(false);

        if (dashboardTabs.length === 1) {
            // Clear tabUuid from all tiles to avoid foreign key constraint error (immutable update)
            setDashboardTiles((currentTiles) =>
                currentTiles?.map((tile) => ({
                    ...tile,
                    tabUuid: undefined,
                })),
            );
            setHaveTilesChanged(true);
            // If this is the last tab, navigate to the non-tab URL.
            // See `const = sortedTabs` for more context.
            void navigate(
                `/projects/${projectUrlIdentifier}/dashboards/${dashboardIdentifier}/edit`,
                { replace: true },
            );

            return;
        }

        const tilesToDelete = dashboardTiles?.filter(
            (tile) => tile.tabUuid === tabUuid,
        );
        if (tilesToDelete) {
            handleBatchDeleteTiles(tilesToDelete);
        }
    };

    const handleToggleTabHidden = (tabUuid: string) => {
        setDashboardTabs((currentTabs) =>
            currentTabs?.map((tab) =>
                tab.uuid === tabUuid ? { ...tab, hidden: !tab.hidden } : tab,
            ),
        );
        setHaveTabsChanged(true);
    };

    const handleDuplicateTab = (tabUuid: string) => {
        const tab = dashboardTabs.find((t) => t.uuid === tabUuid);
        if (tab) {
            setTabToDuplicate(tab);
            setDuplicatingTab(true);
        }
    };

    const handleConfirmDuplicateTab = (name: string) => {
        // Check tab limit
        if (currentTabsCount >= maxTabsPerDashboard) {
            showToastError({
                title: 'Tab limit reached',
                subtitle: `You've reached the maximum of ${maxTabsPerDashboard} tabs per dashboard. Consider creating a new dashboard.`,
            });
            setDuplicatingTab(false);
            setTabToDuplicate(null);
            return;
        }

        if (tabToDuplicate) {
            const lastOrd =
                dashboardTabs.length > 0
                    ? Math.max(...dashboardTabs.map((t) => t.order ?? 0))
                    : -1;
            const newTab = {
                name: name,
                uuid: uuid4(),
                isDefault: false,
                order: lastOrd + 1,
                hidden: false,
            };

            setDashboardTabs((currentTabs) => [...currentTabs, newTab]);
            handleChangeTab(newTab);
            setHaveTabsChanged(true);

            // Duplicate tiles from the original tab
            const tilesToDuplicate = dashboardTiles?.filter(
                (tile) => tile.tabUuid === tabToDuplicate.uuid,
            );

            if (tilesToDuplicate && tilesToDuplicate.length > 0) {
                // Step 1: Create mapping while duplicating tiles
                const tileUuidMapping = new Map<string, string>();
                const duplicatedTiles = tilesToDuplicate.map((tile) => {
                    const newUuid = uuid4();
                    tileUuidMapping.set(tile.uuid, newUuid);
                    return {
                        ...tile,
                        uuid: newUuid,
                        tabUuid: newTab.uuid,
                    };
                });

                // Directly add tiles to the dashboard without using handleAddTiles
                // to avoid automatic assignment to current active tab
                setDashboardTiles((currentTiles) => [
                    ...(currentTiles ?? []),
                    ...duplicatedTiles,
                ]);
                setHaveTilesChanged(true);

                // Step 2: Update filters to include new tile mappings
                const updatedFilters = produce(
                    dashboardFilters.dimensions,
                    (draft) => {
                        for (const filter of draft) {
                            if (!filter.tileTargets) continue;

                            for (const [oldUuid, newUuid] of tileUuidMapping) {
                                if (oldUuid in filter.tileTargets) {
                                    filter.tileTargets[newUuid] =
                                        filter.tileTargets[oldUuid];
                                }
                            }
                        }
                    },
                );

                // Step 3: Update dashboard filters
                setDashboardFilters({
                    ...dashboardFilters,
                    dimensions: updatedFilters,
                });
                setHaveFiltersChanged(true);

                // Mirror the filter remap for date-zoom controls. The tab map is
                // Map<oldUuid, newUuid>, so old=from and new=to.
                const dateZoomMapping = [...tileUuidMapping].map(
                    ([fromTileUuid, toTileUuid]) => ({
                        fromTileUuid,
                        toTileUuid,
                    }),
                );
                const nextDateZoomConfig = copyDateZoomTileTargets(
                    dateZoomConfig,
                    dateZoomMapping,
                );
                if (nextDateZoomConfig !== dateZoomConfig) {
                    setDateZoomConfig(nextDateZoomConfig);
                }
            }
        }
        setDuplicatingTab(false);
        setTabToDuplicate(null);
    };

    return (
        <SortableList
            axis="horizontal"
            items={sortedTabs.map((tab) => tab.uuid)}
            onReorder={(from, to) => {
                const newTabs = cloneDeep(sortedTabs); // avoid mutating tab objects
                const [reorderedTab] = newTabs.splice(from, 1);
                newTabs.splice(to, 0, reorderedTab);
                newTabs.forEach((tab, idx) => {
                    tab.order = idx;
                });
                setDashboardTabs(newTabs);
                setHaveTabsChanged(true);
            }}
        >
            <Flex direction="column" flex="1 1 auto">
                <Tabs
                    value={activeTab?.uuid}
                    onChange={(e) => {
                        const tab = sortedTabs?.find((t) => t.uuid === e);
                        if (tab) {
                            handleChangeTab(tab);
                        }
                    }}
                    classNames={{
                        root: styles.tabsRoot,
                        list: styles.list,
                        tab: styles.tab,
                    }}
                >
                    <StickyWithDetection
                        // Header that includes dashboard title is sticky during editing
                        offset={isEditMode ? DASHBOARD_HEADER_HEIGHT : 0}
                        onStuckChange={setIsHeaderStuck}
                    >
                        <div
                            className={styles.stickyTabsAndFilters}
                            data-has-header-above={isEditMode}
                            data-is-stuck={isHeaderStuck}
                        >
                            {sortedTabs && sortedTabs?.length > 0 && (
                                <Tabs.List px="lg">
                                    {sortedTabs.map((tab, idx) => (
                                        <DraggableTab
                                            key={tab.uuid}
                                            idx={idx}
                                            tab={tab}
                                            isEditMode={isEditMode}
                                            sortedTabs={sortedTabs}
                                            currentTabHasTiles={
                                                currentTabHasTiles
                                            }
                                            setEditingTab={setEditingTab}
                                            handleDeleteTab={handleDeleteTab}
                                            handleDuplicateTab={
                                                handleDuplicateTab
                                            }
                                            handleToggleTabHidden={
                                                handleToggleTabHidden
                                            }
                                            setDeletingTab={setDeletingTab}
                                            hasQuietActions={
                                                isDashboardControlsEnabled
                                            }
                                        />
                                    ))}

                                    {isEditMode && (
                                        <Tooltip
                                            label={
                                                !canAddTab
                                                    ? `Maximum ${maxTabsPerDashboard} tabs per dashboard. Consider creating a new dashboard.`
                                                    : 'Add a new tab'
                                            }
                                            disabled={canAddTab}
                                        >
                                            <Button
                                                ml="sm"
                                                size="xs"
                                                variant="default"
                                                className={clsx(
                                                    addFilterClasses.dashed,
                                                    styles.newTabButton,
                                                )}
                                                flex="0 0 auto"
                                                disabled={!canAddTab}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconPlus}
                                                    />
                                                }
                                                onClick={() =>
                                                    setAddingTab(true)
                                                }
                                            >
                                                New tab
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Tabs.List>
                            )}

                            {editFiltersVisibility !== 'hidden' && (
                                <div className={styles.filtersBar}>
                                    {isFiltersSummaryShown ? (
                                        <DashboardFiltersBarSummary
                                            filtersCount={totalFiltersCount}
                                            parametersCount={
                                                totalParametersCount
                                            }
                                            dateZoomLabel={
                                                isDateZoomDisabled
                                                    ? null
                                                    : getDateZoomSummaryLabel(
                                                          dateZoomGranularity,
                                                          getUiString,
                                                      )
                                            }
                                            onExpand={() =>
                                                isEditMode
                                                    ? onEditFiltersVisibilityChange(
                                                          'all',
                                                      )
                                                    : setIsFiltersCollapsed(
                                                          false,
                                                      )
                                            }
                                        />
                                    ) : (
                                        <FiltersBar
                                            isEditMode={isEditMode}
                                            activeTabUuid={activeTab?.uuid}
                                            hasTilesThatSupportFilters={
                                                hasTilesThatSupportFilters
                                            }
                                            hasDashboardTiles={
                                                !!hasDashboardTiles
                                            }
                                            parameters={activeTabParameters}
                                            shadowedReservedNames={
                                                shadowedReservedNames
                                            }
                                            parameterValues={parameterValues}
                                            onParameterChange={
                                                onParameterChange
                                            }
                                            onParameterClearAll={
                                                onParameterClearAll
                                            }
                                            isParameterLoading={
                                                isParameterLoading
                                            }
                                            missingRequiredParameters={
                                                missingRequiredParameters
                                            }
                                            pinnedParameters={pinnedParameters}
                                            onParameterPin={onParameterPin}
                                            parameterOrder={parameterOrder}
                                            onParameterReorder={
                                                onParameterReorder
                                            }
                                            isDateZoomDisabled={
                                                isDateZoomDisabled
                                            }
                                            onCollapse={() =>
                                                isEditMode
                                                    ? onEditFiltersVisibilityChange(
                                                          'summary',
                                                      )
                                                    : setIsFiltersCollapsed(
                                                          true,
                                                      )
                                            }
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </StickyWithDetection>

                    {showGuidedSetup && (
                        <GuidedFilterSetupOverlay
                            startOfWeek={startOfWeek}
                            onDismiss={() => setIsGuidedSetupDismissed(true)}
                        />
                    )}

                    <Group grow pb={dashboardGridBottomPadding} px="xs">
                        <div
                            ref={mergedGridWrapperRef}
                            className={[
                                styles.tabGridContainer,
                                showGridLines ? styles.gridLines : undefined,
                                isInteracting
                                    ? styles.gridInteracting
                                    : undefined,
                                isFitToScreenSnapping
                                    ? styles.gridSnapping
                                    : undefined,
                                gridProps.allowOverlap
                                    ? styles.dropShadow
                                    : undefined,
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                            style={showGridLines ? gridLineStyles : undefined}
                        >
                            {tabsEnabled
                                ? visibleTabs
                                      .filter((tab) =>
                                          visitedTabs.has(tab.uuid),
                                      )
                                      .map((tab) => (
                                          <Activity
                                              key={tab.uuid}
                                              mode={
                                                  activeTab?.uuid === tab.uuid
                                                      ? 'visible'
                                                      : 'hidden'
                                              }
                                              name={`dashboard-tab-${tab.name}`}
                                          >
                                              <TabGridPanel
                                                  key={tab.uuid}
                                                  tabUuid={tab.uuid}
                                                  tiles={
                                                      tilesByTab.get(
                                                          tab.uuid,
                                                      ) ?? []
                                                  }
                                                  layouts={
                                                      layoutsByTab.get(
                                                          tab.uuid,
                                                      ) ?? EMPTY_LAYOUTS
                                                  }
                                                  isActive={
                                                      activeTab?.uuid ===
                                                      tab.uuid
                                                  }
                                                  isEditMode={isEditMode}
                                                  locked={
                                                      hasUnmetFilterRequirementsForCurrentTab
                                                  }
                                                  gridProps={gridProps}
                                                  dashboardTabs={dashboardTabs}
                                                  onDragStart={
                                                      handleInteractionStart
                                                  }
                                                  onDragStop={
                                                      handleInteractionStop
                                                  }
                                                  onResizeStart={
                                                      handleInteractionStart
                                                  }
                                                  onResizeStop={
                                                      handleInteractionStop
                                                  }
                                                  onWidthChange={
                                                      handleWidthChange
                                                  }
                                                  onDeleteTile={
                                                      handleDeleteTile
                                                  }
                                                  onEditTile={handleEditTile}
                                                  onAddTiles={handleAddTiles}
                                              />
                                          </Activity>
                                      ))
                                : /* Single grid for non-tabbed dashboards */
                                  visibleTiles && (
                                      <ErrorBoundary>
                                          <ResponsiveGridLayout
                                              key={gridProps.cols.lg}
                                              {...gridProps}
                                              onDragStart={
                                                  handleInteractionStart
                                              }
                                              onDragStop={handleInteractionStop}
                                              onResizeStart={
                                                  handleInteractionStart
                                              }
                                              onResizeStop={
                                                  handleInteractionStop
                                              }
                                              onWidthChange={handleWidthChange}
                                              layouts={allTilesLayouts}
                                          >
                                              {visibleTiles.map((tile) => (
                                                  <div
                                                      key={tile.uuid}
                                                      data-tile-uuid={tile.uuid}
                                                  >
                                                      <TrackSection
                                                          name={
                                                              SectionName.DASHBOARD_TILE
                                                          }
                                                      >
                                                          <GridTile
                                                              locked={
                                                                  hasUnmetFilterRequirementsForCurrentTab
                                                              }
                                                              isEditMode={
                                                                  isEditMode
                                                              }
                                                              tile={tile}
                                                              onDelete={
                                                                  handleDeleteTile
                                                              }
                                                              onEdit={
                                                                  handleEditTile
                                                              }
                                                              tabs={
                                                                  dashboardTabs
                                                              }
                                                              onAddTiles={
                                                                  handleAddTiles
                                                              }
                                                          />
                                                      </TrackSection>
                                                  </div>
                                              ))}
                                          </ResponsiveGridLayout>
                                      </ErrorBoundary>
                                  )}
                        </div>
                    </Group>
                    {(!hasDashboardTiles || !currentTabHasTiles) && (
                        <EmptyStateNoTiles
                            onAddTiles={handleAddTiles}
                            onNewChart={onNewChart}
                            emptyContainerType={
                                dashboardTabs && dashboardTabs.length
                                    ? 'tab'
                                    : 'dashboard'
                            }
                            isEditMode={isEditMode}
                            setAddingTab={setAddingTab}
                            activeTabUuid={activeTab?.uuid}
                            dashboardTabs={dashboardTabs}
                        />
                    )}
                    <AddTabModal
                        onClose={() => setAddingTab(false)}
                        opened={addingTab}
                        onConfirm={(name) => {
                            handleAddTab(name);
                        }}
                    />
                    {tabToDuplicate && (
                        <DuplicateTabModal
                            tab={tabToDuplicate}
                            onClose={() => {
                                setDuplicatingTab(false);
                                setTabToDuplicate(null);
                            }}
                            opened={isDuplicatingTab}
                            onConfirm={handleConfirmDuplicateTab}
                        />
                    )}
                    {activeTab && (
                        <>
                            <TabEditModal
                                key={activeTab.uuid}
                                tab={activeTab}
                                onClose={() => setEditingTab(false)}
                                opened={isEditingTab}
                                onConfirm={(name, uuid) => {
                                    handleEditTab(name, uuid);
                                }}
                            />
                            <TabDeleteModal
                                tab={activeTab}
                                dashboardTiles={dashboardTiles}
                                dashboardTabs={dashboardTabs}
                                dashboardUuid={dashboardUuid!}
                                onClose={() => setDeletingTab(false)}
                                opened={
                                    isDeletingTab && dashboardTabs?.length > 1
                                }
                                onDeleteTab={(uuid) => {
                                    handleDeleteTab(uuid);
                                }}
                                onMoveTile={handleEditTile}
                            />
                        </>
                    )}
                </Tabs>
            </Flex>

            <ScrollToTop show={isHeaderStuck} bottom={scrollToTopBottom} />
        </SortableList>
    );
};

export default DashboardTabs;
