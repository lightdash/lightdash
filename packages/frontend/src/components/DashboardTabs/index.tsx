import {
    assertUnreachable,
    DashboardTileTypes,
    type Dashboard as IDashboard,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Menu, Tabs } from '@mantine/core';
import { useProfiler } from '@sentry/react';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { memo, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useHistory } from 'react-router-dom';
import { useIntersection } from 'react-use';
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
import ChartTile from '../DashboardTiles/DashboardChartTile';
import LoomTile from '../DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../DashboardTiles/DashboardMarkdownTile';
import EmptyStateNoTiles from '../DashboardTiles/EmptyStateNoTiles';
import TileBase from '../DashboardTiles/TileBase';
import { TabAddModal } from './AddTabModal';
import { TabDeleteModal } from './DeleteTabModal';
import { TabEditModal } from './EditTabModal';

const ResponsiveGridLayout = WidthProvider(Responsive);

const GridTile: FC<
    Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > & {
        isLazyLoadEnabled: boolean;
        index: number;
        tabs?: DashboardTab[];
        onAddTiles: (tiles: IDashboard['tiles'][number][]) => Promise<void>;
        locked: boolean;
    }
> = memo((props) => {
    const { tile, isLazyLoadEnabled, index } = props;
    useProfiler(`Dashboard-${tile.type}`);
    const [isTiledViewed, setIsTiledViewed] = useState(false);
    const ref = useRef(null);
    const intersection = useIntersection(ref, {
        root: null,
        threshold: 0.3,
    });
    useEffect(() => {
        if (intersection?.isIntersecting) {
            setIsTiledViewed(true);
        }
    }, [intersection]);

    if (isLazyLoadEnabled && !isTiledViewed) {
        setTimeout(() => {
            setIsTiledViewed(true);
            // Prefetch tile sequentially, even if it's not in view
        }, index * 1000);
        return (
            <Box ref={ref} h="100%">
                <TileBase isLoading {...props} title={''} />
            </Box>
        );
    }

    if (props.locked) {
        return (
            <Box ref={ref} h="100%">
                <TileBase isLoading={false} title={''} {...props} />
            </Box>
        );
    }

    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return <ChartTile {...props} tile={tile} />;
        case DashboardTileTypes.MARKDOWN:
            return <MarkdownTile {...props} tile={tile} />;
        case DashboardTileTypes.LOOM:
            return <LoomTile {...props} tile={tile} />;
        default: {
            return assertUnreachable(
                tile,
                `Dashboard tile type "${props.tile.type}" not recognised`,
            );
        }
    }
});

type DashboardTabsProps = {
    isEditMode: boolean;
    hasRequiredDashboardFiltersToSet: boolean;
    addingTab: boolean;
    isLazyLoadEnabled: boolean;
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
    isLazyLoadEnabled,
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

    const currentTabHasTiles = sortedTiles?.some((tile) => isActiveTile(tile));

    const handleAddTab = (name: string) => {
        if (name) {
            const newTabs = dashboardTabs ? [...dashboardTabs] : [];
            if (!dashboardTabs?.length) {
                const firstTab = {
                    name: 'Default',
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
        <Tabs
            value={activeTab?.uuid}
            onTabChange={(e) => {
                const tab = sortedTabs?.find((t) => t.uuid === e);
                if (tab) {
                    setActiveTab(tab);
                }
                if (!isEditMode) {
                    history.replace(
                        `/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${tab?.uuid}`,
                    );
                }
            }}
        >
            {sortedTabs && sortedTabs?.length > 0 && (
                <Group
                    w="100%"
                    noWrap
                    position="apart"
                    spacing="xs"
                    style={
                        (sortedTabs && sortedTabs.length > 0) || isEditMode
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
                                <Tabs.Tab key={idx} value={tab.uuid} mx="md">
                                    <Group>
                                        {tab.name}
                                        {tab === activeTab && isEditMode ? (
                                            <Menu
                                                position="bottom"
                                                withArrow
                                                withinPortal
                                                shadow="md"
                                                width={200}
                                            >
                                                <Menu.Target>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        size="xs"
                                                    >
                                                        <MantineIcon
                                                            icon={IconPencil}
                                                        />
                                                    </ActionIcon>
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item
                                                        onClick={() =>
                                                            setEditingTab(true)
                                                        }
                                                    >
                                                        Rename Tab
                                                    </Menu.Item>
                                                    {sortedTabs.length === 1 ? (
                                                        <Menu.Item
                                                            onClick={() =>
                                                                handleDeleteTab(
                                                                    tab.uuid,
                                                                )
                                                            }
                                                        >
                                                            Remove Tab
                                                            Components
                                                        </Menu.Item>
                                                    ) : (
                                                        <Menu.Item
                                                            onClick={() =>
                                                                setDeletingTab(
                                                                    true,
                                                                )
                                                            }
                                                        >
                                                            Remove Tab
                                                        </Menu.Item>
                                                    )}
                                                </Menu.Dropdown>
                                            </Menu>
                                        ) : null}
                                    </Group>
                                </Tabs.Tab>
                            );
                        })}
                    </Tabs.List>
                    {isEditMode && (
                        <Group>
                            <Button
                                size="xs"
                                variant="default"
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setAddingTab(true)}
                            >
                                Add new tab
                            </Button>
                        </Group>
                    )}
                </Group>
            )}
            <ResponsiveGridLayout
                {...getResponsiveGridLayoutProps()}
                className={`react-grid-layout-dashboard ${
                    hasRequiredDashboardFiltersToSet ? 'locked' : ''
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
                                <TrackSection name={SectionName.DASHBOARD_TILE}>
                                    <GridTile
                                        locked={
                                            hasRequiredDashboardFiltersToSet
                                        }
                                        isLazyLoadEnabled={
                                            isLazyLoadEnabled ?? true
                                        }
                                        index={idx}
                                        isEditMode={isEditMode}
                                        tile={tile}
                                        onDelete={handleDeleteTile}
                                        onEdit={handleEditTile}
                                        tabs={dashboardTabs}
                                        onAddTiles={handleAddTiles}
                                    />
                                </TrackSection>
                            </div>
                        );
                    }
                })}
            </ResponsiveGridLayout>

            <LockedDashboardModal
                opened={hasRequiredDashboardFiltersToSet && !!hasDashboardTiles}
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
                        opened={isDeletingTab && dashboardTabs.length > 1}
                        onDeleteTab={(uuid) => {
                            handleDeleteTab(uuid);
                        }}
                    />
                </>
            )}
        </Tabs>
    );
};

export default DashboardTabs;
