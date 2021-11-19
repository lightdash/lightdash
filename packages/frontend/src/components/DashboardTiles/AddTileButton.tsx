import {
    Button,
    Menu,
    MenuDivider,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from 'common';
import React, { FC, useState } from 'react';
import { AddTileModal } from './TileForms/TileModal';

type Props = {
    onAddTile: (tile: Dashboard['tiles'][number]) => void;
};

const AddTileButton: FC<Props> = ({ onAddTile }) => {
    const [addTileType, setAddTileType] = useState<DashboardTileTypes>();
    return (
        <>
            <Popover2
                className="non-draggable"
                content={
                    <Menu>
                        <MenuItem
                            icon="chart"
                            text="Saved chart"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.SAVED_CHART)
                            }
                        />
                        <MenuDivider />
                        <MenuItem
                            icon="new-text-box"
                            text="Markdown"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.MARKDOWN)
                            }
                        />
                        <MenuDivider />
                        <MenuItem
                            icon="mobile-video"
                            text="Loom video"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.LOOM)
                            }
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_RIGHT}
                lazy
            >
                <Button
                    icon="plus"
                    style={{ marginLeft: '10px' }}
                    text="Add tile"
                />
            </Popover2>
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
