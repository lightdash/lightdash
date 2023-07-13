import {
    Button,
    Classes,
    Menu,
    MenuDivider,
    PopoverPosition,
} from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Dashboard, DashboardTileTypes } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { useHover, useToggle } from '@mantine/hooks';
import React, { ReactNode, useState } from 'react';
import ChartUpdateModal from '../TileForms/ChartUpdateModal';
import TileUpdateChartTitle from '../TileForms/TileUpdateChartTitle';
import TileUpdateModal from '../TileForms/TileUpdateModal';
import {
    ButtonsWrapper,
    ChartContainer,
    HeaderContainer,
    TileBaseWrapper,
    TileTitleLink,
    TitleWrapper,
} from './TileBase.styles';

type Props<T> = {
    isEditMode: boolean;
    title: string;
    chartName?: string;
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
    chartName,
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
    const [isReplacingChart, setIsReplacingChart] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    const [isHovering, setIsHovering] = useState(false);
    const { hovered: containerHovered, ref: containerRef } = useHover();
    const { hovered: titleHovered, ref: titleRef } =
        useHover<HTMLAnchorElement>();
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
                        <Tooltip
                            disabled={!description}
                            label={description}
                            multiline
                            position="top-start"
                        >
                            <TitleWrapper $hovered={titleHovered}>
                                {!hideTitle ? (
                                    <TileTitleLink
                                        ref={titleRef}
                                        href={titleHref}
                                        $hovered={titleHovered}
                                        target="_blank"
                                        className="non-draggable"
                                    >
                                        {title}
                                    </TileTitleLink>
                                ) : null}
                            </TitleWrapper>
                        </Tooltip>

                        {(containerHovered && !titleHovered) || isMenuOpen ? (
                            <ButtonsWrapper className="non-draggable">
                                {extraHeaderElement}
                                {(isEditMode ||
                                    (!isEditMode && extraMenuItems)) && (
                                    <Popover2
                                        lazy
                                        onOpening={() => toggleMenu(true)}
                                        onClosed={() => toggleMenu(false)}
                                        position={PopoverPosition.BOTTOM_RIGHT}
                                        content={
                                            <Menu>
                                                {extraMenuItems}
                                                {isEditMode &&
                                                    extraMenuItems && (
                                                        <MenuDivider />
                                                    )}
                                                {isEditMode && (
                                                    <>
                                                        {tile.type ===
                                                        DashboardTileTypes.SAVED_CHART ? (
                                                            <MenuItem2
                                                                icon="edit"
                                                                text="Edit title"
                                                                onClick={() =>
                                                                    setIsEditingTitle(
                                                                        true,
                                                                    )
                                                                }
                                                            />
                                                        ) : null}
                                                        <MenuItem2
                                                            icon={
                                                                tile.type ===
                                                                DashboardTileTypes.SAVED_CHART
                                                                    ? 'exchange'
                                                                    : 'edit'
                                                            }
                                                            text={
                                                                tile.type ===
                                                                DashboardTileTypes.SAVED_CHART
                                                                    ? 'Replace chart'
                                                                    : 'Edit tile content'
                                                            }
                                                            onClick={() =>
                                                                setIsReplacingChart(
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
                                                                    onEdit({
                                                                        ...tile,
                                                                        properties:
                                                                            {
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
                                                            onClick={() =>
                                                                onDelete(tile)
                                                            }
                                                        />
                                                    </>
                                                )}
                                            </Menu>
                                        }
                                        renderTarget={({ ref, ...props }) => (
                                            <Button
                                                elementRef={ref}
                                                minimal
                                                small
                                                icon="more"
                                                {...props}
                                            />
                                        )}
                                    />
                                )}
                            </ButtonsWrapper>
                        ) : null}
                    </HeaderContainer>
                    <ChartContainer className="non-draggable sentry-block fs-block cohere-block">
                        {children}
                    </ChartContainer>
                    {tile.type === DashboardTileTypes.SAVED_CHART ? (
                        <ChartUpdateModal
                            opened={isReplacingChart}
                            tile={tile}
                            placeholder={chartName || ''}
                            title={title}
                            onClose={() => setIsReplacingChart(false)}
                            onConfirm={(newChartTile) => {
                                onEdit({
                                    ...newChartTile,
                                    properties: {
                                        ...newChartTile.properties,
                                        title: undefined,
                                    },
                                } as T);
                                setIsReplacingChart(false);
                            }}
                        />
                    ) : (
                        <TileUpdateModal
                            className="non-draggable"
                            isOpen={isReplacingChart}
                            tile={tile}
                            onClose={() => setIsReplacingChart(false)}
                            onConfirm={(newTile) => {
                                onEdit(newTile);
                                setIsReplacingChart(false);
                            }}
                        />
                    )}
                    <TileUpdateChartTitle
                        isOpen={isEditingTitle}
                        placeholder={chartName || ''}
                        title={title}
                        onClose={() => setIsEditingTitle(false)}
                        onConfirm={(newTitle) => {
                            onEdit({
                                ...tile,
                                properties: {
                                    ...tile.properties,
                                    title: newTitle,
                                },
                            });
                            setIsEditingTitle(false);
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
