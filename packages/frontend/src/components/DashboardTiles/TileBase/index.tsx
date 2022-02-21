import {
    Button,
    Classes,
    Divider,
    Menu,
    MenuDivider,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard } from 'common';
import React, { ReactNode, useState } from 'react';
import { TileModal } from '../TileForms/TileModal';
import {
    ChartContainer,
    HeaderContainer,
    HeaderWrapper,
    TileBaseWrapper,
    Title,
} from './TileBase.styles';

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
    extraHeaderElement?: React.ReactNode;
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
    extraHeaderElement,
}: Props<T>) => {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <TileBaseWrapper className={isLoading ? Classes.SKELETON : undefined}>
            <HeaderContainer>
                <HeaderWrapper>
                    <Title className="non-draggable">{title}</Title>
                    {extraHeaderElement}
                </HeaderWrapper>
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
            </HeaderContainer>
            {!isChart && <Divider />}
            <ChartContainer className="non-draggable">
                {children}
            </ChartContainer>
            {isEditing && (
                <TileModal
                    onClose={() => setIsEditing(false)}
                    tile={tile}
                    onSubmit={onEdit}
                />
            )}
        </TileBaseWrapper>
    );
};

TileBase.defaultProps = {
    isLoading: false,
    extraMenuItems: null,
    isChart: false,
    hasFilters: false,
};

export default TileBase;
