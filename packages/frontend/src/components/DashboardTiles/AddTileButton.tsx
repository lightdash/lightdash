import {
    Button,
    Intent,
    Menu,
    MenuDivider,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from '@lightdash/common';
import { Group, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useDashboardContext } from '../../providers/DashboardProvider';
import MantineIcon from '../common/MantineIcon';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { TileAddModal } from './TileForms/TileAddModal';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    intent?: Intent;
    popoverPosition?: PopoverPosition;
};

const AddTileButton: FC<Props> = ({ onAddTiles, intent, popoverPosition }) => {
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState<boolean>(false);
    const onAddTile = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            onAddTiles([tile]);
        },
        [onAddTiles],
    );
    const { projectUuid } = useParams<{
        projectUuid: string;
    }>();
    const { dashboard, dashboardTiles } = useDashboardContext();
    const history = useHistory();

    return (
        <>
            <Popover2
                className="non-draggable"
                content={
                    <Menu>
                        <MenuItem2
                            icon="timeline-line-chart"
                            text="Saved chart"
                            onClick={() => setIsAddChartTilesModalOpen(true)}
                        />

                        <MenuDivider />

                        {localStorage.getItem('CHARTS_IN_DASHBOARDS') && (
                            <>
                                <MenuItem2
                                    icon="series-add"
                                    text={
                                        <Group spacing="xxs">
                                            <Text>New chart</Text>
                                            <Tooltip label="Charts generated from here are exclusive to this dashboard">
                                                <MantineIcon
                                                    icon={IconInfoCircle}
                                                    color="gray.6"
                                                />
                                            </Tooltip>
                                        </Group>
                                    }
                                    onClick={() => {
                                        sessionStorage.setItem(
                                            'fromDashboard',
                                            dashboard?.name ?? '',
                                        );
                                        sessionStorage.setItem(
                                            'dashboardUuid',
                                            dashboard?.uuid ?? '',
                                        );
                                        sessionStorage.setItem(
                                            'unsavedDashboardTiles',
                                            JSON.stringify(dashboardTiles),
                                        );
                                        history.push(
                                            `/projects/${projectUuid}/tables`,
                                        );
                                    }}
                                />
                                <MenuDivider />
                            </>
                        )}

                        <MenuItem2
                            icon="new-text-box"
                            text="Markdown"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.MARKDOWN)
                            }
                        />

                        <MenuDivider />

                        <MenuItem2
                            icon="mobile-video"
                            text="Loom video"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.LOOM)
                            }
                        />
                    </Menu>
                }
                position={
                    popoverPosition
                        ? popoverPosition
                        : PopoverPosition.BOTTOM_RIGHT
                }
                lazy
            >
                <Button
                    icon="plus"
                    text="Add tile"
                    intent={intent ? intent : 'none'}
                />
            </Popover2>

            {isAddChartTilesModalOpen && (
                <AddChartTilesModal
                    onClose={() => setIsAddChartTilesModalOpen(false)}
                    onAddTiles={onAddTiles}
                />
            )}

            <TileAddModal
                isOpen={!!addTileType}
                type={addTileType}
                onClose={() => setAddTileType(undefined)}
                onConfirm={(tile) => {
                    onAddTile(tile);
                    setAddTileType(undefined);
                }}
            />
        </>
    );
};

export default AddTileButton;
