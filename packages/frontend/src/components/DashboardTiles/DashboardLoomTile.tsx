import {
    Button,
    Card,
    Divider,
    H5,
    Menu,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { DashboardLoomTile } from 'common';
import React, { FC } from 'react';

type Props = {
    tile: DashboardLoomTile;
    onDelete: () => void;
};

const LoomTile: FC<Props> = ({
    tile: {
        properties: { title, url },
    },
    onDelete,
}) => (
    <Card style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 20,
            }}
        >
            <H5 style={{ margin: 0 }}>{title}</H5>
            <Popover2
                className="non-draggable"
                content={
                    <Menu>
                        <MenuItem
                            icon="delete"
                            intent="danger"
                            text="Remove tile"
                            onClick={onDelete}
                        />
                    </Menu>
                }
                position={PopoverPosition.BOTTOM_RIGHT}
                lazy
            >
                <Tooltip2 content="Tile configuration">
                    <Button minimal icon="more" />
                </Tooltip2>
            </Popover2>
        </div>
        <Divider />
        <iframe
            title={title}
            src="https://www.loom.com/embed/b2d3f4a1182c4e319bafd7eb384a72c0"
            frameBorder="0"
            allowFullScreen
            style={{
                flex: 1,
            }}
        />
    </Card>
);
export default LoomTile;
