import {
    Button,
    Classes,
    Menu,
    MenuDivider,
    MenuItem,
    PopoverPosition,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard } from '@lightdash/common';
import React, { ReactNode, useState } from 'react';
import { TileModal } from '../TileForms/TileModal';
import {
    ChartContainer,
    HeaderContainer,
    HeaderWrapper,
    TileBaseWrapper,
    Title,
    TitleWrapper,
} from './TileBase.styles';

type Props<T> = {
    isEditMode: boolean;
    title: string;
    description?: string;
    tile: T;
    isLoading?: boolean;
    extraMenuItems?: React.ReactNode;
    onDelete: (tile: T) => void;
    onEdit: (tile: T) => void;
    children: ReactNode;
    extraHeaderElement?: React.ReactNode;
};

const TileBase = <T extends Dashboard['tiles'][number]>({
    isEditMode,
    title,
    description,
    tile,
    isLoading,
    extraMenuItems,
    onDelete,
    onEdit,
    children,
    extraHeaderElement,
}: Props<T>) => {
    const [isEditing, setIsEditing] = useState(false);

    return (
        <TileBaseWrapper className={isLoading ? Classes.SKELETON : undefined}>
            <HeaderContainer>
                <HeaderWrapper>
                    <TitleWrapper>
                        <Title className="non-draggable">{title}</Title>
                        {description && (
                            <Tooltip2 content={description} position="bottom">
                                <Button icon="info-sign" minimal />
                            </Tooltip2>
                        )}
                    </TitleWrapper>
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

            <ChartContainer className="non-draggable cohere-block">
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
    description: null,
    hasFilters: false,
};

export default TileBase;
