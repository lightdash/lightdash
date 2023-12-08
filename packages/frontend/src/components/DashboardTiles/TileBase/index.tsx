import { Classes } from '@blueprintjs/core';
import { Dashboard, DashboardTileTypes, isChartTile } from '@lightdash/common';
import { ActionIcon, Box, Group, Menu, Text, Tooltip } from '@mantine/core';
import { useHover, useToggle } from '@mantine/hooks';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import { ReactNode, useState } from 'react';
import MantineIcon from '../../common/MantineIcon';
import DeleteChartTileThatBelongsToDashboardModal from '../../common/modal/DeleteChartTileThatBelongsToDashboardModal';
import ChartUpdateModal from '../TileForms/ChartUpdateModal';
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
    belongsToDashboard?: boolean;
    title: string;
    titleLeftIcon?: ReactNode;
    chartName?: string;
    titleHref?: string;
    description?: string;
    tile: T;
    isLoading?: boolean;
    extraMenuItems?: ReactNode;
    onDelete: (tile: T) => void;
    onEdit: (tile: T) => void;
    children?: ReactNode;
    extraHeaderElement?: ReactNode;
};

const TileBase = <T extends Dashboard['tiles'][number]>({
    isEditMode,
    title,
    titleLeftIcon,
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
    const [isEditingTileContent, setIsEditingTileContent] = useState(false);
    const [
        isDeletingChartThatBelongsToDashboard,
        setIsDeletingChartThatBelongsToDashboard,
    ] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const { hovered: containerHovered, ref: containerRef } = useHover();
    const { hovered: titleHovered, ref: titleRef } =
        useHover<HTMLAnchorElement>();
    const [isMenuOpen, toggleMenu] = useToggle([false, true]);

    const hideTitle =
        tile.type !== DashboardTileTypes.MARKDOWN
            ? tile.properties.hideTitle
            : false;
    const belongsToDashboard: boolean =
        isChartTile(tile) && !!tile.properties.belongsToDashboard;

    const isMarkdownTileTitleEmpty =
        tile.type === DashboardTileTypes.MARKDOWN && !title;

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
                        $isEmpty={isMarkdownTileTitleEmpty || hideTitle}
                    >
                        <Tooltip
                            disabled={!description || !!titleLeftIcon}
                            label={description}
                            multiline
                            position="top-start"
                            withinPortal
                            maw={400}
                        >
                            <TitleWrapper $hovered={titleHovered}>
                                <Group spacing="xs">
                                    {titleLeftIcon}

                                    <Tooltip
                                        disabled={
                                            !description || !titleLeftIcon
                                        }
                                        label={description}
                                        multiline
                                        position="top-start"
                                        withinPortal
                                        maw={400}
                                    >
                                        {!hideTitle ? (
                                            belongsToDashboard ? (
                                                <Text fw={600} size="md">
                                                    {title}
                                                </Text>
                                            ) : (
                                                <TileTitleLink
                                                    ref={titleRef}
                                                    href={titleHref}
                                                    $hovered={titleHovered}
                                                    target="_blank"
                                                    className="non-draggable"
                                                >
                                                    {title}
                                                </TileTitleLink>
                                            )
                                        ) : (
                                            <Box />
                                        )}
                                    </Tooltip>
                                </Group>
                            </TitleWrapper>
                        </Tooltip>

                        {(containerHovered && !titleHovered) || isMenuOpen ? (
                            <ButtonsWrapper className="non-draggable">
                                {extraHeaderElement}
                                {(isEditMode ||
                                    (!isEditMode && extraMenuItems)) && (
                                    <Menu
                                        opened={isMenuOpen}
                                        onOpen={() => toggleMenu(true)}
                                        onClose={() => toggleMenu(false)}
                                        shadow="md"
                                        withArrow
                                        position="bottom-end"
                                        offset={4}
                                        arrowOffset={10}
                                    >
                                        <Menu.Dropdown>
                                            {extraMenuItems}
                                            {isEditMode && extraMenuItems && (
                                                <Menu.Divider />
                                            )}
                                            {isEditMode && (
                                                <>
                                                    {!belongsToDashboard && (
                                                        <Menu.Item
                                                            // FIXME: pick icon for this one
                                                            icon={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconEdit
                                                                    }
                                                                />
                                                            }
                                                            onClick={() =>
                                                                setIsEditingTileContent(
                                                                    true,
                                                                )
                                                            }
                                                        >
                                                            Edit tile content
                                                        </Menu.Item>
                                                    )}
                                                    {belongsToDashboard ? (
                                                        <Menu.Item
                                                            color="red"
                                                            onClick={() =>
                                                                setIsDeletingChartThatBelongsToDashboard(
                                                                    true,
                                                                )
                                                            }
                                                        >
                                                            Delete chart
                                                        </Menu.Item>
                                                    ) : (
                                                        <>
                                                            <Menu.Divider />
                                                            <Menu.Item
                                                                color="red"
                                                                icon={
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconTrash
                                                                        }
                                                                    />
                                                                }
                                                                onClick={() =>
                                                                    onDelete(
                                                                        tile,
                                                                    )
                                                                }
                                                            >
                                                                Remove tile
                                                            </Menu.Item>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </Menu.Dropdown>

                                        <Menu.Target>
                                            <ActionIcon size="sm">
                                                <MantineIcon icon={IconDots} />
                                            </ActionIcon>
                                        </Menu.Target>
                                    </Menu>
                                )}
                            </ButtonsWrapper>
                        ) : null}
                    </HeaderContainer>
                    <ChartContainer className="non-draggable sentry-block ph-no-capture">
                        {children}
                    </ChartContainer>
                    {isEditingTileContent &&
                        (tile.type === DashboardTileTypes.SAVED_CHART ? (
                            <ChartUpdateModal
                                opened={isEditingTileContent}
                                tile={tile}
                                onClose={() => setIsEditingTileContent(false)}
                                onConfirm={(
                                    newTitle,
                                    newUuid,
                                    shouldHideTitle,
                                ) => {
                                    onEdit({
                                        ...tile,
                                        properties: {
                                            ...tile.properties,
                                            title: newTitle,
                                            savedChartUuid: newUuid,
                                            hideTitle: shouldHideTitle,
                                        },
                                    });
                                    setIsEditingTileContent(false);
                                }}
                                hideTitle={!!hideTitle}
                            />
                        ) : (
                            <TileUpdateModal
                                className="non-draggable"
                                isOpen={isEditingTileContent}
                                tile={tile}
                                onClose={() => setIsEditingTileContent(false)}
                                onConfirm={(newTile) => {
                                    onEdit(newTile);
                                    setIsEditingTileContent(false);
                                }}
                            />
                        ))}
                    <DeleteChartTileThatBelongsToDashboardModal
                        className={'non-draggable'}
                        name={chartName ?? ''}
                        opened={isDeletingChartThatBelongsToDashboard}
                        onClose={() =>
                            setIsDeletingChartThatBelongsToDashboard(false)
                        }
                        onConfirm={() => {
                            onDelete(tile);
                            setIsDeletingChartThatBelongsToDashboard(false);
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
