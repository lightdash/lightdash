import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import {
    DashboardTileTypes,
    type Dashboard as IDashboard,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Group, Tabs } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import cloneDeep from 'lodash/cloneDeep';
import { useMemo, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useHistory, useLocation } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from '../../pages/Dashboard';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { TrackSection } from '../../providers/TrackingProvider';
import { SectionName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { LockedDashboardModal } from '../common/modal/LockedDashboardModal';
import EmptyStateNoTiles from '../DashboardTiles/EmptyStateNoTiles';
import { TabAddModal } from './AddTabModal';
import { TabDeleteModal } from './DeleteTabModal';
import { TabEditModal } from './EditTabModal';
import GridTile from './GridTile';
import DraggableTab from './Tab';

const ResponsiveGridLayout = WidthProvider(Responsive);

type DashboardTabsProps = {
    isEditMode: boolean;
    hasRequiredDashboardFiltersToSet: boolean;
    addingTab: boolean;
    dashboardTiles: DashboardTile[] | undefined;
    activeTab: DashboardTab | undefined;
    handleAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
    handleUpdateTiles: (layout: Layout[]) => Promise<void>;
    handleDeleteTile: (tile: IDashboard['tiles'][number]) => Promise<void>;
    handleBatchDeleteTiles: (tile: IDashboard['tiles'][number][]) => void;
    handleEditTile: (tiles: IDashboard['tiles'][number]) => void;
    setActiveTab: (
        value: React.SetStateAction<DashboardTab | undefined>,
    ) => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    setGridWidth: (value: React.SetStateAction<number>) => void;
};

const DashboardTabs: FC<DashboardTabsProps> = ({
    isEditMode,
    hasRequiredDashboardFiltersToSet,
    addingTab,
    dashboardTiles,
    activeTab,
    setActiveTab,
    handleAddTiles,
    handleUpdateTiles,
    handleDeleteTile,
    handleBatchDeleteTiles,
    handleEditTile,
    setGridWidth,
    setAddingTab,
}) => {
    const layouts = useMemo(
        () => ({
            lg:
                dashboardTiles?.map<Layout>((tile) =>
                    getReactGridLayoutConfig(tile, isEditMode),
                ) ?? [],
        }),
        [dashboardTiles, isEditMode],
    );

    const { search } = useLocation();
    const history = useHistory();

    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);

    // tabs state
    const [isEditingTab, setEditingTab] = useState<boolean>(false);
    const [isDeletingTab, setDeletingTab] = useState<boolean>(false);

    const defaultTab = dashboardTabs?.[0];
    const sortedTabs = dashboardTabs?.sort((a, b) => a.order - b.order);
    const hasDashboardTiles = dashboardTiles && dashboardTiles.length > 0;
    const tabsEnabled = dashboardTabs && dashboardTabs.length > 0;

    const sortedTiles = dashboardTiles
        ?.sort((a, b) => {
            if (a.y === b.y) {
                // If 'y' is the same, sort by 'x'
                return a.x - b.x;
            } else {
                // Otherwise, sort by 'y'
                return a.y - b.y;
            }
        })
        .concat({
            uuid: '3c13e0f8-7a7c-49ce-a15b-b56d4e838beb',
            x: 0,
            y: 0,
            h: 10,
            w: 11,
            tabUuid: null,
            type: DashboardTileTypes.SQL_CHART,
            properties: {
                title: '',
                hideTitle: false,
                savedChartUuid: '10d34f57-d868-4f64-8775-f988dd736738',
                belongsToDashboard: false,
                chartName: 'SQL chart',
                lastVersionChartKind: 'table',
                fileUrl:
                    'http://localhost:3000/api/v1/projects/3675b69e-8324-4110-bdca-059031aa8da3/sqlRunner/results/_tO81BMLlFxeOCY3-56MH',
            },
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
                dashboardTiles?.forEach((tile) => {
                    tile.tabUuid = firstTab.uuid; // move all tiles to default tab
                });
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
            setActiveTab(newTab);
            setHaveTabsChanged(true);
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
                (tab) => tab.uuid !== tabUuid,
            );
            return newTabs;
        });
        if (activeTab?.uuid === tabUuid) {
            setActiveTab(
                dashboardTabs.filter((tab) => tab.uuid !== tabUuid)?.[0],
            );
        }
        setHaveTabsChanged(true);
        setDeletingTab(false);

        if (dashboardTabs.length === 1) {
            dashboardTiles?.forEach((tile) => {
                tile.tabUuid = undefined; // set tab uuid back to null to avoid foreign key constraint error
            });
            return; // keep all tiles if its the last tab
        }

        const tilesToDelete = dashboardTiles?.filter(
            (tile) => tile.tabUuid == tabUuid,
        );
        if (tilesToDelete) {
            handleBatchDeleteTiles(tilesToDelete);
        }
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
            <Droppable droppableId="tabs" direction="horizontal">
                {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef}>
                        <Tabs
                            value={activeTab?.uuid}
                            onTabChange={(e) => {
                                const tab = sortedTabs?.find(
                                    (t) => t.uuid === e,
                                );
                                if (tab) {
                                    setActiveTab(tab);
                                }
                                if (!isEditMode) {
                                    const newParams = new URLSearchParams(
                                        search,
                                    );
                                    history.replace({
                                        pathname: `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${tab?.uuid}`,
                                        search: newParams.toString(),
                                    });
                                }
                            }}
                            style={{
                                paddingTop: 5,
                            }}
                        >
                            {sortedTabs && sortedTabs?.length > 0 && (
                                <Group
                                    w="100%"
                                    noWrap
                                    position="apart"
                                    spacing="xs"
                                    style={
                                        (sortedTabs && sortedTabs.length > 0) ||
                                        isEditMode
                                            ? {
                                                  background: 'white',
                                                  padding: 5,
                                                  borderRadius: 3,
                                              }
                                            : undefined
                                    }
                                >
                                    <Tabs.List>
                                        {sortedTabs?.map((tab, idx) => {
                                            return (
                                                <DraggableTab
                                                    key={tab.uuid}
                                                    idx={idx}
                                                    tab={tab}
                                                    isEditMode={isEditMode}
                                                    sortedTabs={sortedTabs}
                                                    currentTabHasTiles={
                                                        currentTabHasTiles
                                                    }
                                                    setEditingTab={
                                                        setEditingTab
                                                    }
                                                    handleDeleteTab={
                                                        handleDeleteTab
                                                    }
                                                    setDeletingTab={
                                                        setDeletingTab
                                                    }
                                                />
                                            );
                                        })}
                                        {provided.placeholder}
                                        {isEditMode && (
                                            <Group>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    leftIcon={
                                                        <MantineIcon
                                                            icon={IconPlus}
                                                        />
                                                    }
                                                    onClick={() =>
                                                        setAddingTab(true)
                                                    }
                                                    style={{
                                                        borderWidth: 0,
                                                    }}
                                                >
                                                    Add
                                                </Button>
                                            </Group>
                                        )}
                                    </Tabs.List>
                                </Group>
                            )}
                            <ResponsiveGridLayout
                                {...getResponsiveGridLayoutProps()}
                                className={`react-grid-layout-dashboard ${
                                    hasRequiredDashboardFiltersToSet
                                        ? 'locked'
                                        : ''
                                }`}
                                onDragStop={handleUpdateTiles}
                                onResizeStop={handleUpdateTiles}
                                onWidthChange={(cw) => setGridWidth(cw)}
                                layouts={layouts}
                                key={activeTab?.uuid ?? defaultTab?.uuid}
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
                                                            hasRequiredDashboardFiltersToSet
                                                        }
                                                        index={idx}
                                                        isEditMode={isEditMode}
                                                        tile={tile}
                                                        onDelete={
                                                            handleDeleteTile
                                                        }
                                                        onEdit={handleEditTile}
                                                        tabs={dashboardTabs}
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

                            <LockedDashboardModal
                                opened={
                                    hasRequiredDashboardFiltersToSet &&
                                    !!hasDashboardTiles
                                }
                            />
                            {(!hasDashboardTiles || !currentTabHasTiles) && (
                                <EmptyStateNoTiles
                                    onAddTiles={handleAddTiles}
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
                            <TabAddModal
                                onClose={() => setAddingTab(false)}
                                opened={addingTab}
                                onConfirm={(name) => {
                                    handleAddTab(name);
                                }}
                            />
                            {activeTab && (
                                <>
                                    <TabEditModal
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
                                        onClose={() => setDeletingTab(false)}
                                        opened={
                                            isDeletingTab &&
                                            dashboardTabs?.length > 1
                                        }
                                        onDeleteTab={(uuid) => {
                                            handleDeleteTab(uuid);
                                        }}
                                    />
                                </>
                            )}
                        </Tabs>
                    </div>
                )}
            </Droppable>
        </DragDropContext>
    );
};

export default DashboardTabs;
