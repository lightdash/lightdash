import {
    Button,
    Intent,
    Menu,
    MenuDivider,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import AddChartTilesModal from './TileForms/AddChartTilesModal';
import { AddTileModal } from './TileForms/TileModal';

type Props = {
    onAddTiles?: (tiles: Dashboard['tiles'][number][]) => void;
    intent?: Intent;
    popoverPosition?: PopoverPosition;
};

const AddTileButton: FC<Props> = ({ onAddTiles, intent, popoverPosition }) => {
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    const [isAddChartTilesModalOpen, setIsAddChartTilesModalOpen] =
        useState<boolean>(false);
    const onAddTile = useCallback(
        (tile: Dashboard['tiles'][number]) => {
            if (onAddTiles) {
                onAddTiles([tile]);
            }
        },
        [onAddTiles],
    );
    return (
        <>
            <Popover2
                className="non-draggable"
                content={
                    <Menu>
                        <MenuItem2
                            icon="chart"
                            text="Saved chart"
                            onClick={() => setIsAddChartTilesModalOpen(true)}
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
                    icon="plus"
                    style={{ marginLeft: '10px' }}
                    text="Add tile"
                    intent={intent ? intent : 'none'}
                />
            </Popover2>
            {isAddChartTilesModalOpen && (
                <AddChartTilesModal
                    onClose={() => setIsAddChartTilesModalOpen(false)}
                    onAddTiles={onAddTiles!}
                />
            )}
            {addTileType && (
                <AddTileModal
                    onClose={() => setAddTileType(undefined)}
                    type={addTileType}
                    onAddTile={onAddTile}
                />
            )}
        </>
    );
};

export default AddTileButton;
