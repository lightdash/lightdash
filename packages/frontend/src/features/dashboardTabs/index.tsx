import {
    copyDateZoomTileTargets,
    DashboardTileTypes,
    FeatureFlags,
    getDefaultStartOfWeek,
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
    dashboardEditActions,
    selectCanvasBackground,
    selectCanvasZoom,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDateZoomGranularity,
    selectIsDateZoomRefusedOnAllChartTiles,
    selectIsDateZoomDisabled,
    useDashboardDateZoomConfig,
    useDashboardDispatch,
    useDashboardSelector,
    useDashboardTemporaryFilters,
    useDashboardUnmetFilterRequirements,
} from '../dashboard/store';
import { ControlsBar } from '../dashboardControls/ControlsBar';
import { DashboardControlsSummary } from '../dashboardControls/DashboardControlsSummary';
import { useParameterBarControls } from '../dashboardControls/useParameterBarControls';
import { useParameterEditorSelector } from '../dashboardControls/useParameterEditor';
import addFilterClasses from '../dashboardFilters/AddFilterButton.module.css';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { type EditFiltersVisibility } from '../dashboardFilters/EditFiltersVisibilityControl';
import GuidedFilterSetupOverlay from '../dashboardFilters/FilterRequirements/GuidedFilterSetupOverlay';
import {
    doesFilterRequirementApplyToTiles,
    getUnmetFilterRequirementMembers,
} from '../dashboardFilters/FilterRequirements/utils';
import { getDateZoomSummaryLabel } from '../dateZoom/utils';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';
import { AddTabModal } from './AddTabModal';
import { CanvasAddTile } from './CanvasAddTile';
import { ACTUAL_SIZE_ZOOM } from './canvasZoomUtils';
import { TabDeleteModal } from './DeleteTabModal';
import DuplicateTabModal from './DuplicateTabModal';
import { TabEditModal } from './EditTabModal';
import GridTile from './GridTile';
import {
    convertLayoutToBaseCoordinates,
    pinGridItem,
    resolveDropOverlaps,
    getRowInsertion,
    getGapFill,
    getLayoutOnScreen,
    getPointerCell,
    getPointerPosition,
    isClick,
    hasLayoutChanged,
    countResizedItems,
    withGridItem,
    getSnapDwellRemaining,
    getSnapRest,
    getSnapTarget,
    type GridSlot,
    type SnapPlacement,
    type SnapRest,
    GRID_DESKTOP_COLS,
    EDIT_RESIZE_HANDLES,
    DEFAULT_RESIZE_HANDLES,
    type ResizeHandle,
    DEFAULT_ROW_HEIGHT,
    EDIT_ACTION_BAR_CLEARANCE,
    FINE_GRID_SCALE,
    FIT_TO_SCREEN_GRID_BOTTOM_PADDING,
    getDashboardLayouts,
    getLayoutToSaveAfterEdit,
    type DashboardLayouts,
    getResponsiveGridLayoutProps,
    getRowHeightForScale,
    matchesSavedLayout,
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
    resizeHandles: ResizeHandle[];
};

const DASHBOARD_GRID_BOTTOM_PADDING = 60;

/** A little longer than the drop transition in tabs.module.css */
const DROP_SETTLE_MS = 260;

type SettleMode = 'position' | 'positionAndSize';

/** Each resizing chart redraws on every frame, so bigger drops only move */
const MAX_ANIMATED_RESIZES = 4;

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
    onDrag: ItemCallback;
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
        onDrag,
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
                        {...gridProps}
                        onDragStart={onDragStart}
                        onDrag={onDrag}
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
            (prevProps.onDrag !== nextProps.onDrag ||
                prevProps.onDragStop !== nextProps.onDragStop ||
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
    const dashboardDispatch = useDashboardDispatch();
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
    const isEditErgonomicsFlagOn = editErgonomicsFlag?.enabled === true;
    const isEditErgonomicsEnabled = isEditMode && isEditErgonomicsFlagOn;
    const gridScale = isEditErgonomicsEnabled ? FINE_GRID_SCALE : 1;
    const FiltersBar = isDashboardControlsEnabled
        ? ControlsBar
        : DashboardFiltersBar;

    const [isInteracting, setIsInteracting] = useState(false);
    // Just after a drop, while tiles travel to where the drop put them
    const [settleMode, setSettleMode] = useState<SettleMode | null>(null);
    useEffect(() => {
        if (settleMode === null) return;
        const timer = window.setTimeout(
            () => setSettleMode(null),
            DROP_SETTLE_MS,
        );
        return () => window.clearTimeout(timer);
    }, [settleMode]);
    // An attribute, not state: it flips many times in one drag
    const setShadowSnapped = useCallback((isSnapped: boolean) => {
        gridWrapperRef.current?.toggleAttribute(
            'data-shadow-snapped',
            isSnapped,
        );
    }, []);

    const showGridLines =
        isEditErgonomicsEnabled || (isEditMode && isInteracting);

    const homeRowsRef = useRef(
        new Map<string, { tabUuid: string | null | undefined; y: number }>(),
    );
    useEffect(() => {
        if (!isEditMode) homeRowsRef.current.clear();
    }, [isEditMode]);

    const [gridRedraw, setGridRedraw] = useState<{
        tileUuid: string;
        layouts: DashboardLayouts;
    } | null>(null);

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

    const snapRestRef = useRef<SnapRest | null>(null);
    const shownSnapRef = useRef<SnapPlacement | null>(null);
    const snapDwellTimerRef = useRef<number | null>(null);
    const clearSnapDwell = useCallback(() => {
        if (snapDwellTimerRef.current === null) return;
        window.clearTimeout(snapDwellTimerRef.current);
        snapDwellTimerRef.current = null;
    }, []);
    useEffect(() => clearSnapDwell, [clearSnapDwell]);

    const endInteraction = useCallback(() => {
        stopAutoScroll();
        clearSnapDwell();
        snapRestRef.current = null;
        shownSnapRef.current = null;
        setIsInteracting(false);
        setShadowSnapped(false);
    }, [stopAutoScroll, clearSnapDwell, setShadowSnapped]);
    const handleInteractionStart = useCallback<ItemCallback>(
        (_layout, _before, _after, _placeholder, _event, node) => {
            if (isEditErgonomicsEnabled) pinGridItem(node);
            setIsInteracting(true);
            startAutoScroll();
            // The grid reports no stop for a press that never moved
            const release = new AbortController();
            const handleRelease = () => {
                release.abort();
                endInteraction();
            };
            ['mouseup', 'touchend', 'touchcancel'].forEach((type) =>
                window.addEventListener(type, handleRelease, {
                    signal: release.signal,
                }),
            );
        },
        [startAutoScroll, endInteraction, isEditErgonomicsEnabled],
    );
    // A press on a tile's drag area that goes nowhere picks the tile
    const handleDragStart = useCallback<ItemCallback>(
        (layout, before, after, placeholder, event, node) => {
            handleInteractionStart(
                layout,
                before,
                after,
                placeholder,
                event,
                node,
            );
            const pressed = getPointerPosition(event);
            if (!isEditErgonomicsEnabled || !pressed) return;
            const release = new AbortController();
            const handleRelease = (released: MouseEvent | TouchEvent) => {
                release.abort();
                const pointer = getPointerPosition(released);
                if (pointer && isClick(pressed, pointer)) {
                    dashboardDispatch(dashboardEditActions.selectTile(after.i));
                }
            };
            window.addEventListener('mouseup', handleRelease, {
                signal: release.signal,
            });
            window.addEventListener('touchend', handleRelease, {
                signal: release.signal,
            });
            window.addEventListener('touchcancel', () => release.abort(), {
                signal: release.signal,
            });
        },
        [handleInteractionStart, isEditErgonomicsEnabled, dashboardDispatch],
    );
    useEffect(() => {
        if (!isEditErgonomicsEnabled) {
            dashboardDispatch(dashboardEditActions.selectTile(null));
        }
    }, [isEditErgonomicsEnabled, dashboardDispatch]);
    // The grid reports its whole layout on every stop, with stored overlaps
    // pushed apart, so a gesture that changed nothing must not apply it
    const applyDrop = useCallback(
        (layoutBefore: Layout[], layout: Layout[]) => {
            endInteraction();
            if (!hasLayoutChanged(layoutBefore, layout)) return;
            if (isEditErgonomicsEnabled) {
                setSettleMode(
                    countResizedItems(layoutBefore, layout) <=
                        MAX_ANIMATED_RESIZES
                        ? 'positionAndSize'
                        : 'position',
                );
            }
            void handleUpdateTilesWithScaling(layout);
        },
        [endInteraction, handleUpdateTilesWithScaling, isEditErgonomicsEnabled],
    );
    const settlePushedDrop = useCallback(
        (layout: Layout[], before: Layout, after: Layout) => {
            endInteraction();
            const tiles = dashboardTiles ?? [];
            const homeRows = homeRowsRef.current;
            tiles.forEach((tile) => {
                const homeRow = homeRows.get(tile.uuid);
                if (!homeRow || homeRow.tabUuid !== tile.tabUuid) {
                    homeRows.set(tile.uuid, {
                        tabUuid: tile.tabUuid,
                        y: tile.y,
                    });
                }
            });
            const previous = new Map(
                tiles.map(({ uuid, x, y, w, h }) => [
                    uuid,
                    { i: uuid, x, y, w, h },
                ]),
            );
            const layoutToSave = getLayoutToSaveAfterEdit({
                layout,
                before,
                after,
                gridScale,
                previous,
                home: new Map(
                    [...homeRows].map(([tileUuid, { y }]) => [tileUuid, y]),
                ),
            });
            if (layoutToSave) {
                const edited = layoutToSave.find((item) => item.i === after.i);
                if (edited) {
                    homeRows.set(edited.i, {
                        tabUuid: tiles.find((tile) => tile.uuid === edited.i)
                            ?.tabUuid,
                        y: edited.y,
                    });
                }
                void handleUpdateTiles(layoutToSave);
                return;
            }
            if (
                !matchesSavedLayout(
                    convertLayoutToBaseCoordinates(layout, gridScale),
                    previous,
                )
            ) {
                setGridRedraw({
                    tileUuid: after.i,
                    layouts: { lg: layout, md: layout, sm: layout, xs: layout },
                });
                requestAnimationFrame(() => setGridRedraw(null));
            }
        },
        [dashboardTiles, endInteraction, gridScale, handleUpdateTiles],
    );
    const handleResizeStop = useCallback<ItemCallback>(
        (layout, before, after) => {
            if (!isEditErgonomicsEnabled) {
                settlePushedDrop(layout, before, after);
                return;
            }
            applyDrop(
                withGridItem(layout, before),
                resolveDropOverlaps(layout, [after.i], gridScale),
            );
        },
        [applyDrop, gridScale, isEditErgonomicsEnabled, settlePushedDrop],
    );
    // A slot beside the tile under the pointer, else the empty space under it
    const getDragSnap = useCallback(
        (
            layout: Layout[],
            before: Layout,
            event: MouseEvent | TouchEvent,
            node: HTMLElement,
        ) => {
            const pointer = getPointerPosition(event);
            if (!isEditErgonomicsEnabled || !pointer) return null;
            const cols = GRID_DESKTOP_COLS * gridScale;
            const layoutBefore = withGridItem(layout, before);
            const target = getSnapTarget(pointer, before.i);
            if (target) {
                return getRowInsertion({
                    layout: layoutBefore,
                    draggedId: before.i,
                    target,
                    cols,
                });
            }
            return getGapFill({
                layout: layoutBefore,
                draggedId: before.i,
                cols,
                // The dragged tile is held where it started, so it measures
                // the grid
                cell: getPointerCell({
                    pointer,
                    tile: before,
                    tileRect: node.getBoundingClientRect(),
                }),
            });
        },
        [isEditErgonomicsEnabled, gridScale],
    );
    // A snap waits for the pointer to rest, so a tile can be dropped as it is
    const getRestedSnap = useCallback<
        (...args: Parameters<typeof getDragSnap>) => SnapPlacement | null
    >(
        (layout, before, event, node) => {
            clearSnapDwell();
            const pointer = getPointerPosition(event);
            const snap = getDragSnap(layout, before, event, node);
            if (!snap || !pointer) {
                snapRestRef.current = null;
                return null;
            }
            const now = performance.now();
            const rest = getSnapRest({
                previous: snapRestRef.current,
                slot: snap.slot,
                pointer,
                now,
            });
            snapRestRef.current = rest;
            const remaining = getSnapDwellRemaining(rest, now);
            if (remaining === 0) return snap;
            // A resting pointer reports no moves, so the grid is sent one
            snapDwellTimerRef.current = window.setTimeout(
                () =>
                    document.dispatchEvent(
                        new MouseEvent('mousemove', {
                            bubbles: true,
                            clientX: pointer.clientX,
                            clientY: pointer.clientY,
                        }),
                    ),
                remaining,
            );
            return null;
        },
        [clearSnapDwell, getDragSnap],
    );
    const handleDrag = useCallback<ItemCallback>(
        (layout, before, _after, placeholder, event, node) => {
            const snap = getRestedSnap(layout, before, event, node);
            shownSnapRef.current = snap;
            setShadowSnapped(snap !== null);
            // The grid draws the shadow from this object after the callback
            if (snap) {
                const { x, y, w, h } = snap.slot;
                Object.assign(placeholder, { x, y, w, h });
            }
        },
        [getRestedSnap, setShadowSnapped],
    );
    const handleDragStop = useCallback<ItemCallback>(
        (layout, before, after, placeholder, event, node) => {
            // The drop lands where the shadow last showed it would
            const snap = shownSnapRef.current;
            if (!snap) {
                handleResizeStop(
                    layout,
                    before,
                    after,
                    placeholder,
                    event,
                    node,
                );
                return;
            }
            // The grid keeps this object as the tile's place, so a snap that
            // changes nothing still puts the tile back
            const { x, y, w, h } = snap.slot;
            Object.assign(after, { x, y, w, h });
            applyDrop(withGridItem(layout, before), snap.layout);
        },
        [handleResizeStop, applyDrop],
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
    const isDateZoomRefusedOnAllChartTiles = useDashboardSelector(
        selectIsDateZoomRefusedOnAllChartTiles,
    );
    const dashboardTemporaryFilters = useDashboardTemporaryFilters();

    // filters bar state
    const [isFiltersCollapsed, setIsFiltersCollapsed] =
        useState<boolean>(false);

    // Without the edit toolbar there is no visibility switch to stay in sync with
    const isVisibilitySetByEditToolbar = isEditMode && isEditErgonomicsEnabled;
    const isFiltersSummaryShown = isVisibilitySetByEditToolbar
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
    const canvasBackground = useDashboardSelector(selectCanvasBackground);
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
            // Kept at actual size outside editing so leaving edit mode keeps
            // the same grid tree instead of remounting every tile
            transformScale: isCanvasZoomable
                ? canvasZoom
                : editErgonomicsFlag?.enabled === true
                  ? ACTUAL_SIZE_ZOOM
                  : undefined,
            // Only mid-gesture, so the grid still pushes stored overlaps apart
            allowOverlap: isEditErgonomicsEnabled && isInteracting,
            resizeHandles: isEditErgonomicsEnabled
                ? EDIT_RESIZE_HANDLES
                : DEFAULT_RESIZE_HANDLES,
        }),
        [
            unzoomedGridProps,
            isCanvasZoomable,
            canvasZoom,
            editErgonomicsFlag?.enabled,
            isEditErgonomicsEnabled,
            isInteracting,
        ],
    );
    const layoutsByTab = useMemo(() => {
        const map = new Map<string, DashboardLayouts>();
        for (const [tabUuid, tiles] of tilesByTab) {
            map.set(
                tabUuid,
                gridRedraw &&
                    tiles.some((tile) => tile.uuid === gridRedraw.tileUuid)
                    ? gridRedraw.layouts
                    : getDashboardLayouts(tiles, isEditMode, gridScale),
            );
        }
        return map;
    }, [tilesByTab, isEditMode, gridScale, gridRedraw]);

    // Layouts for non-tabbed dashboards (single grid with all tiles)
    const allTilesLayouts = useMemo(
        () =>
            gridRedraw && !tabsEnabled
                ? gridRedraw.layouts
                : getDashboardLayouts(
                      visibleTiles ?? [],
                      isEditMode,
                      gridScale,
                  ),
        [visibleTiles, isEditMode, gridScale, gridRedraw, tabsEnabled],
    );

    const activeLayout =
        (tabsEnabled
            ? activeTab && layoutsByTab.get(activeTab.uuid)
            : allTilesLayouts
        )?.lg ?? EMPTY_LAYOUTS.lg;

    const activeLayoutOnScreen = useMemo(
        () => getLayoutOnScreen(activeLayout),
        [activeLayout],
    );

    const handleAddTilesToSlot = useCallback(
        (tiles: IDashboard['tiles'][number][], slot: GridSlot) => {
            void handleAddTiles(tiles);
            const [first] = tiles;
            if (!first) return;
            // A heading stays one line tall at the top of the space it lands in
            const placement =
                first.type === DashboardTileTypes.HEADING
                    ? { ...slot, h: Math.min(first.h, slot.h) }
                    : slot;
            setDashboardTiles((current) =>
                current?.map((tile) =>
                    tile.uuid === first.uuid ? { ...tile, ...placement } : tile,
                ),
            );
        },
        [handleAddTiles, setDashboardTiles],
    );

    const gridLineStyles = useGridStyles({
        ref: gridWrapperRef,
        cols: unzoomedGridProps.cols,
        rowHeight: unzoomedGridProps.rowHeight,
    });

    const canvasStyles = useMemo(
        () =>
            gridLineStyles && {
                ...gridLineStyles,
                '--canvas-bottom-pad': `${dashboardGridBottomPadding}px`,
            },
        [gridLineStyles, dashboardGridBottomPadding],
    );

    // Not getTabUuidsForFilterRules from common: it skips disabled filters,
    // and required filters are disabled until a value is set
    const hasUnmetFilterRequirementsForCurrentTab = useMemo(() => {
        const activeTabTiles =
            dashboardTiles?.filter(
                (tile) => tile.tabUuid === activeTab?.uuid,
            ) ?? [];
        return unmetFilterRequirements.some(
            (requirement) =>
                // If no tabs or single tab, any unmet requirement locks the dashboard
                !tabsEnabled ||
                doesFilterRequirementApplyToTiles(
                    getUnmetFilterRequirementMembers(requirement),
                    activeTabTiles,
                    filterableFieldsByTileUuid,
                ),
        );
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
    const isCanvasFilled =
        isEditErgonomicsEnabled && !!hasDashboardTiles && currentTabHasTiles;
    // An empty tab shows its empty state, not a strip of grid above it
    const isGridDrawn = isEditErgonomicsEnabled
        ? isCanvasFilled
        : showGridLines;

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
                                        <DashboardControlsSummary
                                            isControlsEnabled={
                                                isDashboardControlsEnabled
                                            }
                                            filtersCount={totalFiltersCount}
                                            parametersCount={
                                                totalParametersCount
                                            }
                                            dateZoomLabel={
                                                isDateZoomDisabled ||
                                                isDateZoomRefusedOnAllChartTiles
                                                    ? null
                                                    : isDashboardControlsEnabled &&
                                                        !dateZoomGranularity
                                                      ? // As the bar's button: the name alone with no grain
                                                        ''
                                                      : getDateZoomSummaryLabel(
                                                            dateZoomGranularity,
                                                            getUiString,
                                                        )
                                            }
                                            onExpand={() =>
                                                isVisibilitySetByEditToolbar
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
                                                isVisibilitySetByEditToolbar
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

                    <Group
                        grow
                        pb={isCanvasFilled ? 0 : dashboardGridBottomPadding}
                        px="xs"
                    >
                        <div
                            ref={mergedGridWrapperRef}
                            className={[
                                styles.tabGridContainer,
                                isGridDrawn ? styles.gridLines : undefined,
                                isInteracting
                                    ? styles.gridInteracting
                                    : undefined,
                                isFitToScreenSnapping
                                    ? styles.gridSnapping
                                    : undefined,
                                gridProps.allowOverlap
                                    ? styles.dropShadow
                                    : undefined,
                                settleMode !== null
                                    ? styles.gridSettling
                                    : undefined,
                                settleMode === 'positionAndSize'
                                    ? styles.gridSettlingSize
                                    : undefined,
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            data-edit-canvas={
                                isEditErgonomicsEnabled ? true : undefined
                            }
                            // In view too, so entering edit moves no tile
                            data-grip-room={isEditErgonomicsFlagOn || undefined}
                            data-canvas-background={
                                isEditErgonomicsEnabled
                                    ? canvasBackground
                                    : undefined
                            }
                            data-fill-window={isCanvasFilled || undefined}
                            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                            style={isGridDrawn ? canvasStyles : undefined}
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
                                                  onDragStart={handleDragStart}
                                                  onDrag={handleDrag}
                                                  onDragStop={handleDragStop}
                                                  onResizeStart={
                                                      handleInteractionStart
                                                  }
                                                  onResizeStop={
                                                      handleResizeStop
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
                                              {...gridProps}
                                              onDragStart={handleDragStart}
                                              onDrag={handleDrag}
                                              onDragStop={handleDragStop}
                                              onResizeStart={
                                                  handleInteractionStart
                                              }
                                              onResizeStop={handleResizeStop}
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
                            {isCanvasFilled && (
                                <CanvasAddTile
                                    canvasRef={gridWrapperRef}
                                    layout={activeLayoutOnScreen}
                                    gridScale={gridScale}
                                    isEnabled={
                                        !isInteracting && settleMode === null
                                    }
                                    activeTabUuid={activeTab?.uuid}
                                    dashboardTabs={dashboardTabs}
                                    onNewChart={onNewChart}
                                    onAddTilesToSlot={handleAddTilesToSlot}
                                />
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
