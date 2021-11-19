import {
    Button,
    Card,
    Classes,
    Divider,
    H5,
    Menu,
    MenuDivider,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard } from 'common';
import React, { ReactNode, useState } from 'react';
import { TileModal } from './TileForms/TileModal';

type Props<T> = {
    title: string;
    tile: T;
    isLoading?: boolean;
    extraMenuItems?: React.ReactNode;
    onDelete: () => void;
    onEdit: (tile: T) => void;
    children: ReactNode;
};

const TileBase = <T extends Dashboard['tiles'][number]>({
    title,
    tile,
    isLoading,
    extraMenuItems,
    onDelete,
    onEdit,
    children,
}: Props<T>) => {
    const [isEditing, setIsEditing] = useState(false);
    return (
        <Card
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            className={isLoading ? Classes.SKELETON : undefined}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 20,
                }}
            >
                <H5 style={{ margin: 0 }} className="non-draggable">
                    {title}
                </H5>
                <Popover2
                    className="non-draggable"
                    content={
                        <Menu>
                            {extraMenuItems}
                            <MenuItem
                                icon="edit"
                                text="Edit tile"
                                onClick={() => setIsEditing(true)}
                            />
                            <MenuDivider />
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
            <div
                style={{ flex: 1, overflow: 'auto', display: 'flex' }}
                className="non-draggable"
            >
                {children}
            </div>
            {isEditing && (
                <TileModal
                    onClose={() => setIsEditing(false)}
                    tile={tile}
                    onSubmit={onEdit}
                />
            )}
        </Card>
    );
};

TileBase.defaultProps = {
    isLoading: false,
    extraMenuItems: null,
};

export default TileBase;
