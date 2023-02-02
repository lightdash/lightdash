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
import TileUpdateModal from '../TileForms/TileUpdateModal';
import {
    ButtonsWrapper,
    ChartContainer,
    HeaderContainer,
    HeaderWrapper,
    TileBaseWrapper,
    Title,
    TitleButton,
    TitleWrapper,
    TooltipContent,
} from './TileBase.styles';

type Props<T> = {
    isEditMode: boolean;
    title: string;
    clickableTitle: boolean;
    titleHref?: string;
    description?: string;
    hasDescription: boolean;
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
    hasDescription,
    clickableTitle,
    titleHref,
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
                    {!hideTitle && description && clickableTitle ? (
                        <Tooltip2
                            content={
                                <TooltipContent>{description}</TooltipContent>
                            }
                            position="bottom-left"
                        >
                            <TitleButton href={titleHref} target="_blank">
                                <TitleWrapper hasDescription={hasDescription}>
                                    <Title className="non-draggable">
                                        {title}
                                    </Title>
                                </TitleWrapper>
                            </TitleButton>
                        </Tooltip2>
                    ) : !hideTitle && clickableTitle ? (
                        <TitleButton href={titleHref} target="_blank">
                            <TitleWrapper hasDescription={hasDescription}>
                                <Title className="non-draggable">{title}</Title>
                            </TitleWrapper>
                        </TitleButton>
                    ) : !hideTitle && description ? (
                        <Tooltip2
                            content={
                                <TooltipContent>{description}</TooltipContent>
                            }
                            position="bottom-left"
                        >
                            <TitleWrapper hasDescription={true}>
                                <Title className="non-draggable">{title}</Title>
                            </TitleWrapper>
                        </Tooltip2>
                    ) : !hideTitle ? (
                        <TitleWrapper hasDescription={hasDescription}>
                            <Title className="non-draggable">{title}</Title>
                        </TitleWrapper>
                    ) : null}
                </HeaderWrapper>
                <ButtonsWrapper>
                    {extraHeaderElement}
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
                                                text="Edit tile content"
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

            <TileUpdateModal
                isOpen={isEditing}
                tile={tile}
                onClose={() => setIsEditing(false)}
                onConfirm={(data) => {
                    onEdit(data);
                    setIsEditing(false);
                }}
            />
        </TileBaseWrapper>
    );
};

TileBase.defaultProps = {
    isLoading: false,
    extraMenuItems: null,
    description: null,
    hasDescription: false,
    hasFilters: false,
};

export default TileBase;
