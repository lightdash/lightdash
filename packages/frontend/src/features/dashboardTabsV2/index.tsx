import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import {
    type DashboardTab,
    type DashboardTile,
    type Dashboard as IDashboard,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Button, Divider, Group, Tabs, Text } from '@mantine-8/core';
import {
    IconAdjustmentsHorizontal,
    IconCalendar,
    IconFilter,
    IconPlus,
} from '@tabler/icons-react';
import cloneDeep from 'lodash/cloneDeep';
import { useMemo, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useLocation, useNavigate } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import EmptyStateNoTiles from '../../components/DashboardTiles/EmptyStateNoTiles';
import PinnedParameters from '../../components/PinnedParameters';
import MantineIcon from '../../components/common/MantineIcon';
import { LockedDashboardModal } from '../../components/common/modal/LockedDashboardModal';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { TrackSection } from '../../providers/Tracking/TrackingProvider';
import '../../styles/droppable.css';
import { SectionName } from '../../types/Events';
import DashboardFiltersV2 from '../dashboardFiltersV2';
import { doesFilterApplyToTile } from '../dashboardFiltersV2/FilterConfiguration/utils';
import FilterGroupSeparator from '../dashboardHeader/FilterGroupSeparator';
import { DateZoom } from '../dateZoom';
import { Parameters } from '../parameters';
import { TabAddModal } from './AddTabModal';
import { TabDeleteModal } from './DeleteTabModal';
import DuplicateTabModal from './DuplicateTabModal';
import { TabEditModal } from './EditTabModal';
import GridTile from './GridTile';
import DraggableTab from './Tab';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from './gridUtils';
import styles from './tabs.module.css';

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

const DashboardTabsV2: FC<DashboardTabsProps> = ({
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
    const layouts = useMemo(
        () => ({
            lg:
                dashboardTiles?.map<Layout>((tile) =>
                    getReactGridLayoutConfig(
                        tile,
                        isEditMode,
                        gridProps.cols.lg,
                    ),
                ) ?? [],
            md:
                dashboardTiles?.map<Layout>((tile) =>
                    getReactGridLayoutConfig(
                        tile,
                        isEditMode,
                        gridProps.cols.md,
                    ),
                ) ?? [],
            sm:
                dashboardTiles?.map<Layout>((tile) =>
                    getReactGridLayoutConfig(
                        tile,
                        isEditMode,
                        gridProps.cols.sm,
                    ),
                ) ?? [],
        }),
        [dashboardTiles, isEditMode, gridProps],
    );

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
    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );

    // tabs state
    const [isEditingTab, setEditingTab] = useState<boolean>(false);
    const [isDeletingTab, setDeletingTab] = useState<boolean>(false);
    const [isDuplicatingTab, setDuplicatingTab] = useState<boolean>(false);
    const [tabToDuplicate, setTabToDuplicate] = useState<DashboardTab | null>(
        null,
    );

    const defaultTab = dashboardTabs?.[0];
    // Context: We don't want to show the "tabs mode" if there is only one tab in state
    // This is because the tabs mode is only useful when there are multiple tabs
    const sortedTabs =
        dashboardTabs.length > 1
            ? dashboardTabs?.sort((a, b) => a.order - b.order)
            : [];
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

    const sortedTiles = dashboardTiles?.sort((a, b) => {
        if (a.y === b.y) {
            // If 'y' is the same, sort by 'x'
            return a.x - b.x;
        } else {
            // Otherwise, sort by 'y'
            return a.y - b.y;
        }
    });

    const isActiveTile = (tile: DashboardTile) => {
        const tileBelongsToActiveTab = tile.tabUuid === activeTab?.uuid; // tiles belongs to current tab
        const defaultTabOrFirstTabActived =
            activeTab?.uuid === defaultTab?.uuid ||
            activeTab?.uuid === sortedTabs?.[0]?.uuid;
        const tileHasStaleTabReference =
            !dashboardTabs?.some((tab) => tab.uuid === tile.tabUuid) &&
            defaultTabOrFirstTabActived; // tile des not belong to any tab and display it on default tab
        return (
            !tabsEnabled || tileBelongsToActiveTab || tileHasStaleTabReference
        );
    };

    const currentTabHasTiles = !!sortedTiles?.some((tile) =>
        isActiveTile(tile),
    );

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

    const handleAddTab = (name: string) => {
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
                const duplicatedTiles = tilesToDuplicate.map((tile) => ({
                    ...tile,
                    uuid: uuid4(),
                    tabUuid: newTab.uuid,
                }));

                // Directly add tiles to the dashboard without using handleAddTiles
                // to avoid automatic assignment to current active tab
                setDashboardTiles((currentTiles) => [
                    ...(currentTiles ?? []),
                    ...duplicatedTiles,
                ]);
                setHaveTilesChanged(true);
            }
        }
        setDuplicatingTab(false);
        setTabToDuplicate(null);
    };
    const MAGIC_SCROLL_AREA_HEIGHT = 100;

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
                                    list: styles.list,
                                    tab: styles.tab,
                                }}
                                h={MAGIC_SCROLL_AREA_HEIGHT}
                                mt={tabsEnabled ? undefined : 'xs'}
                            >
                                {sortedTabs && sortedTabs?.length > 0 && (
                                    <Tabs.List px="lg" mb="xs">
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
                                                handleDeleteTab={
                                                    handleDeleteTab
                                                }
                                                handleDuplicateTab={
                                                    handleDuplicateTab
                                                }
                                                setDeletingTab={setDeletingTab}
                                            />
                                        ))}

                                        {provided.placeholder}

                                        {isEditMode && (
                                            <Button
                                                ml="sm"
                                                size="sm"
                                                fz={13}
                                                variant="subtle"
                                                flex="0 0 auto"
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
                                        )}
                                    </Tabs.List>
                                )}

                                <div>
                                    <Group
                                        justify="apart"
                                        align="flex-start"
                                        wrap="nowrap"
                                        px="lg"
                                        pt="sm"
                                    >
                                        {/* This Group will take up remaining space (and not push DateZoom) */}
                                        <Group
                                            justify="apart"
                                            align="flex-start"
                                            wrap="nowrap"
                                            grow
                                            style={{
                                                overflow: 'auto',
                                            }}
                                        >
                                            {hasTilesThatSupportFilters && (
                                                <Group
                                                    align="flex-start"
                                                    gap="xs"
                                                >
                                                    <FilterGroupSeparator
                                                        icon={IconFilter}
                                                        tooltipLabel={
                                                            <div>
                                                                <Text
                                                                    fw={500}
                                                                    fz="xs"
                                                                >
                                                                    Filters
                                                                </Text>

                                                                <Text fz="xs">
                                                                    Refine your
                                                                    dashboard by
                                                                    choosing
                                                                    which data
                                                                    to see.
                                                                </Text>
                                                            </div>
                                                        }
                                                    />
                                                    <DashboardFiltersV2
                                                        isEditMode={isEditMode}
                                                        activeTabUuid={
                                                            activeTab?.uuid
                                                        }
                                                    />
                                                </Group>
                                            )}
                                        </Group>

                                        {hasDashboardTiles &&
                                            Object.keys(parameters).length >
                                                0 && (
                                                <Group gap="xs">
                                                    <Divider orientation="vertical" />

                                                    <FilterGroupSeparator
                                                        icon={
                                                            IconAdjustmentsHorizontal
                                                        }
                                                        tooltipLabel={
                                                            <div>
                                                                <Text
                                                                    fw={500}
                                                                    fz="xs"
                                                                >
                                                                    Parameters
                                                                </Text>

                                                                <Text fz="xs">
                                                                    Adjust
                                                                    preset
                                                                    inputs that
                                                                    change how
                                                                    the
                                                                    dashboard's
                                                                    numbers are
                                                                    calculated.
                                                                </Text>
                                                            </div>
                                                        }
                                                    />

                                                    <Parameters
                                                        isEditMode={isEditMode}
                                                        parameterValues={
                                                            parameterValues
                                                        }
                                                        onParameterChange={
                                                            onParameterChange
                                                        }
                                                        onClearAll={
                                                            onParameterClearAll
                                                        }
                                                        parameters={parameters}
                                                        isLoading={
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
                                                    />
                                                    <PinnedParameters
                                                        isEditMode={isEditMode}
                                                    />
                                                </Group>
                                            )}

                                        {/* DateZoom section will adjust width dynamically */}
                                        {hasDashboardTiles && (
                                            <Group
                                                gap="xs"
                                                style={{ marginLeft: 'auto' }}
                                            >
                                                <Divider orientation="vertical" />

                                                <FilterGroupSeparator
                                                    icon={IconCalendar}
                                                    tooltipLabel={
                                                        <div>
                                                            <Text
                                                                fw={500}
                                                                fz="xs"
                                                            >
                                                                Date Zoom
                                                            </Text>

                                                            <Text fz="xs">
                                                                Quickly change
                                                                the date
                                                                granularity of
                                                                charts.
                                                            </Text>
                                                        </div>
                                                    }
                                                />
                                                <DateZoom
                                                    isEditMode={isEditMode}
                                                />
                                            </Group>
                                        )}
                                    </Group>
                                </div>

                                <Group
                                    grow
                                    pt={tabsEnabled ? 'sm' : undefined}
                                    pb="lg"
                                    px="xs"
                                >
                                    <ResponsiveGridLayout
                                        {...gridProps}
                                        className={`${
                                            hasRequiredFiltersForCurrentTab
                                                ? 'locked'
                                                : ''
                                        }`}
                                        onDragStop={handleUpdateTiles}
                                        onResizeStop={handleUpdateTiles}
                                        onWidthChange={(cw) => setGridWidth(cw)}
                                        layouts={layouts}
                                        key={
                                            activeTab?.uuid ?? defaultTab?.uuid
                                        }
                                    >
                                        {sortedTiles?.map((tile, idx) => {
                                            if (
                                                isActiveTile(tile) // If tile belongs to active tab
                                            ) {
                                                return (
                                                    <div key={tile.uuid}>
                                                        <TrackSection
                                                            name={
                                                                SectionName.DASHBOARD_TILE
                                                            }
                                                        >
                                                            <GridTile
                                                                locked={
                                                                    hasRequiredFiltersForCurrentTab
                                                                }
                                                                index={idx}
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
                                                );
                                            }
                                        })}
                                    </ResponsiveGridLayout>
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
                                <TabAddModal
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
        </DragDropContext>
    );
};

export default DashboardTabsV2;
