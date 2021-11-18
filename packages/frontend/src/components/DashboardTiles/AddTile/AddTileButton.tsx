import { Button, Menu, MenuItem, PopoverPosition } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from 'common';
import React, { FC, useState } from 'react';
import AddTileModal from './AddTileModal';

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
                            text="Saved chart tile"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.SAVED_CHART)
                            }
                        />
                        <MenuItem
                            text="Markdown tile"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.MARKDOWN)
                            }
                        />
                        <MenuItem
                            text="Loom video tile"
                            onClick={() =>
                                setAddTileType(DashboardTileTypes.LOOM)
                            }
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_RIGHT}
                lazy
            >
                <Button style={{ marginLeft: '10px' }} text="Add chart" />
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
