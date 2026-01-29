import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import {
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import {
    IconChartBar,
    IconHeading,
    IconInfoCircle,
    IconMarkdown,
    IconNewSection,
    IconPlus,
    IconVideo,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import useToaster from '../../hooks/toaster/useToaster';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { TileAddModal } from './TileForms/TileAddModal';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    setAddingTab: (value: React.SetStateAction<boolean>) => void;
    activeTabUuid?: string;
    dashboardTabs?: Dashboard['tabs'];
} & Pick<ButtonProps, 'disabled' | 'radius'>;

const AddTileButton: FC<Props> = ({
    onAddTiles,
    setAddingTab,
    disabled,
    activeTabUuid,
    dashboardTabs,
    radius,
}) => {
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState<boolean>(false);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const { storeDashboard } = useDashboardStorage();
    const navigate = useNavigate();
    const { showToastError } = useToaster();
    const { health } = useApp();

    // Calculate current tiles in the active tab
    const currentTabTilesCount = useMemo(() => {
        if (!dashboardTiles) return 0;
        if (!activeTabUuid) return dashboardTiles.length;
        return dashboardTiles.filter((tile) => tile.tabUuid === activeTabUuid)
            .length;
    }, [dashboardTiles, activeTabUuid]);

    // Calculate current number of tabs
    const currentTabsCount = useMemo(() => {
        return dashboardTabs?.length || 0;
    }, [dashboardTabs]);

    // Get limits from health config
    const maxTilesPerTab = health.data?.dashboard?.maxTilesPerTab || 50;
    const maxTabsPerDashboard =
        health.data?.dashboard?.maxTabsPerDashboard || 20;

    // Check if we can add a tile to current tab
    const canAddTile = useMemo(() => {
        return currentTabTilesCount < maxTilesPerTab;
    }, [currentTabTilesCount, maxTilesPerTab]);

    // Check if we can add a new tab
    const canAddTab = useMemo(() => {
        return currentTabsCount < maxTabsPerDashboard;
    }, [currentTabsCount, maxTabsPerDashboard]);

    const onAddTile = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            if (!canAddTile) {
                showToastError({
                    title: 'Tile limit reached',
                    subtitle: `You've reached the maximum of ${maxTilesPerTab} tiles per tab. Consider creating a new tab or dashboard.`,
                });
                return;
            }
            onAddTiles([tile]);
        },
        [onAddTiles, canAddTile, maxTilesPerTab, showToastError],
    );

    const handleAddTab = useCallback(() => {
        if (!canAddTab) {
            showToastError({
                title: 'Tab limit reached',
                subtitle: `You've reached the maximum of ${maxTabsPerDashboard} tabs per dashboard. Consider creating a new dashboard.`,
            });
            return;
        }
        setAddingTab(true);
    }, [canAddTab, maxTabsPerDashboard, showToastError, setAddingTab]);

    const handleAddTileType = useCallback(
        (tileType: DashboardTileTypes) => {
            if (!canAddTile) {
                showToastError({
                    title: 'Tile limit reached',
                    subtitle: `You've reached the maximum of ${maxTilesPerTab} tiles per tab. Consider creating a new tab or dashboard.`,
                });
                return;
            }
            setAddTileType(tileType);
        },
        [canAddTile, maxTilesPerTab, showToastError],
    );

    const handleAddCharts = useCallback(() => {
        if (!canAddTile) {
            showToastError({
                title: 'Tile limit reached',
                subtitle: `You've reached the maximum of ${maxTilesPerTab} tiles per tab. Consider creating a new tab or dashboard.`,
            });
            return;
        }
        setIsAddChartTilesModalOpen(true);
    }, [canAddTile, maxTilesPerTab, showToastError]);
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();

    return (
        <>
            <Menu
                position="bottom"
                withArrow
                withinPortal
                shadow="md"
                width={200}
            >
                <Menu.Target>
                    <Button
                        size="xs"
                        variant="default"
                        radius={radius}
                        disabled={disabled}
                        leftIcon={<MantineIcon icon={IconPlus} />}
                    >
                        Add tile
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>
                        Tiles{' '}
                        {!canAddTile &&
                            `(${currentTabTilesCount}/${maxTilesPerTab} limit reached)`}
                    </Menu.Label>
                    <Menu.Item
                        onClick={handleAddCharts}
                        icon={<MantineIcon icon={IconChartBar} />}
                        disabled={!canAddTile}
                    >
                        Saved chart
                    </Menu.Item>

                    <Menu.Item
                        onClick={() => {
                            if (!canAddTile) {
                                showToastError({
                                    title: 'Tile limit reached',
                                    subtitle: `You've reached the maximum of ${maxTilesPerTab} tiles per tab. Consider creating a new tab or dashboard.`,
                                });
                                return;
                            }
                            storeDashboard(
                                dashboardTiles,
                                dashboardFilters,
                                haveTilesChanged,
                                haveFiltersChanged,
                                dashboard?.uuid,
                                dashboard?.name,
                                activeTabUuid,
                                dashboardTabs,
                            );
                            void navigate(`/projects/${projectUuid}/tables`);
                        }}
                        icon={<MantineIcon icon={IconPlus} />}
                        disabled={!canAddTile}
                    >
                        <Group spacing="xxs">
                            <Text>New chart</Text>
                            <Tooltip label="Charts generated from here are exclusive to this dashboard">
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="ldGray.6"
                                />
                            </Tooltip>
                        </Group>
                    </Menu.Item>

                    <Menu.Item
                        onClick={() =>
                            handleAddTileType(DashboardTileTypes.MARKDOWN)
                        }
                        icon={<MantineIcon icon={IconMarkdown} />}
                        disabled={!canAddTile}
                    >
                        Markdown
                    </Menu.Item>

                    <Menu.Item
                        onClick={() =>
                            handleAddTileType(DashboardTileTypes.LOOM)
                        }
                        icon={<MantineIcon icon={IconVideo} />}
                        disabled={!canAddTile}
                    >
                        Loom video
                    </Menu.Item>

                    <Menu.Divider />

                    <Menu.Label>
                        Elements{' '}
                        {!canAddTab &&
                            `(${currentTabsCount}/${maxTabsPerDashboard} limit reached)`}
                    </Menu.Label>
                    <Menu.Item
                        onClick={handleAddTab}
                        icon={<MantineIcon icon={IconNewSection} />}
                        disabled={!canAddTab}
                    >
                        Tab
                    </Menu.Item>

                    <Menu.Item
                        onClick={() =>
                            handleAddTileType(DashboardTileTypes.HEADING)
                        }
                        icon={<MantineIcon icon={IconHeading} />}
                        disabled={!canAddTile}
                    >
                        Heading
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            {isAddChartTilesModalOpen && (
                <AddChartTilesModal
                    onClose={() => setIsAddChartTilesModalOpen(false)}
                    onAddTiles={onAddTiles}
                    currentTabTilesCount={currentTabTilesCount}
                    maxTilesPerTab={maxTilesPerTab}
                    activeTabUuid={activeTabUuid}
                />
            )}

            {addTileType === DashboardTileTypes.MARKDOWN ||
            addTileType === DashboardTileTypes.LOOM ||
            addTileType === DashboardTileTypes.HEADING ? (
                <TileAddModal
                    opened={!!addTileType}
                    type={addTileType}
                    onClose={() => setAddTileType(undefined)}
                    onConfirm={(tile) => {
                        onAddTile(tile);
                        setAddTileType(undefined);
                    }}
                />
            ) : null}
        </>
    );
};

export default AddTileButton;
