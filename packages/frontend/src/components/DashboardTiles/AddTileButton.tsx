import { DashboardTileTypes, type Dashboard } from '@lightdash/common';
import {
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine-8/core';
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
    const { health } = useApp();

    // Calculate current tiles in the active tab
    const currentTabTilesCount = useMemo(() => {
        if (!dashboardTiles) return 0;
        if (!activeTabUuid) return dashboardTiles.length;
        return dashboardTiles.filter((tile) => tile.tabUuid === activeTabUuid)
            .length;
    }, [dashboardTiles, activeTabUuid]);

    // Get limits from health config
    const maxTilesPerTab = health.data?.dashboard?.maxTilesPerTab || 50;

    // Check if we can add a tile to current tab
    const canAddTile = useMemo(() => {
        return currentTabTilesCount < maxTilesPerTab;
    }, [currentTabTilesCount, maxTilesPerTab]);

    const onAddTile = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            onAddTiles([tile]);
        },
        [onAddTiles],
    );
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
                    <Tooltip
                        label={
                            !canAddTile
                                ? `Maximum ${maxTilesPerTab} tiles per tab. Consider creating a new tab or dashboard.`
                                : undefined
                        }
                        disabled={canAddTile}
                    >
                        <Button
                            size="xs"
                            variant="default"
                            radius={radius}
                            disabled={disabled || !canAddTile}
                            leftSection={<MantineIcon icon={IconPlus} />}
                        >
                            Add tile
                        </Button>
                    </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Tiles</Menu.Label>
                    <Menu.Item
                        onClick={() => setIsAddChartTilesModalOpen(true)}
                        leftSection={<MantineIcon icon={IconChartBar} />}
                    >
                        Saved chart
                    </Menu.Item>

                    <Menu.Item
                        onClick={() => {
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
                        leftSection={<MantineIcon icon={IconPlus} />}
                    >
                        <Group gap="xxs">
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
                            setAddTileType(DashboardTileTypes.MARKDOWN)
                        }
                        leftSection={<MantineIcon icon={IconMarkdown} />}
                    >
                        Markdown
                    </Menu.Item>

                    <Menu.Item
                        onClick={() => setAddTileType(DashboardTileTypes.LOOM)}
                        leftSection={<MantineIcon icon={IconVideo} />}
                    >
                        Loom video
                    </Menu.Item>

                    <Menu.Divider />

                    <Menu.Label>Elements</Menu.Label>
                    <Menu.Item
                        onClick={() => setAddingTab(true)}
                        leftSection={<MantineIcon icon={IconNewSection} />}
                    >
                        Tab
                    </Menu.Item>

                    <Menu.Item
                        onClick={() =>
                            setAddTileType(DashboardTileTypes.HEADING)
                        }
                        leftSection={<MantineIcon icon={IconHeading} />}
                    >
                        Heading
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            {isAddChartTilesModalOpen && (
                <AddChartTilesModal
                    onClose={() => setIsAddChartTilesModalOpen(false)}
                    onAddTiles={onAddTiles}
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
