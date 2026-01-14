import {
    DashboardTileTypes,
    isDashboardChartTileType,
    LOADING_CHART_OVERLAY_CLASS,
    type Dashboard,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Flex,
    Group,
    Paper,
    rem,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue, useHover, useToggle } from '@mantine-8/hooks';
import { clsx, Menu } from '@mantine/core';
import {
    IconArrowAutofitContent,
    IconDots,
    IconEdit,
    IconGripVertical,
    IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useDelayedHover } from '../../../hooks/useDelayedHover';
import MantineIcon from '../../common/MantineIcon';
import DeleteChartTileThatBelongsToDashboardModal from '../../common/modal/DeleteChartTileThatBelongsToDashboardModal';
import ChartUpdateModal from '../TileForms/ChartUpdateModal';
import MoveTileToTabModal from '../TileForms/MoveTileToTabModal';
import TileUpdateModal from '../TileForms/TileUpdateModal';
import LoadingSkeletonOverlay from './LoadingSkeletonOverlay';
import styles from './TileBase.module.css';
import { type TileBaseProps } from './types';

const TileBaseV2 = <T extends Dashboard['tiles'][number]>({
    isEditMode,
    title,
    titleLeftIcon,
    chartName,
    description = null,
    tile,
    isLoading = false,
    hasError = false,
    chartKind,
    extraMenuItems = null,
    onDelete,
    onEdit,
    children,
    extraHeaderElement,
    visibleHeaderElement,
    titleHref,
    minimal = false,
    tabs,
    lockHeaderVisibility = false,
    transparent = false,
    fullWidth = false,
}: TileBaseProps<T>) => {
    const [isEditingTileContent, setIsEditingTileContent] = useState(false);
    const [isMovingTabs, setIsMovingTabs] = useState(false);

    const [
        isDeletingChartThatBelongsToDashboard,
        setIsDeletingChartThatBelongsToDashboard,
    ] = useState(false);
    const { hovered: rawContainerHovered, ref: containerRef } = useHover();
    // Debounce unhover to prevent flashing when tooltips render outside container
    const [debouncedContainerHovered] = useDebouncedValue(
        rawContainerHovered,
        200,
    );
    const containerHovered = rawContainerHovered || debouncedContainerHovered;

    const { isHovered: chartHovered, ...chartHoveredProps } = useDelayedHover({
        delay: 500,
    });
    const [titleHovered, setTitleHovered] = useState(false);
    const [isMenuOpen, toggleMenu] = useToggle([false, true]);

    const hideTitle =
        hasError ||
        tile.type === DashboardTileTypes.HEADING ||
        (tile.type !== DashboardTileTypes.MARKDOWN
            ? tile.properties.hideTitle
            : false);
    const belongsToDashboard: boolean =
        isDashboardChartTileType(tile) && !!tile.properties.belongsToDashboard;

    const isMarkdownTileTitleEmpty =
        tile.type === DashboardTileTypes.MARKDOWN && !title;

    const hasMenuContent = isEditMode || !!extraMenuItems;
    const shouldShowHoverMenu = !minimal && hasMenuContent;

    return (
        <div ref={containerRef} className={styles.tileWrapper}>
            {containerHovered && isEditMode && !minimal && (
                <Paper
                    className={styles.dragHandleIcon}
                    pos="absolute"
                    shadow="sm"
                    top={-6}
                    left={-2}
                    px={5}
                    py={8}
                >
                    <MantineIcon icon={IconGripVertical} color="ldGray" />
                </Paper>
            )}

            {((containerHovered && !titleHovered && !chartHovered) ||
                isMenuOpen ||
                lockHeaderVisibility) &&
                shouldShowHoverMenu && (
                    <Paper
                        p={5}
                        className={clsx('non-draggable', styles.tileTooltip)}
                        shadow="sm"
                        pos="absolute"
                        top={-6}
                        right={-2}
                    >
                        <Group gap={5} wrap="nowrap">
                            {titleLeftIcon}

                            {visibleHeaderElement && (
                                <Group gap="xs" className="non-draggable">
                                    {visibleHeaderElement}
                                </Group>
                            )}

                            {extraHeaderElement}

                            {hasMenuContent && (
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
                                                        leftSection={
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
                                                        leftSection={
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
                                                        leftSection={
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
                                            variant="subtle"
                                            color="gray"
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
                        </Group>
                    </Paper>
                )}

            <Card
                className={styles.tileCard}
                data-with-transparent-border={transparent}
                data-with-edit-mode={isEditMode}
                data-has-error={hasError}
                data-with-shadow={!isEditMode && !transparent}
                h="100%"
                p={transparent ? 0 : 'md'}
                bg={transparent ? 'transparent' : 'background'}
                radius={isEditMode ? rem(4) : rem(12)}
            >
                <LoadingSkeletonOverlay
                    // ! Very important to have this class name on the tile loading overlay, otherwise the unfurl service will not be able to find it
                    className={LOADING_CHART_OVERLAY_CLASS}
                    hasTitle={!hideTitle}
                    chartKind={chartKind}
                    visible={isLoading ?? false}
                />

                <Group
                    className={styles.headerContainer}
                    justify="flex-start"
                    align="center"
                    gap="8px"
                    mb="12px"
                    data-is-edit-mode={isEditMode}
                    data-is-empty={isMarkdownTileTitleEmpty || hideTitle}
                >
                    {minimal ? (
                        !hideTitle ? (
                            <Tooltip
                                disabled={!description}
                                label={
                                    <Text
                                        style={{ whiteSpace: 'pre-line' }}
                                        fz="sm"
                                    >
                                        {description}
                                    </Text>
                                }
                                multiline
                                position="top-start"
                                withinPortal
                                maw={400}
                            >
                                <Text fw={600} size="md">
                                    {title}
                                </Text>
                            </Tooltip>
                        ) : (
                            <Box />
                        )
                    ) : (
                        <Tooltip
                            disabled={!description}
                            label={
                                <Text
                                    style={{ whiteSpace: 'pre-line' }}
                                    fz="sm"
                                >
                                    {description}
                                </Text>
                            }
                            multiline
                            position="top-start"
                            withinPortal
                            maw={400}
                        >
                            {isEditMode ||
                            tile.type === DashboardTileTypes.MARKDOWN ? (
                                <Text
                                    className={styles.tileTitle}
                                    data-hidden={hideTitle}
                                    c="foreground"
                                >
                                    {title}
                                </Text>
                            ) : (
                                <Text
                                    component="a"
                                    className={styles.tileTitle}
                                    data-hidden={hideTitle}
                                    data-hovered={titleHovered}
                                    href={titleHref}
                                    onMouseEnter={() => setTitleHovered(true)}
                                    onMouseLeave={() => setTitleHovered(false)}
                                    target="_blank"
                                >
                                    {title}
                                </Text>
                            )}
                        </Tooltip>
                    )}
                </Group>

                <Flex
                    className={clsx(
                        'non-draggable',
                        'sentry-block',
                        'ph-no-capture',
                        styles.chartContainer,
                    )}
                    data-full-width={fullWidth}
                    flex="1"
                    align={
                        tile.type === DashboardTileTypes.HEADING
                            ? 'center'
                            : undefined
                    }
                    onMouseEnter={
                        hideTitle
                            ? chartHoveredProps.handleMouseEnter
                            : undefined
                    }
                    onMouseLeave={
                        hideTitle
                            ? chartHoveredProps.handleMouseLeave
                            : undefined
                    }
                >
                    {children}
                </Flex>

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
                    onClose={() =>
                        setIsDeletingChartThatBelongsToDashboard(false)
                    }
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
        </div>
    );
};

export default TileBaseV2;
