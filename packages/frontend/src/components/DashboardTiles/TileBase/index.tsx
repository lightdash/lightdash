import {
    DashboardTileTypes,
    isChartTile,
    type Dashboard,
    type DashboardTab,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Flex,
    getDefaultZIndex,
    Group,
    LoadingOverlay,
    Menu,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover, useToggle } from '@mantine/hooks';
import {
    IconArrowAutofitContent,
    IconDots,
    IconEdit,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import MantineIcon from '../../common/MantineIcon';
import DeleteChartTileThatBelongsToDashboardModal from '../../common/modal/DeleteChartTileThatBelongsToDashboardModal';
import ChartUpdateModal from '../TileForms/ChartUpdateModal';
import MoveTileToTabModal from '../TileForms/MoveTileToTabModal';
import TileUpdateModal from '../TileForms/TileUpdateModal';

import {
    ButtonsWrapper,
    ChartContainer,
    HeaderContainer,
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
    visibleHeaderElement?: ReactNode;
    minimal?: boolean;
    tabs?: DashboardTab[];
    lockHeaderVisibility?: boolean;
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
    visibleHeaderElement,
    titleHref,
    minimal = false,
    tabs,
    lockHeaderVisibility = false,
}: Props<T>) => {
    const [isEditingTileContent, setIsEditingTileContent] = useState(false);
    const [isMovingTabs, setIsMovingTabs] = useState(false);

    const [
        isDeletingChartThatBelongsToDashboard,
        setIsDeletingChartThatBelongsToDashboard,
    ] = useState(false);
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
        <Card
            component={Flex}
            className="tile-base"
            ref={containerRef}
            h="100%"
            direction="column"
            p="md"
            bg="white"
            radius="sm"
            shadow={isEditMode ? 'xs' : undefined}
            sx={(theme) => ({
                overflow: 'unset',

                border: isEditMode
                    ? `1px dashed ${theme.colors.blue[5]}`
                    : `1px solid ${theme.colors.gray[1]}`,
            })}
        >
            <LoadingOverlay
                className="loading_chart_overlay"
                visible={isLoading ?? false}
                zIndex={getDefaultZIndex('modal') - 10}
            />

            <HeaderContainer
                $isEditMode={isEditMode}
                $isEmpty={isMarkdownTileTitleEmpty || hideTitle}
                style={{
                    backgroundColor: 'white',
                    zIndex: isLoading ? getDefaultZIndex('modal') - 10 : 3,
                    borderRadius: '5px',
                }}
            >
                {minimal ? (
                    !hideTitle ? (
                        <Text fw={600} size="md">
                            {title}
                        </Text>
                    ) : (
                        <Box />
                    )
                ) : (
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
                                    disabled={!description || !titleLeftIcon}
                                    label={description}
                                    multiline
                                    position="top-start"
                                    withinPortal
                                    maw={400}
                                >
                                    {isEditMode ? (
                                        <Text
                                            fw={600}
                                            fz="md"
                                            hidden={hideTitle}
                                        >
                                            {title}
                                        </Text>
                                    ) : (
                                        <TileTitleLink
                                            ref={titleRef}
                                            href={titleHref}
                                            $hovered={titleHovered}
                                            target="_blank"
                                            className="non-draggable"
                                            hidden={hideTitle}
                                        >
                                            {title}
                                        </TileTitleLink>
                                    )}
                                </Tooltip>
                            </Group>
                        </TitleWrapper>
                    </Tooltip>
                )}
                {visibleHeaderElement && (
                    <ButtonsWrapper className="non-draggable">
                        {visibleHeaderElement}
                    </ButtonsWrapper>
                )}

                <ButtonsWrapper className="non-draggable">
                    {(containerHovered && !titleHovered) ||
                    isMenuOpen ||
                    lockHeaderVisibility ? (
                        <>
                            {extraHeaderElement}

                            {(isEditMode ||
                                (!isEditMode && extraMenuItems)) && (
                                <Menu
                                    withArrow
                                    withinPortal
                                    shadow="md"
                                    position="bottom-end"
                                    offset={4}
                                    arrowOffset={10}
                                    opened={isMenuOpen}
                                    onOpen={() => toggleMenu(true)}
                                    onClose={() => toggleMenu(false)}
                                >
                                    <Menu.Dropdown>
                                        {extraMenuItems}
                                        {isEditMode && extraMenuItems && (
                                            <Menu.Divider />
                                        )}
                                        {isEditMode && (
                                            <>
                                                <Box>
                                                    <Menu.Item
                                                        icon={
                                                            <MantineIcon
                                                                icon={IconEdit}
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
                                                </Box>
                                                {tabs && tabs.length > 1 && (
                                                    <Menu.Item
                                                        icon={
                                                            <MantineIcon
                                                                icon={
                                                                    IconArrowAutofitContent
                                                                }
                                                            />
                                                        }
                                                        onClick={() =>
                                                            setIsMovingTabs(
                                                                true,
                                                            )
                                                        }
                                                    >
                                                        Move to another tab
                                                    </Menu.Item>
                                                )}
                                                <Menu.Divider />
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
                                                    <Menu.Item
                                                        color="red"
                                                        icon={
                                                            <MantineIcon
                                                                icon={IconTrash}
                                                            />
                                                        }
                                                        onClick={() =>
                                                            onDelete(tile)
                                                        }
                                                    >
                                                        Remove tile
                                                    </Menu.Item>
                                                )}
                                            </>
                                        )}
                                    </Menu.Dropdown>

                                    <Menu.Target>
                                        <ActionIcon
                                            size="sm"
                                            style={{
                                                position: 'relative',
                                                zIndex: 1,
                                            }}
                                        >
                                            <MantineIcon
                                                data-testid="tile-icon-more"
                                                icon={IconDots}
                                            />
                                        </ActionIcon>
                                    </Menu.Target>
                                </Menu>
                            )}
                        </>
                    ) : null}
                </ButtonsWrapper>
            </HeaderContainer>

            <ChartContainer className="non-draggable sentry-block ph-no-capture">
                {children}
            </ChartContainer>

            {isEditingTileContent &&
                (tile.type === DashboardTileTypes.SAVED_CHART ||
                tile.type === DashboardTileTypes.SQL_CHART ? (
                    <ChartUpdateModal
                        opened={isEditingTileContent}
                        tile={tile}
                        onClose={() => setIsEditingTileContent(false)}
                        onConfirm={(newTitle, newUuid, shouldHideTitle) => {
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
                        opened={isEditingTileContent}
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
                onClose={() => setIsDeletingChartThatBelongsToDashboard(false)}
                onConfirm={() => {
                    onDelete(tile);
                    setIsDeletingChartThatBelongsToDashboard(false);
                }}
            />
            <MoveTileToTabModal
                className="non-draggable"
                opened={isMovingTabs}
                onConfirm={(newTile) => {
                    onEdit(newTile as T);
                    setIsMovingTabs(false);
                }}
                tabs={tabs}
                tile={tile}
                onClose={() => setIsMovingTabs(false)}
            />
        </Card>
    );
};

TileBase.defaultProps = {
    isLoading: false,
    extraMenuItems: null,
    description: null,
    hasFilters: false,
};

export default TileBase;
