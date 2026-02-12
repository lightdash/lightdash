import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import {
    type DashboardTab,
    type DashboardTile,
    type Dashboard as IDashboard,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Button, Group, Tabs, Tooltip } from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
import { produce } from 'immer';
import cloneDeep from 'lodash/cloneDeep';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useLocation, useNavigate } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import EmptyStateNoTiles from '../../components/DashboardTiles/EmptyStateNoTiles';
import { DASHBOARD_HEADER_HEIGHT } from '../../components/common/Dashboard/dashboard.constants';
import MantineIcon from '../../components/common/MantineIcon';
import { ScrollToTop } from '../../components/common/ScrollToTop';
import { StickyWithDetection } from '../../components/common/StickyWithDetection';
import { LockedDashboardModal } from '../../components/common/modal/LockedDashboardModal';
import useToaster from '../../hooks/toaster/useToaster';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { TrackSection } from '../../providers/Tracking/TrackingProvider';
import '../../styles/droppable.css';
import { SectionName } from '../../types/Events';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { DashboardFiltersBarSummary } from '../dashboardFilters/DashboardFiltersBarSummary';
import { doesFilterApplyToTile } from '../dashboardFilters/FilterConfiguration/utils';
import { AddTabModal } from './AddTabModal';
import { TabDeleteModal } from './DeleteTabModal';
import DuplicateTabModal from './DuplicateTabModal';
import { TabEditModal } from './EditTabModal';
import GridTile from './GridTile';
import DraggableTab from './Tab';
import {
    convertLayoutToBaseCoordinates,
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
    GRID_CONTAINER_PADDING,
} from './gridUtils';
import styles from './tabs.module.css';
import { useGridStyles } from './useGridStyles';

const ResponsiveGridLayout = WidthProvider(Responsive);

type DashboardTabsProps = {
    isEditMode: boolean;
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

    // parameters
    hasTilesThatSupportFilters: boolean;
    parameterValues: ParametersValuesMap;
    parameters: {
        [k: string]: LightdashProjectParameter;
    };
    isParameterLoading: boolean;
    missingRequiredParameters: string[];
    pinnedParameters: string[];
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onParameterClearAll: () => void;
    onParameterPin: (parameterKey: string) => void;
};

const DashboardTabs: FC<DashboardTabsProps> = ({
    isEditMode,
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
    // parameters
    hasTilesThatSupportFilters,
    parameterValues,
    parameters,
    isParameterLoading,
    missingRequiredParameters,
    pinnedParameters,
    onParameterChange,
    onParameterClearAll,
    onParameterPin,
}) => {
    const gridProps = getResponsiveGridLayoutProps();
    const [currentCols, setCurrentCols] = useState(gridProps.cols.lg);
    const { showToastError } = useToaster();
    const { health } = useApp();

    // Track which tabs have been visited so we can lazily mount their
    // grids on first visit, then keep them alive (hidden) for instant
    // switching back. This avoids an API storm from mounting all tabs
    // at once while still making revisits instant.
    const [visitedTabUuids, setVisitedTabUuids] = useState<Set<string>>(
        () => new Set(activeTab?.uuid ? [activeTab.uuid] : []),
    );
    useEffect(() => {
        if (activeTab?.uuid) {
            setVisitedTabUuids((prev) => {
                if (prev.has(activeTab.uuid)) return prev;
                return new Set(prev).add(activeTab.uuid);
            });
        }
    }, [activeTab?.uuid]);

    // When switching back to a previously-visited tab, its grid was
    // hidden with `display: none` and WidthProvider skips resize events
    // for hidden containers. Dispatch a synthetic resize so the grid
    // re-measures its width after becoming visible again.
    useEffect(() => {
        if (activeTab?.uuid) {
            window.dispatchEvent(new Event('resize'));
        }
    }, [activeTab?.uuid]);

    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [isInteracting, setIsInteracting] = useState(false);

    const gridLineStyles = useGridStyles({ ref: gridWrapperRef });

    const showGridLines = isEditMode && isInteracting;

    const handleUpdateTilesWithScaling = async (layout: Layout[]) => {
        const unscaledLayout = convertLayoutToBaseCoordinates(
            layout,
            currentCols,
        );
        await handleUpdateTiles(unscaledLayout);
    };

    // Group tiles and layouts by tab for per-tab grid rendering.
    // Each tab gets its own ResponsiveGridLayout so tab switching
    // is just CSS display toggling — no React mount/unmount work.
    const tilesByTab = useMemo(() => {
        const grouped = new Map<
            string,
            {
                tiles: DashboardTile[];
                layouts: { lg: Layout[]; md: Layout[]; sm: Layout[] };
            }
        >();
        if (!dashboardTiles) return grouped;

        for (const tile of dashboardTiles) {
            const tabKey = tile.tabUuid ?? '__default__';
            if (!grouped.has(tabKey)) {
                grouped.set(tabKey, {
                    tiles: [],
                    layouts: { lg: [], md: [], sm: [] },
                });
            }
            const group = grouped.get(tabKey)!;
            group.tiles.push(tile);
            group.layouts.lg.push(
                getReactGridLayoutConfig(tile, isEditMode, gridProps.cols.lg),
            );
            group.layouts.md.push(
                getReactGridLayoutConfig(tile, isEditMode, gridProps.cols.md),
            );
            group.layouts.sm.push(
                getReactGridLayoutConfig(tile, isEditMode, gridProps.cols.sm),
            );
        }

        // Sort tiles within each group
        for (const group of grouped.values()) {
            group.tiles.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
        }

        return grouped;
    }, [dashboardTiles, isEditMode, gridProps]);

    const { search } = useLocation();
    const navigate = useNavigate();

    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );

    // filters bar state
    const [isFiltersCollapsed, setIsFiltersCollapsed] =
        useState<boolean>(false);

    const [isHeaderStuck, setIsHeaderStuck] = useState<boolean>(false);

    // tabs state
    const [isEditingTab, setEditingTab] = useState<boolean>(false);
    const [isDeletingTab, setDeletingTab] = useState<boolean>(false);
    const [isDuplicatingTab, setDuplicatingTab] = useState<boolean>(false);
    const [tabToDuplicate, setTabToDuplicate] = useState<DashboardTab | null>(
        null,
    );

    // Context: We don't want to show the "tabs mode" if there is only one tab in state
    // This is because the tabs mode is only useful when there are multiple tabs
    const sortedTabs = dashboardTabs.length > 1 ? dashboardTabs : [];
    const hasDashboardTiles = dashboardTiles && dashboardTiles.length > 0;
    const tabsEnabled = dashboardTabs && dashboardTabs.length > 1;

    // Compute whether there are required filters that apply to the current tab
    // Note: We use doesFilterApplyToTile because getTabUuidsForFilterRules from common
    // skips disabled filters, but required filters ARE disabled until a value is set
    const hasRequiredFiltersForCurrentTab = useMemo(() => {
        // If no required filters, no locking needed
        if (requiredDashboardFilters.length === 0) {
            return false;
        }

        // If no tabs or single tab, use original behavior (check all required filters)
        if (!tabsEnabled) {
            return requiredDashboardFilters.length > 0;
        }

        // For each required filter, check if it applies to any tile on the current tab
        return requiredDashboardFilters.some((requiredFilter) => {
            // Find the full filter rule to get tileTargets
            const filterRule = dashboardFilters.dimensions.find(
                (f) => f.id === requiredFilter.id,
            );
            if (!filterRule) return false;

            // If no tileTargets configuration, filter applies to all tiles
            // So it applies to the current tab
            if (!filterRule.tileTargets) {
                return true;
            }

            // Check if any tile on the current tab is targeted by this filter
            return (
                dashboardTiles?.some((tile) => {
                    // Check if tile is on current tab
                    if (tile.tabUuid !== activeTab?.uuid) return false;

                    // Use shared utility to check if filter applies to this tile
                    return doesFilterApplyToTile(
                        filterRule,
                        tile,
                        filterableFieldsByTileUuid,
                    );
                }) ?? false
            );
        });
    }, [
        requiredDashboardFilters,
        tabsEnabled,
        dashboardTiles,
        dashboardFilters.dimensions,
        activeTab?.uuid,
        filterableFieldsByTileUuid,
    ]);

    const activeTabTiles = useMemo(() => {
        if (!activeTab?.uuid) return tilesByTab.get('__default__')?.tiles;
        return tilesByTab.get(activeTab.uuid)?.tiles;
    }, [tilesByTab, activeTab?.uuid]);

    const activeTabParameters = useMemo(() => {
        if (!activeTabTiles) return parameters;

        const activeParamKeys = activeTabTiles.flatMap(
            (tile) => tileParameterReferences[tile.uuid] ?? [],
        );

        return Object.fromEntries(
            Object.entries(parameters).filter(([key]) =>
                activeParamKeys.includes(key),
            ),
        );
    }, [activeTabTiles, parameters, tileParameterReferences]);

    // Collapsed summary values
    const totalFiltersCount =
        dashboardFilters.dimensions.length +
        dashboardTemporaryFilters.dimensions.length;
    const totalParametersCount = Object.keys(activeTabParameters).length;

    const currentTabHasTiles = !!activeTabTiles && activeTabTiles.length > 0;

    const handleChangeTab = (tab: DashboardTab) => {
        const newParams = new URLSearchParams(search);
        // Change tabs by navigating to the new tab
        // the provider sets the active tab based on the URL
        void navigate(
            {
                pathname: isEditMode
                    ? `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit/tabs/${tab?.uuid}`
                    : `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${tab?.uuid}`,
                search: newParams.toString(),
            },
            { replace: true },
        );
    };

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
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
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
            }
        }
        setDuplicatingTab(false);
        setTabToDuplicate(null);
    };

    return (
        <DragDropContext
            onDragEnd={(result) => {
                if (!result.destination) {
                    return;
                }
                const newTabs = cloneDeep(sortedTabs); // avoid mutating tab objects
                const [reorderedTab] = newTabs.splice(result.source.index, 1);
                newTabs.splice(result.destination.index, 0, reorderedTab);
                newTabs.forEach((tab, idx) => {
                    tab.order = idx;
                });
                setDashboardTabs(newTabs);
                setHaveTabsChanged(true);
            }}
        >
            <Droppable droppableId="dashboard-tabs" direction="horizontal">
                {(provided) => (
                    <>
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            <Tabs
                                value={activeTab?.uuid}
                                onChange={(e) => {
                                    const tab = sortedTabs?.find(
                                        (t) => t.uuid === e,
                                    );
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
                                    offset={
                                        isEditMode ? DASHBOARD_HEADER_HEIGHT : 0
                                    }
                                    onStuckChange={setIsHeaderStuck}
                                >
                                    <div
                                        className={styles.stickyTabsAndFilters}
                                        data-has-header-above={isEditMode}
                                        data-is-stuck={isHeaderStuck}
                                    >
                                        {sortedTabs &&
                                            sortedTabs?.length > 0 && (
                                                <Tabs.List px="lg">
                                                    {sortedTabs.map(
                                                        (tab, idx) => (
                                                            <DraggableTab
                                                                key={tab.uuid}
                                                                idx={idx}
                                                                tab={tab}
                                                                isEditMode={
                                                                    isEditMode
                                                                }
                                                                sortedTabs={
                                                                    sortedTabs
                                                                }
                                                                currentTabHasTiles={
                                                                    currentTabHasTiles
                                                                }
                                                                setEditingTab={
                                                                    setEditingTab
                                                                }
                                                                handleDeleteTab={
                                                                    handleDeleteTab
                                                                }
                                                                handleDuplicateTab={
                                                                    handleDuplicateTab
                                                                }
                                                                setDeletingTab={
                                                                    setDeletingTab
                                                                }
                                                            />
                                                        ),
                                                    )}

                                                    {provided.placeholder}

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
                                                                size="sm"
                                                                fz={13}
                                                                variant="subtle"
                                                                flex="0 0 auto"
                                                                disabled={
                                                                    !canAddTab
                                                                }
                                                                leftSection={
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconPlus
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() =>
                                                                    setAddingTab(
                                                                        true,
                                                                    )
                                                                }
                                                            >
                                                                New tab
                                                            </Button>
                                                        </Tooltip>
                                                    )}
                                                </Tabs.List>
                                            )}

                                        {/* Filters bar - collapsed or expanded view */}
                                        <div className={styles.filtersBar}>
                                            {isFiltersCollapsed &&
                                            !isEditMode ? (
                                                <DashboardFiltersBarSummary
                                                    filtersCount={
                                                        totalFiltersCount
                                                    }
                                                    parametersCount={
                                                        totalParametersCount
                                                    }
                                                    dateZoomLabel={
                                                        isDateZoomDisabled
                                                            ? null
                                                            : dateZoomGranularity ||
                                                              'Default'
                                                    }
                                                    onExpand={() =>
                                                        setIsFiltersCollapsed(
                                                            false,
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <DashboardFiltersBar
                                                    isEditMode={isEditMode}
                                                    activeTabUuid={
                                                        activeTab?.uuid
                                                    }
                                                    hasTilesThatSupportFilters={
                                                        hasTilesThatSupportFilters
                                                    }
                                                    hasDashboardTiles={
                                                        !!hasDashboardTiles
                                                    }
                                                    parameters={
                                                        activeTabParameters
                                                    }
                                                    parameterValues={
                                                        parameterValues
                                                    }
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
                                                    pinnedParameters={
                                                        pinnedParameters
                                                    }
                                                    onParameterPin={
                                                        onParameterPin
                                                    }
                                                    isDateZoomDisabled={
                                                        isDateZoomDisabled
                                                    }
                                                    onCollapse={() =>
                                                        setIsFiltersCollapsed(
                                                            true,
                                                        )
                                                    }
                                                />
                                            )}
                                        </div>
                                    </div>
                                </StickyWithDetection>

                                <Group grow pb={60} px="xs">
                                    <div
                                        ref={gridWrapperRef}
                                        className={[
                                            showGridLines
                                                ? styles.gridLines
                                                : undefined,
                                            isInteracting
                                                ? styles.gridInteracting
                                                : undefined,
                                        ]
                                            .filter(Boolean)
                                            .join(' ')}
                                        style={
                                            showGridLines
                                                ? gridLineStyles
                                                : undefined
                                        }
                                    >
                                        {tabsEnabled
                                            ? /* Render one grid per visited tab, hide inactive with CSS.
                                                 Tabs are lazily mounted on first visit to avoid an API
                                                 storm, then kept alive for instant switching back. */
                                              dashboardTabs.map((tab) => {
                                                  const isActive =
                                                      tab.uuid ===
                                                      activeTab?.uuid;
                                                  if (
                                                      !isActive &&
                                                      !visitedTabUuids.has(
                                                          tab.uuid,
                                                      )
                                                  )
                                                      return null;

                                                  const group = tilesByTab.get(
                                                      tab.uuid,
                                                  );

                                                  return (
                                                      <div
                                                          key={tab.uuid}
                                                          style={
                                                              isActive
                                                                  ? undefined
                                                                  : {
                                                                        display:
                                                                            'none',
                                                                    }
                                                          }
                                                      >
                                                          <ResponsiveGridLayout
                                                              {...gridProps}
                                                              className={`${
                                                                  hasRequiredFiltersForCurrentTab &&
                                                                  isActive
                                                                      ? 'locked'
                                                                      : ''
                                                              }`}
                                                              containerPadding={
                                                                  GRID_CONTAINER_PADDING
                                                              }
                                                              onDragStart={() =>
                                                                  setIsInteracting(
                                                                      true,
                                                                  )
                                                              }
                                                              onDragStop={(
                                                                  layout,
                                                              ) => {
                                                                  setIsInteracting(
                                                                      false,
                                                                  );
                                                                  void handleUpdateTilesWithScaling(
                                                                      layout,
                                                                  );
                                                              }}
                                                              onResizeStart={() =>
                                                                  setIsInteracting(
                                                                      true,
                                                                  )
                                                              }
                                                              onResizeStop={(
                                                                  layout,
                                                              ) => {
                                                                  setIsInteracting(
                                                                      false,
                                                                  );
                                                                  void handleUpdateTilesWithScaling(
                                                                      layout,
                                                                  );
                                                              }}
                                                              onBreakpointChange={(
                                                                  _,
                                                                  cols,
                                                              ) => {
                                                                  setCurrentCols(
                                                                      cols,
                                                                  );
                                                              }}
                                                              onWidthChange={(
                                                                  cw,
                                                              ) =>
                                                                  setGridWidth(
                                                                      cw,
                                                                  )
                                                              }
                                                              layouts={
                                                                  group?.layouts ?? {
                                                                      lg: [],
                                                                      md: [],
                                                                      sm: [],
                                                                  }
                                                              }
                                                          >
                                                              {group?.tiles.map(
                                                                  (
                                                                      tile,
                                                                      idx,
                                                                  ) => (
                                                                      <div
                                                                          key={
                                                                              tile.uuid
                                                                          }
                                                                      >
                                                                          <TrackSection
                                                                              name={
                                                                                  SectionName.DASHBOARD_TILE
                                                                              }
                                                                          >
                                                                              <GridTile
                                                                                  locked={
                                                                                      hasRequiredFiltersForCurrentTab &&
                                                                                      isActive
                                                                                  }
                                                                                  index={
                                                                                      idx
                                                                                  }
                                                                                  isEditMode={
                                                                                      isEditMode
                                                                                  }
                                                                                  tile={
                                                                                      tile
                                                                                  }
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
                                                                  ),
                                                              )}
                                                          </ResponsiveGridLayout>
                                                      </div>
                                                  );
                                              })
                                            : /* No tabs — single grid with all tiles */
                                              (() => {
                                                  const allTiles = [
                                                      ...(tilesByTab.get(
                                                          '__default__',
                                                      )?.tiles ?? []),
                                                      ...Array.from(
                                                          tilesByTab.entries(),
                                                      )
                                                          .filter(
                                                              ([k]) =>
                                                                  k !==
                                                                  '__default__',
                                                          )
                                                          .flatMap(
                                                              ([, v]) =>
                                                                  v.tiles,
                                                          ),
                                                  ];
                                                  const allLayouts = {
                                                      lg: allTiles.map((tile) =>
                                                          getReactGridLayoutConfig(
                                                              tile,
                                                              isEditMode,
                                                              gridProps.cols.lg,
                                                          ),
                                                      ),
                                                      md: allTiles.map((tile) =>
                                                          getReactGridLayoutConfig(
                                                              tile,
                                                              isEditMode,
                                                              gridProps.cols.md,
                                                          ),
                                                      ),
                                                      sm: allTiles.map((tile) =>
                                                          getReactGridLayoutConfig(
                                                              tile,
                                                              isEditMode,
                                                              gridProps.cols.sm,
                                                          ),
                                                      ),
                                                  };
                                                  return (
                                                      <ResponsiveGridLayout
                                                          {...gridProps}
                                                          className={`${
                                                              hasRequiredFiltersForCurrentTab
                                                                  ? 'locked'
                                                                  : ''
                                                          }`}
                                                          containerPadding={
                                                              GRID_CONTAINER_PADDING
                                                          }
                                                          onDragStart={() =>
                                                              setIsInteracting(
                                                                  true,
                                                              )
                                                          }
                                                          onDragStop={(
                                                              layout,
                                                          ) => {
                                                              setIsInteracting(
                                                                  false,
                                                              );
                                                              void handleUpdateTilesWithScaling(
                                                                  layout,
                                                              );
                                                          }}
                                                          onResizeStart={() =>
                                                              setIsInteracting(
                                                                  true,
                                                              )
                                                          }
                                                          onResizeStop={(
                                                              layout,
                                                          ) => {
                                                              setIsInteracting(
                                                                  false,
                                                              );
                                                              void handleUpdateTilesWithScaling(
                                                                  layout,
                                                              );
                                                          }}
                                                          onBreakpointChange={(
                                                              _,
                                                              cols,
                                                          ) => {
                                                              setCurrentCols(
                                                                  cols,
                                                              );
                                                          }}
                                                          onWidthChange={(cw) =>
                                                              setGridWidth(cw)
                                                          }
                                                          layouts={allLayouts}
                                                      >
                                                          {allTiles.map(
                                                              (tile, idx) => (
                                                                  <div
                                                                      key={
                                                                          tile.uuid
                                                                      }
                                                                  >
                                                                      <TrackSection
                                                                          name={
                                                                              SectionName.DASHBOARD_TILE
                                                                          }
                                                                      >
                                                                          <GridTile
                                                                              locked={
                                                                                  hasRequiredFiltersForCurrentTab
                                                                              }
                                                                              index={
                                                                                  idx
                                                                              }
                                                                              isEditMode={
                                                                                  isEditMode
                                                                              }
                                                                              tile={
                                                                                  tile
                                                                              }
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
                                                              ),
                                                          )}
                                                      </ResponsiveGridLayout>
                                                  );
                                              })()}
                                    </div>
                                </Group>
                                <LockedDashboardModal
                                    opened={
                                        hasRequiredFiltersForCurrentTab &&
                                        !!hasDashboardTiles
                                    }
                                />
                                {(!hasDashboardTiles ||
                                    !currentTabHasTiles) && (
                                    <EmptyStateNoTiles
                                        onAddTiles={handleAddTiles}
                                        emptyContainerType={
                                            dashboardTabs &&
                                            dashboardTabs.length
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
                                            onClose={() =>
                                                setDeletingTab(false)
                                            }
                                            opened={
                                                isDeletingTab &&
                                                dashboardTabs?.length > 1
                                            }
                                            onDeleteTab={(uuid) => {
                                                handleDeleteTab(uuid);
                                            }}
                                            onMoveTile={handleEditTile}
                                        />
                                    </>
                                )}
                            </Tabs>
                        </div>
                    </>
                )}
            </Droppable>

            <ScrollToTop show={isHeaderStuck} />
        </DragDropContext>
    );
};

export default DashboardTabs;
