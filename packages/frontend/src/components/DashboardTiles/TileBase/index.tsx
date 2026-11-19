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
    Menu,
    Paper,
    rem,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    useDebouncedValue,
    useHover,
    useMediaQuery,
    useToggle,
} from '@mantine/hooks';
import {
    IconArrowAutofitContent,
    IconCircleCheckFilled,
    IconDots,
    IconEdit,
    IconExternalLink,
    IconGripVertical,
    IconLink,
    IconTrash,
    IconDotsVertical,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useCallback, useState } from 'react';
import { v4 as uuid4 } from 'uuid';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import {
    dashboardEditActions,
    selectIsTileSelected,
    useDashboardDispatch,
    useDashboardSelector,
} from '../../../features/dashboard/store';
import {
    GRID_DESKTOP_COLS,
    type GridCell,
    type PointerPosition,
} from '../../../features/dashboardTabs/gridUtils';
import { useCanManageDashboard } from '../../../hooks/dashboard/useCanManageDashboard';
import { appendNewTilesToBottom } from '../../../hooks/dashboard/useDashboard';
import { useCopyTileLink } from '../../../hooks/dashboard/useTileLink';
import { useDelayedHover } from '../../../hooks/useDelayedHover';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import ConnectionBadge from '../../common/ConnectionBadge';
import { DASHBOARD_TILE_RADIUS } from '../../common/Dashboard/dashboard.constants';
import { FloatingActionsPill } from '../../common/FloatingActionsPill';
import MantineIcon from '../../common/MantineIcon';
import DeleteChartTileThatBelongsToDashboardModal from '../../common/modal/DeleteChartTileThatBelongsToDashboardModal';
import ChartUpdateModal from '../TileForms/ChartUpdateModal';
import MoveTileToTabModal from '../TileForms/MoveTileToTabModal';
import TileUpdateModal from '../TileForms/TileUpdateModal';
import LoadingSkeletonOverlay from './LoadingSkeletonOverlay';
import styles from './TileBase.module.css';
import { TileCopyPlacement } from './TileCopyPlacement';
import { TileHeaderPopoverContext } from './tileHeaderPopoverContext';
import { TileSelectionToolbar } from './TileSelectionToolbar';
import { type TileBaseProps } from './types';

const TileBase = <T extends Dashboard['tiles'][number]>({
    isEditMode,
    title,
    titleLeftIcon,
    verification = null,
    chartName,
    description = null,
    connectionName = null,
    tile,
    isLoading = false,
    hasError = false,
    chartKind,
    extraMenuItems = null,
    mobileMenuItems,
    onDelete,
    onEdit,
    onDuplicate,
    children,
    extraHeaderElement,
    visibleHeaderElement,
    focusedActions = null,
    hasNonMenuHeaderContent = false,
    titleHref,
    minimal = false,
    tabs,
    lockHeaderVisibility = false,
    transparent = false,
    fullWidth = false,
}: TileBaseProps<T>) => {
    const getUiString = useUiStrings();
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
    const [openHeaderPopovers, setOpenHeaderPopovers] = useState<
        ReadonlySet<string>
    >(() => new Set());
    const setHeaderPopoverOpen = useCallback((id: string, open: boolean) => {
        setOpenHeaderPopovers((prev) => {
            if (prev.has(id) === open) return prev;
            const next = new Set(prev);
            if (open) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);
    const isPhoneLayout = useMediaQuery('(width < 32em)', undefined, {
        getInitialValueInEffect: false,
    });

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

    const isSelected =
        useDashboardSelector((state) =>
            selectIsTileSelected(state, tile.uuid),
        ) && isEditMode;
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const dashboardDispatch = useDashboardDispatch();
    const copyTile = useCallback(
        (cell: GridCell) => {
            const uuid = uuid4();
            setDashboardTiles((currentTiles) =>
                appendNewTilesToBottom(currentTiles, [{ ...tile, uuid }]),
            );
            setHaveTilesChanged(true);
            dashboardDispatch(
                dashboardEditActions.placeTile({ uuid, ...cell }),
            );
        },
        [tile, setDashboardTiles, setHaveTilesChanged, dashboardDispatch],
    );
    // A copy waiting for the click that puts it down
    const [copyPlacement, setCopyPlacement] = useState<{
        gridItem: HTMLElement;
        pointer: PointerPosition;
    } | null>(null);
    const cancelCopy = useCallback(() => setCopyPlacement(null), []);
    // Tiles that point at saved content only copy when their own tile says how
    const isSelfContainedTile =
        tile.type === DashboardTileTypes.MARKDOWN ||
        tile.type === DashboardTileTypes.HEADING ||
        tile.type === DashboardTileTypes.LOOM;
    const duplicateTile =
        onDuplicate ?? (isSelfContainedTile ? copyTile : null);

    const copyTileLink = useCopyTileLink(tile);
    const canCopyTileLink = !minimal && copyTileLink !== null;
    // The title is the only link to the chart page and hidden titles have
    // none, so the pill carries one in view mode.
    const canViewChart = !minimal && !isEditMode && !!titleHref;
    // Titles and content can be changed from view mode too; the dashboard
    // saves the tile straight away since there is no layout to keep.
    const canManageDashboard = useCanManageDashboard();
    const canEditTileContent = isEditMode || (!minimal && canManageDashboard);

    // Headings are edited in place, and only while the dashboard is being edited:
    // a view-mode edit saves and reloads the whole dashboard
    const hasContentModal =
        canEditTileContent && tile.type !== DashboardTileTypes.HEADING;

    const hasMenuContent =
        hasContentModal || isEditMode || !!extraMenuItems || canCopyTileLink;
    const isVerified = verification !== null && verification !== undefined;
    const hasHeaderContent =
        hasMenuContent || isVerified || hasNonMenuHeaderContent || canViewChart;

    const showHeaderActions =
        (containerHovered && !titleHovered && !chartHovered) ||
        isMenuOpen ||
        openHeaderPopovers.size > 0 ||
        lockHeaderVisibility ||
        !!visibleHeaderElement;
    const menuItems = (
        <>
            {canCopyTileLink && (
                <Menu.Item
                    leftSection={<MantineIcon icon={IconLink} />}
                    onClick={copyTileLink}
                >
                    Copy link to tile
                </Menu.Item>
            )}
            {canCopyTileLink && (!!extraMenuItems || hasContentModal) && (
                <Menu.Divider />
            )}
            {extraMenuItems}
            {hasContentModal && extraMenuItems && <Menu.Divider />}
            {hasContentModal && (
                <Box>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconEdit} />}
                        onClick={() => setIsEditingTileContent(true)}
                    >
                        Edit tile content
                    </Menu.Item>
                </Box>
            )}
            {isEditMode && (
                <>
                    {tabs && tabs.length > 1 && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconArrowAutofitContent} />
                            }
                            onClick={() => setIsMovingTabs(true)}
                        >
                            Move to another tab
                        </Menu.Item>
                    )}
                    <Menu.Divider />
                    {belongsToDashboard ? (
                        <Menu.Item
                            color="red"
                            onClick={() =>
                                setIsDeletingChartThatBelongsToDashboard(true)
                            }
                        >
                            Delete chart
                        </Menu.Item>
                    ) : (
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() => onDelete(tile)}
                        >
                            Remove tile
                        </Menu.Item>
                    )}
                </>
            )}
        </>
    );
    const useCompactActions = isPhoneLayout && mobileMenuItems !== undefined;
    const headerActions = focusedActions ? (
        <FloatingActionsPill
            visible
            className={clsx('non-draggable', styles.tileTooltip)}
        >
            {focusedActions}
        </FloatingActionsPill>
    ) : useCompactActions ? (
        <FloatingActionsPill
            visible
            className={clsx('non-draggable', styles.tileTooltip)}
        >
            <Menu
                withArrow
                position="bottom-end"
                offset={4}
                arrowOffset={10}
                opened={isMenuOpen}
                onOpen={() => toggleMenu(true)}
                onClose={() => toggleMenu(false)}
            >
                <Menu.Dropdown>
                    {mobileMenuItems}
                    {mobileMenuItems && (canViewChart || hasMenuContent) && (
                        <Menu.Divider />
                    )}
                    {canViewChart && (
                        <Menu.Item
                            component="a"
                            href={titleHref}
                            target="_blank"
                            rel="noreferrer"
                            leftSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                        >
                            View chart
                        </Menu.Item>
                    )}
                    {canViewChart && hasMenuContent && <Menu.Divider />}
                    {menuItems}
                </Menu.Dropdown>

                <Menu.Target>
                    <ActionIcon
                        aria-label={getUiString('tileMenu.actions')}
                        size="sm"
                        className={styles.menuTrigger}
                    >
                        <MantineIcon
                            data-testid="tile-icon-more-vertical"
                            icon={IconDotsVertical}
                        />
                    </ActionIcon>
                </Menu.Target>
            </Menu>
        </FloatingActionsPill>
    ) : hasHeaderContent ? (
        <FloatingActionsPill
            visible={showHeaderActions}
            className={clsx('non-draggable', styles.tileTooltip)}
        >
            {titleLeftIcon}

            {visibleHeaderElement && (
                <Group gap="xs" className="non-draggable">
                    {visibleHeaderElement}
                </Group>
            )}

            {extraHeaderElement}

            {isVerified && (
                <Tooltip
                    label={
                        verification?.verifiedBy
                            ? `Verified by ${verification.verifiedBy.firstName} ${verification.verifiedBy.lastName}`
                            : 'Verified'
                    }
                >
                    <IconCircleCheckFilled
                        size={14}
                        className={styles.verifiedIcon}
                    />
                </Tooltip>
            )}

            {canViewChart && (
                <Tooltip label="View chart">
                    <ActionIcon
                        component="a"
                        size="sm"
                        href={titleHref}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="View chart"
                    >
                        <MantineIcon icon={IconExternalLink} />
                    </ActionIcon>
                </Tooltip>
            )}

            {hasMenuContent && (
                <Menu
                    withArrow
                    position="bottom-end"
                    offset={4}
                    arrowOffset={10}
                    opened={isMenuOpen}
                    onOpen={() => toggleMenu(true)}
                    onClose={() => toggleMenu(false)}
                >
                    <Menu.Dropdown>{menuItems}</Menu.Dropdown>

                    <Menu.Target>
                        <ActionIcon
                            aria-label={getUiString('tileMenu.actions')}
                            size="sm"
                            className={styles.menuTrigger}
                        >
                            <MantineIcon
                                data-testid="tile-icon-more"
                                icon={IconDots}
                            />
                        </ActionIcon>
                    </Menu.Target>
                </Menu>
            )}
        </FloatingActionsPill>
    ) : null;

    return (
        <div ref={containerRef} className={styles.tileWrapper}>
            {containerHovered && isEditMode && !minimal && !focusedActions && (
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

            {isSelected && !focusedActions && (
                <TileSelectionToolbar
                    tileUuid={tile.uuid}
                    width={tile.w}
                    align={
                        tile.x + tile.w / 2 > GRID_DESKTOP_COLS / 2
                            ? 'end'
                            : 'start'
                    }
                    side={tile.y === 0 ? 'bottom' : 'top'}
                    onDuplicate={
                        duplicateTile &&
                        ((gridItem, pointer) =>
                            setCopyPlacement({ gridItem, pointer }))
                    }
                    onDelete={() =>
                        belongsToDashboard
                            ? setIsDeletingChartThatBelongsToDashboard(true)
                            : onDelete(tile)
                    }
                />
            )}

            {copyPlacement && duplicateTile && (
                <TileCopyPlacement
                    tile={tile}
                    gridItem={copyPlacement.gridItem}
                    pointer={copyPlacement.pointer}
                    onPlace={(cell) => {
                        setCopyPlacement(null);
                        duplicateTile(cell);
                    }}
                    onCancel={cancelCopy}
                />
            )}

            <Card
                className={styles.tileCard}
                // Walkthrough: a look at the tile while it can still be
                // dragged and resized, before the dashboard is saved.
                data-tour-scope="manage:Dashboard"
                data-tour-look="1"
                data-tour-after='[data-tour-anchor="add-charts-submit"]'
                data-tour-interactive="true"
                data-tour-label="Try resizing or moving the tile"
                data-tour-docs="explore/dashboards.mdx#add-an-existing-chart:p2:1"
                data-with-transparent-border={transparent}
                data-with-edit-mode={isEditMode}
                data-selected={isSelected || undefined}
                data-has-error={hasError}
                data-inline-editable={
                    (isEditMode && tile.type === DashboardTileTypes.HEADING) ||
                    undefined
                }
                data-content-focused={focusedActions ? true : undefined}
                data-with-shadow={!isEditMode && !transparent}
                h="100%"
                p={transparent ? 0 : 'md'}
                bg={transparent ? 'transparent' : 'var(--ld-color-tile)'}
                radius={rem(
                    isEditMode
                        ? DASHBOARD_TILE_RADIUS.edit
                        : DASHBOARD_TILE_RADIUS.view,
                )}
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
                    gap="xs"
                    data-is-edit-mode={isEditMode}
                    data-is-empty={isMarkdownTileTitleEmpty || hideTitle}
                    data-has-actions={hasHeaderContent}
                >
                    <Box className={styles.titleContainer}>
                        {minimal ? (
                            !hideTitle ? (
                                <Tooltip
                                    disabled={!description}
                                    label={
                                        <Text
                                            className={styles.description}
                                            fz="sm"
                                        >
                                            {description}
                                        </Text>
                                    }
                                    position="top-start"
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
                                        className={styles.description}
                                        fz="sm"
                                    >
                                        {description}
                                    </Text>
                                }
                                position="top-start"
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
                                        onMouseEnter={() =>
                                            setTitleHovered(true)
                                        }
                                        onMouseLeave={() =>
                                            setTitleHovered(false)
                                        }
                                        target="_blank"
                                    >
                                        {title}
                                    </Text>
                                )}
                            </Tooltip>
                        )}
                    </Box>
                    {!minimal && !hideTitle && (
                        <ConnectionBadge name={connectionName} />
                    )}
                    <TileHeaderPopoverContext.Provider
                        value={setHeaderPopoverOpen}
                    >
                        {headerActions}
                    </TileHeaderPopoverContext.Provider>
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

export default TileBase;
