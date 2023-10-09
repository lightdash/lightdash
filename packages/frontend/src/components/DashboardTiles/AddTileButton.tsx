import { Menu, MenuDivider, PopoverPosition } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from '@lightdash/common';
import { Button, ButtonProps, Group, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useDashboardContext } from '../../providers/DashboardProvider';
import MantineIcon from '../common/MantineIcon';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { TileAddModal } from './TileForms/TileAddModal';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    popoverPosition?: PopoverPosition;
} & Pick<ButtonProps, 'disabled'>;

const AddTileButton: FC<Props> = ({
    onAddTiles,
    popoverPosition,
    disabled,
}) => {
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState<boolean>(false);

    const {
        dashboardTiles,
        dashboardFilters,
        haveTilesChanged,
        haveFiltersChanged,
        dashboard,
    } = useDashboardContext();

    const { storeDashboard } = useDashboardStorage();
    const history = useHistory();

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
                                storeDashboard(
                                    dashboardTiles,
                                    dashboardFilters,
                                    haveTilesChanged,
                                    haveFiltersChanged,
                                    dashboard?.uuid,
                                    dashboard?.name,
                                );
                                history.push(`/projects/${projectUuid}/tables`);
                            }}
                        />
                        <MenuDivider />

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
                    size="xs"
                    variant="default"
                    disabled={disabled}
                    leftIcon={<MantineIcon icon={IconPlus} />}
                >
                    Add tile
                </Button>
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
