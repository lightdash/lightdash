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
import { DashboardMarkdownTile } from 'common';
import Markdown from 'markdown-to-jsx';
import React, { FC } from 'react';

type Props = {
    tile: DashboardMarkdownTile;
    onDelete: () => void;
};

const MarkdownTile: FC<Props> = ({
    tile: {
        properties: { title, content },
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
        <div style={{ flex: 1, overflow: 'auto' }}>
            <Markdown
                options={{
                    overrides: {
                        a: {
                            props: {
                                target: '_blank',
                            },
                        },
                    },
                }}
            >
                {content}
            </Markdown>
        </div>
    </Card>
);

export default MarkdownTile;
