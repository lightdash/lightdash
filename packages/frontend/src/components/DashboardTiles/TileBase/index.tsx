import {
    Button,
    Classes,
    Menu,
    MenuDivider,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from '@lightdash/common';
import { Transition } from '@mantine/core';
import { mergeRefs, useHover, useToggle } from '@mantine/hooks';
import React, { ReactNode, useState } from 'react';
import TileUpdateModal from '../TileForms/TileUpdateModal';
import {
    ButtonsWrapper,
    ChartContainer,
    HeaderContainer,
    TileBaseWrapper,
    TileTitleLink,
    TitleWrapper,
    TooltipContent,
} from './TileBase.styles';

type Props<T> = {
    isEditMode: boolean;
    title: string;
    titleHref?: string;
    description?: string;
    tile: T;
    isLoading?: boolean;
    extraMenuItems?: React.ReactNode;
    onDelete: (tile: T) => void;
    onEdit: (tile: T) => void;
    children?: ReactNode;
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
    titleHref,
}: Props<T>) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const { hovered: containerHovered, ref: containerRef } = useHover();
    const { hovered: titleHovered, ref: titleRef } = useHover();
    const [isMenuOpen, toggleMenu] = useToggle([false, true]);

    const hideTitle =
        tile.type !== DashboardTileTypes.MARKDOWN
            ? tile.properties.hideTitle
            : false;

    return (
        <TileBaseWrapper
            className={isLoading ? Classes.SKELETON : undefined}
            ref={containerRef}
            $isEditMode={isEditMode}
            $isHovering={isHovering}
        >
            {!isLoading && (
                <>
                    <HeaderContainer
                        $isEditMode={isEditMode}
                        onMouseEnter={() => setIsHovering(true)}
                        onMouseLeave={() => setIsHovering(false)}
                    >
                        <Tooltip2
                            disabled={!description}
                            content={
                                <TooltipContent>{description}</TooltipContent>
                            }
                            position="top-left"
                            renderTarget={({ ref: tooltipRef, ...props }) => (
                                <TitleWrapper
                                    ref={mergeRefs(tooltipRef, titleRef)}
                                    $hovered={titleHovered}
                                >
                                    {!hideTitle ? (
                                        <TileTitleLink
                                            href={titleHref}
                                            $hovered={titleHovered}
                                            target="_blank"
                                            {...props}
                                            className="non-draggable"
                                        >
                                            {title}
                                        </TileTitleLink>
                                    ) : null}
                                </TitleWrapper>
                            )}
                        />

                        {!isMenuOpen && titleHovered ? null : (
                            <Transition
                                mounted={containerHovered || isMenuOpen}
                                transition="fade"
                                duration={150}
                            >
                                {(styles) => (
                                    <ButtonsWrapper
                                        className="non-draggable"
                                        style={styles}
                                    >
                                        {extraHeaderElement}
                                        {(isEditMode ||
                                            (!isEditMode &&
                                                extraMenuItems)) && (
                                            <Popover2
                                                onOpened={() =>
                                                    toggleMenu(true)
                                                }
                                                onClosed={() =>
                                                    toggleMenu(false)
                                                }
                                                content={
                                                    <Menu>
                                                        {extraMenuItems}
                                                        {isEditMode &&
                                                            extraMenuItems && (
                                                                <MenuDivider />
                                                            )}
                                                        {isEditMode && (
                                                            <>
                                                                <MenuItem2
                                                                    icon="edit"
                                                                    text="Edit tile content"
                                                                    onClick={() =>
                                                                        setIsEditing(
                                                                            true,
                                                                        )
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
                                                                            onEdit(
                                                                                {
                                                                                    ...tile,
                                                                                    properties:
                                                                                        {
                                                                                            ...tile.properties,
                                                                                            hideTitle:
                                                                                                !hideTitle,
                                                                                        },
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                )}
                                                                <MenuDivider />
                                                                <MenuItem2
                                                                    icon="delete"
                                                                    intent="danger"
                                                                    text="Remove tile"
                                                                    onClick={() =>
                                                                        onDelete(
                                                                            tile,
                                                                        )
                                                                    }
                                                                />
                                                            </>
                                                        )}
                                                    </Menu>
                                                }
                                                position={
                                                    PopoverPosition.BOTTOM_RIGHT
                                                }
                                                lazy
                                            >
                                                <Button
                                                    minimal
                                                    small
                                                    icon="more"
                                                />
                                            </Popover2>
                                        )}
                                    </ButtonsWrapper>
                                )}
                            </Transition>
                        )}
                    </HeaderContainer>
                    <ChartContainer className="non-draggable sentry-block fs-block cohere-block">
                        {children}
                    </ChartContainer>

                    <TileUpdateModal
                        className="non-draggable"
                        isOpen={isEditing}
                        tile={tile}
                        onClose={() => setIsEditing(false)}
                        onConfirm={(data) => {
                            onEdit(data);
                            setIsEditing(false);
                        }}
                    />
                </>
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
