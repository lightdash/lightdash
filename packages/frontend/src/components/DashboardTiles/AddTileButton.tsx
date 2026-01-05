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
import { useCallback, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useDashboardUIPreference } from '../../hooks/dashboard/useDashboardUIPreference';
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
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();
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
                    <Menu.Label>Tiles</Menu.Label>
                    <Menu.Item
                        onClick={() => setIsAddChartTilesModalOpen(true)}
                        icon={<MantineIcon icon={IconChartBar} />}
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
                        icon={<MantineIcon icon={IconPlus} />}
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
                            setAddTileType(DashboardTileTypes.MARKDOWN)
                        }
                        icon={<MantineIcon icon={IconMarkdown} />}
                    >
                        Markdown
                    </Menu.Item>

                    <Menu.Item
                        onClick={() => setAddTileType(DashboardTileTypes.LOOM)}
                        icon={<MantineIcon icon={IconVideo} />}
                    >
                        Loom video
                    </Menu.Item>

                    <Menu.Divider />

                    <Menu.Label>Elements</Menu.Label>
                    <Menu.Item
                        onClick={() => setAddingTab(true)}
                        icon={<MantineIcon icon={IconNewSection} />}
                    >
                        Tab
                    </Menu.Item>

                    {isDashboardRedesignEnabled && (
                        <Menu.Item
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.HEADING)
                            }
                            icon={<MantineIcon icon={IconHeading} />}
                        >
                            Heading
                        </Menu.Item>
                    )}
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
