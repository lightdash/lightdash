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
import { TileModal } from '../TileForms/TileModal';
import { ChartHeaderWrapper, FilterLabel } from './TileBase.styles';

type Props<T> = {
    isEditMode: boolean;
    title: string;
    tile: T;
    isLoading?: boolean;
    extraMenuItems?: React.ReactNode;
    onDelete: (tile: T) => void;
    onEdit: (tile: T) => void;
    children: ReactNode;
    isChart?: boolean;
    hasFilters?: boolean;
};

const TileBase = <T extends Dashboard['tiles'][number]>({
    isEditMode,
    title,
    tile,
    isLoading,
    extraMenuItems,
    onDelete,
    onEdit,
    children,
    isChart,
    hasFilters,
}: Props<T>) => {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <Card
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
            }}
            className={isLoading ? Classes.SKELETON : undefined}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 20,
                }}
            >
                <ChartHeaderWrapper>
                    <H5 style={{ margin: 0 }} className="non-draggable">
                        {title}
                    </H5>
                    {hasFilters && (
                        <FilterLabel>Dashboard filter applied</FilterLabel>
                    )}
                </ChartHeaderWrapper>
                {(isEditMode || (!isEditMode && extraMenuItems)) && (
                    <Popover2
                        className="non-draggable"
                        content={
                            <Menu>
                                {extraMenuItems}
                                {isEditMode && extraMenuItems && (
                                    <MenuDivider />
                                )}
                                {isEditMode && (
                                    <>
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
                                            onClick={() => onDelete(tile)}
                                        />
                                    </>
                                )}
                            </Menu>
                        }
                        position={PopoverPosition.BOTTOM_RIGHT}
                        lazy
                    >
                        <Tooltip2 content="Tile configuration">
                            <Button minimal icon="more" />
                        </Tooltip2>
                    </Popover2>
                )}
            </div>
            {!isChart && <Divider />}
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
    isChart: false,
    hasFilters: false,
};

export default TileBase;
