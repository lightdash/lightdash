import {
    Button,
    Classes,
    Menu,
    MenuDivider,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from '@lightdash/common';
import React, { ReactNode, useState } from 'react';
import { TileModal } from '../TileForms/TileModal';
import {
    ButtonsWrapper,
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
    const [isHovering, setIsHovering] = useState(false);

    const hideTitle =
        tile.type !== DashboardTileTypes.MARKDOWN
            ? tile.properties.hideTitle
            : false;
    return (
        <TileBaseWrapper
            className={isLoading ? Classes.SKELETON : undefined}
            isEditMode={isEditMode}
            isHovering={isHovering}
        >
            <HeaderContainer
                isEditMode={isEditMode}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                <HeaderWrapper>
                    {!hideTitle && (
                        <TitleWrapper>
                            <Title className="non-draggable">{title}</Title>
                        </TitleWrapper>
                    )}
                    {extraHeaderElement}
                </HeaderWrapper>
                <ButtonsWrapper>
                    {description && (
                        <Tooltip2 content={description} position="bottom">
                            <Button icon="info-sign" minimal />
                        </Tooltip2>
                    )}
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
                                            <MenuItem2
                                                icon="edit"
                                                text="Edit tile"
                                                onClick={() =>
                                                    setIsEditing(true)
                                                }
                                            />
                                            {tile.type !==
                                                DashboardTileTypes.MARKDOWN && (
                                                <MenuItem2
                                                    icon={
                                                        hideTitle
                                                            ? 'eye-open'
                                                            : 'eye-off'
                                                    }
                                                    text={`${
                                                        hideTitle
                                                            ? 'Show'
                                                            : 'Hide'
                                                    } title`}
                                                    onClick={() =>
                                                        onEdit({
                                                            ...tile,
                                                            properties: {
                                                                ...tile.properties,
                                                                hideTitle:
                                                                    !hideTitle,
                                                            },
                                                        })
                                                    }
                                                />
                                            )}
                                            <MenuDivider />
                                            <MenuItem2
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
                            <Button minimal icon="more" />
                        </Popover2>
                    )}
                </ButtonsWrapper>
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
