import {
    DashboardTileTypes,
    QueryExecutionContext,
    assertUnreachable,
    type DashboardTile,
    type EmbedDashboard as EmbedDashboardType,
} from '@lightdash/common';
import { Button, Group, Tabs, TextInput } from '@mantine-8/core';
import { IconCheck, IconPencil, IconUnlink, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { LockedDashboardModal } from '../../../../../components/common/modal/LockedDashboardModal';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import AddTileButton from '../../../../../components/DashboardTiles/AddTileButton';
import DashboardChartTile from '../../../../../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../../../../../components/DashboardTiles/DashboardLoomTile';
import SqlChartTile from '../../../../../components/DashboardTiles/DashboardSqlChartTile';
import {
    convertLayoutToBaseCoordinates,
    GRID_CONTAINER_PADDING,
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
    type ResponsiveGridLayoutProps,
} from '../../../../../features/dashboardTabs/gridUtils';
// eslint-disable-next-line css-modules/no-unused-class
import tabStyles from '../../../../../features/dashboardTabs/tabs.module.css';
import {
    appendNewTilesToBottom,
    useUpdateDashboard,
} from '../../../../../hooks/dashboard/useDashboard';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedDashboard } from '../hooks';
import EmbedDashboardChartTile from './EmbedDashboardChartTile';
import EmbedDashboardHeader from './EmbedDashboardHeader';
import EmbedDataAppTile from './EmbedDataAppTile';
import { EmbedHeadingTile } from './EmbedHeadingTile';
import { EmbedMarkdownTile } from './EmbedMarkdownTile';
import '../../../../../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const EMBED_EDIT_TILE_TYPES = [
    DashboardTileTypes.SAVED_CHART,
    DashboardTileTypes.MARKDOWN,
    DashboardTileTypes.HEADING,
];

const EmbedDashboardGrid: FC<{
    filteredTiles: DashboardTile[];
    layouts: { lg: Layout[]; md: Layout[]; sm: Layout[] };
    dashboard: any;
    projectUuid: string;
    paletteColors?: string[];
    paletteDarkColors?: string[] | null;
    hasRequiredDashboardFiltersToSet: boolean;
    isTabEmpty?: boolean;
    gridProps: ResponsiveGridLayoutProps;
    isEditMode: boolean;
    onLayoutChange: (layout: Layout[]) => void;
    onBreakpointChange: (cols: number) => void;
    onDeleteTile: (tile: DashboardTile) => void;
    onEditTile: (tile: DashboardTile) => void;
    useDashboardEditorTileQueries: boolean;
}> = ({
    filteredTiles,
    layouts,
    dashboard,
    projectUuid,
    paletteColors,
    paletteDarkColors,
    hasRequiredDashboardFiltersToSet,
    isTabEmpty,
    gridProps,
    isEditMode,
    onLayoutChange,
    onBreakpointChange,
    onDeleteTile,
    onEditTile,
    useDashboardEditorTileQueries,
}) => (
    <Group grow pt="sm" px="xs">
        {isTabEmpty ? (
            <div
                style={{
                    marginTop: '40px',
                    textAlign: 'center',
                }}
            >
                <SuboptimalState
                    title="Tab is empty"
                    description="This tab has no tiles"
                />
            </div>
        ) : (
            <div className={tabStyles.tabGridContainer}>
                <ResponsiveGridLayout
                    {...gridProps}
                    layouts={layouts}
                    containerPadding={GRID_CONTAINER_PADDING}
                    onDragStop={onLayoutChange}
                    onResizeStop={onLayoutChange}
                    onBreakpointChange={(_, cols) => onBreakpointChange(cols)}
                    className={`react-grid-layout-dashboard ${
                        hasRequiredDashboardFiltersToSet ? 'locked' : ''
                    }`}
                >
                    {filteredTiles.map((tile, index) => (
                        <div key={tile.uuid} data-tile-uuid={tile.uuid}>
                            {tile.type === DashboardTileTypes.SAVED_CHART ? (
                                useDashboardEditorTileQueries ? (
                                    <DashboardChartTile
                                        key={tile.uuid}
                                        minimal
                                        tile={tile}
                                        isEditMode={isEditMode}
                                        onDelete={() => onDeleteTile(tile)}
                                        onEdit={onEditTile}
                                        canExportCsv={dashboard.canExportCsv}
                                        canExportImages={
                                            dashboard.canExportImages
                                        }
                                        canViewExplore={dashboard.canExplore}
                                        queryContextOverride={
                                            QueryExecutionContext.DASHBOARD
                                        }
                                        colorPaletteOverride={paletteColors}
                                        darkColorPaletteOverride={
                                            paletteDarkColors
                                        }
                                    />
                                ) : (
                                    <EmbedDashboardChartTile
                                        projectUuid={projectUuid}
                                        dashboardSlug={dashboard.slug}
                                        paletteColors={paletteColors}
                                        paletteDarkColors={paletteDarkColors}
                                        key={tile.uuid}
                                        minimal
                                        tile={tile}
                                        isEditMode={isEditMode}
                                        onDelete={() => onDeleteTile(tile)}
                                        onEdit={onEditTile}
                                        canExportCsv={dashboard.canExportCsv}
                                        canExportImages={
                                            dashboard.canExportImages
                                        }
                                        canViewExplore={dashboard.canExplore}
                                        locked={
                                            hasRequiredDashboardFiltersToSet
                                        }
                                        tileIndex={index}
                                    />
                                )
                            ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                                <EmbedMarkdownTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={isEditMode}
                                    onDelete={() => onDeleteTile(tile)}
                                    onEdit={onEditTile}
                                    tileIndex={index}
                                    dashboardSlug={dashboard.slug}
                                />
                            ) : tile.type === DashboardTileTypes.LOOM ? (
                                <LoomTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={isEditMode}
                                    onDelete={() => onDeleteTile(tile)}
                                    onEdit={onEditTile}
                                />
                            ) : tile.type === DashboardTileTypes.SQL_CHART ? (
                                <SqlChartTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={isEditMode}
                                    onDelete={() => onDeleteTile(tile)}
                                    onEdit={onEditTile}
                                    isEmbed={!useDashboardEditorTileQueries}
                                    projectUuidOverride={projectUuid}
                                    dashboardUuidOverride={dashboard.uuid}
                                />
                            ) : tile.type === DashboardTileTypes.HEADING ? (
                                <EmbedHeadingTile
                                    key={tile.uuid}
                                    tile={tile}
                                    isEditMode={isEditMode}
                                    onDelete={() => onDeleteTile(tile)}
                                    onEdit={onEditTile}
                                    tileIndex={index}
                                    dashboardSlug={dashboard.slug}
                                />
                            ) : tile.type === DashboardTileTypes.DATA_APP ? (
                                <EmbedDataAppTile
                                    key={tile.uuid}
                                    tile={tile}
                                    projectUuid={projectUuid}
                                />
                            ) : (
                                assertUnreachable(
                                    tile,
                                    `Dashboard tile type is not recognised`,
                                )
                            )}
                        </div>
                    ))}
                </ResponsiveGridLayout>
            </div>
        )}
    </Group>
);

const EmbedDashboard: FC<{
    containerStyles?: React.CSSProperties;
    initialDashboard?: EmbedDashboardType;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
}> = ({
    containerStyles,
    initialDashboard,
    isEditMode: controlledIsEditMode,
    onEditModeChange,
}) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const setActiveTab = useDashboardContext((c) => c.setActiveTab);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setHaveTilesChanged = useDashboardContext(
        (c) => c.setHaveTilesChanged,
    );
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setHaveTabsChanged = useDashboardContext((c) => c.setHaveTabsChanged);
    const haveTabsChanged = useDashboardContext((c) => c.haveTabsChanged);

    const { embedToken, mode, paletteUuid, writeActions } = useEmbed();
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const [localDashboard, setLocalDashboard] = useState<
        EmbedDashboardType | undefined
    >(initialDashboard);
    const [uncontrolledIsEditMode, setUncontrolledIsEditMode] = useState(false);
    const isEditModeControlled = controlledIsEditMode !== undefined;
    const isEditMode = controlledIsEditMode ?? uncontrolledIsEditMode;
    const setIsEditMode = useCallback(
        (nextIsEditMode: boolean) => {
            if (!isEditModeControlled) {
                setUncontrolledIsEditMode(nextIsEditMode);
            }
            onEditModeChange?.(nextIsEditMode);
        },
        [isEditModeControlled, onEditModeChange],
    );
    const [draftDashboardName, setDraftDashboardName] = useState(
        initialDashboard?.name ?? '',
    );
    const [currentCols, setCurrentCols] = useState(
        getResponsiveGridLayoutProps().cols.lg,
    );

    if (!embedToken) {
        throw new Error('Embed token is required');
    }

    const { data: fetchedDashboard, error: dashboardError } = useEmbedDashboard(
        projectUuid,
        paletteUuid,
        !initialDashboard,
    );

    useEffect(() => {
        if (initialDashboard) {
            setLocalDashboard(initialDashboard);
        }
    }, [initialDashboard]);

    useEffect(() => {
        if (fetchedDashboard) {
            setLocalDashboard(fetchedDashboard);
        }
    }, [fetchedDashboard]);

    const dashboard = localDashboard;

    const handleDashboardUpdateSuccess = useCallback(
        (updatedDashboard: EmbedDashboardType) => {
            setLocalDashboard((currentDashboard) => ({
                ...currentDashboard,
                ...updatedDashboard,
            }));
            setDashboardTiles(updatedDashboard.tiles);
            setDashboardTabs(updatedDashboard.tabs);
            setDraftDashboardName(updatedDashboard.name);
            setHaveTilesChanged(false);
            setHaveTabsChanged(false);
            setIsEditMode(false);
        },
        [
            setDashboardTabs,
            setDashboardTiles,
            setHaveTabsChanged,
            setHaveTilesChanged,
            setIsEditMode,
        ],
    );

    const { mutate: updateDashboard, isLoading: isSaving } = useUpdateDashboard(
        dashboard?.uuid,
        projectUuid,
        false,
        handleDashboardUpdateSuccess,
    );

    useEffect(() => {
        if (dashboard) {
            setDashboardTiles(dashboard.tiles);
        }
    }, [dashboard, setDashboardTiles]);

    useEffect(() => {
        if (!dashboard || isEditMode) return;

        setDraftDashboardName(dashboard.name);
    }, [dashboard, isEditMode]);

    const setEmbedDashboard = useDashboardContext((c) => c.setEmbedDashboard);
    useEffect(() => {
        if (dashboard) {
            setEmbedDashboard(dashboard);
        }
    }, [dashboard, setEmbedDashboard]);
    const requiredDashboardFilters = useDashboardContext(
        (c) => c.requiredDashboardFilters,
    );

    const hasRequiredDashboardFiltersToSet =
        requiredDashboardFilters.length > 0;
    const currentDashboardTiles = useMemo(
        () => dashboardTiles ?? dashboard?.tiles ?? [],
        [dashboard?.tiles, dashboardTiles],
    );
    const hasChartTiles =
        useMemo(
            () =>
                currentDashboardTiles.some(
                    (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                ),
            [currentDashboardTiles],
        ) || false;

    // Ensure dashboard tabs are set in context
    useEffect(() => {
        if (!dashboardTabs.length && dashboard && dashboard.tabs.length > 0) {
            setDashboardTabs(dashboard.tabs);
        }
    }, [dashboardTabs, setDashboardTabs, dashboard]);

    // Embed is always view-only — hidden tabs (and their tiles) must not
    // surface, neither in the tab bar nor in the grid.
    const visibleTabs = useMemo(
        () => dashboardTabs.filter((tab) => !tab.hidden),
        [dashboardTabs],
    );

    // Filter tiles by active tab
    const filteredTiles = useMemo(() => {
        const hiddenTabUuids = new Set(
            dashboardTabs.filter((t) => t.hidden).map((t) => t.uuid),
        );
        const tilesOnVisibleTabs = currentDashboardTiles.filter(
            (tile) => !tile.tabUuid || !hiddenTabUuids.has(tile.tabUuid),
        );

        // If no tabs or only one visible tab, show all tiles on visible tabs
        if (visibleTabs.length <= 1) {
            return tilesOnVisibleTabs;
        }

        // Make sure we have a tab selected
        const tab = activeTab || visibleTabs[0];

        // If there are tabs, filter tiles by active tab
        if (tab) {
            return tilesOnVisibleTabs.filter((tile) => {
                // Show tiles that belong to the active tab
                const tileBelongsToActiveTab = tile.tabUuid === tab.uuid;

                // Show tiles that don't belong to any tab (legacy tiles) on the first tab
                const tileHasNoTab = !tile.tabUuid;
                const isFirstTab = tab.uuid === visibleTabs[0]?.uuid;

                return tileBelongsToActiveTab || (tileHasNoTab && isFirstTab);
            });
        }

        return [];
    }, [currentDashboardTiles, dashboardTabs, visibleTabs, activeTab]);

    // Check if tabs should be enabled (more than one visible tab)
    const tabsEnabled = visibleTabs.length > 1;

    const gridProps = getResponsiveGridLayoutProps({ enableAnimation: false });
    const layouts = useMemo(
        () => ({
            lg: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, isEditMode, gridProps.cols.lg),
            ),
            md: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, isEditMode, gridProps.cols.md),
            ),
            sm: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, isEditMode, gridProps.cols.sm),
            ),
        }),
        [filteredTiles, gridProps.cols, isEditMode],
    );

    const canWriteDashboard =
        !!writeActions && dashboard?.spaceUuid === writeActions.spaceUuid;
    const hasDashboardNameChanged =
        !!dashboard && draftDashboardName.trim() !== dashboard.name;
    const hasDashboardChanged =
        hasDashboardNameChanged ||
        haveTilesChanged ||
        haveFiltersChanged ||
        haveTabsChanged;

    const handleLayoutChange = useCallback(
        (layout: Layout[]) => {
            const unscaledLayout = convertLayoutToBaseCoordinates(
                layout,
                currentCols,
            );

            const nextTiles = currentDashboardTiles.map((tile) => {
                const layoutTile = unscaledLayout.find(
                    ({ i }) => i === tile.uuid,
                );
                if (!layoutTile) {
                    return tile;
                }
                return {
                    ...tile,
                    x: layoutTile.x,
                    y: layoutTile.y,
                    h: layoutTile.h,
                    w: layoutTile.w,
                };
            });
            setDashboardTiles(nextTiles);
            setHaveTilesChanged(true);
        },
        [
            currentCols,
            currentDashboardTiles,
            setDashboardTiles,
            setHaveTilesChanged,
        ],
    );

    const handleAddTiles = useCallback(
        (tiles: DashboardTile[]) => {
            const tilesToAdd =
                tabsEnabled && activeTab
                    ? tiles.map((tile) => ({
                          ...tile,
                          tabUuid: activeTab.uuid,
                      }))
                    : tiles;
            const nextTiles = appendNewTilesToBottom(
                currentDashboardTiles,
                tilesToAdd,
            );
            setDashboardTiles(nextTiles);
            setHaveTilesChanged(true);
        },
        [
            activeTab,
            currentDashboardTiles,
            tabsEnabled,
            setDashboardTiles,
            setHaveTilesChanged,
        ],
    );

    const handleDeleteTile = useCallback(
        (tile: DashboardTile) => {
            const nextTiles = currentDashboardTiles.filter(
                (dashboardTile) => dashboardTile.uuid !== tile.uuid,
            );
            setDashboardTiles(nextTiles);
            setHaveTilesChanged(true);
        },
        [currentDashboardTiles, setDashboardTiles, setHaveTilesChanged],
    );

    const handleEditTile = useCallback(
        (updatedTile: DashboardTile) => {
            const nextTiles = currentDashboardTiles.map((tile) =>
                tile.uuid === updatedTile.uuid ? updatedTile : tile,
            );
            setDashboardTiles(nextTiles);
            setHaveTilesChanged(true);
        },
        [currentDashboardTiles, setDashboardTiles, setHaveTilesChanged],
    );

    const resetDashboardDraft = useCallback(() => {
        if (!dashboard) return;
        setDashboardTiles(dashboard.tiles);
        setDashboardTabs(dashboard.tabs);
        setDraftDashboardName(dashboard.name);
        setHaveTilesChanged(false);
        setHaveTabsChanged(false);
    }, [
        dashboard,
        setDashboardTabs,
        setDashboardTiles,
        setHaveTabsChanged,
        setHaveTilesChanged,
    ]);

    useEffect(() => {
        if (!isEditMode) {
            resetDashboardDraft();
        }
    }, [isEditMode, resetDashboardDraft]);

    const handleCancel = useCallback(() => {
        resetDashboardDraft();
        setIsEditMode(false);
    }, [resetDashboardDraft, setIsEditMode]);

    const handleSaveDashboard = useCallback(() => {
        if (!dashboard) return;

        updateDashboard({
            tiles: currentDashboardTiles,
            filters: {
                dimensions: [
                    ...dashboardFilters.dimensions,
                    ...dashboardTemporaryFilters.dimensions,
                ],
                metrics: [
                    ...dashboardFilters.metrics,
                    ...dashboardTemporaryFilters.metrics,
                ],
                tableCalculations: [
                    ...dashboardFilters.tableCalculations,
                    ...dashboardTemporaryFilters.tableCalculations,
                ],
            },
            name: draftDashboardName.trim() || dashboard.name,
            tabs: dashboardTabs,
            config: dashboard.config,
            parameters: dashboard.parameters,
        });
    }, [
        dashboard,
        dashboardFilters,
        dashboardTabs,
        dashboardTemporaryFilters,
        draftDashboardName,
        currentDashboardTiles,
        updateDashboard,
    ]);

    if (!projectUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Missing project UUID" />
            </div>
        );
    }
    if (dashboardError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Error loading dashboard"
                    icon={IconUnlink}
                    description={
                        dashboardError.error.message.includes('jwt expired')
                            ? 'This embed link has expired'
                            : dashboardError.error.message
                    }
                />
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }

    // Check if current tab is empty
    const isTabEmpty = tabsEnabled && filteredTiles.length === 0;

    // Sync tabs with URL when user changes tab for iframes.
    // SDK mode does not sync URL when user changes tab because
    // the SDK app uses the same URL as the embedding app.
    const handleTabChange = (tabUuid: string | null) => {
        if (!tabUuid) return;
        const tab = visibleTabs.find((t) => t.uuid === tabUuid);
        if (tab) {
            setActiveTab(tab);

            if (mode === 'direct') {
                const newParams = new URLSearchParams(search);
                const currentPath = pathname;

                // Update URL to include tab UUID
                const newPath = currentPath.includes('/tabs/')
                    ? currentPath.replace(/\/tabs\/[^/]+$/, `/tabs/${tab.uuid}`)
                    : `${currentPath}/tabs/${tab.uuid}`;

                void navigate(
                    {
                        pathname: newPath,
                        search: newParams.toString(),
                    },
                    { replace: true },
                );
            }
        }
    };

    const renderEditControls = () => {
        if (!canWriteDashboard) return null;

        if (!isEditMode) {
            if (isEditModeControlled) return null;

            return (
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={() => setIsEditMode(true)}
                >
                    Edit
                </Button>
            );
        }

        return (
            <Group gap="xs">
                <AddTileButton
                    onAddTiles={handleAddTiles}
                    setAddingTab={() => undefined}
                    activeTabUuid={activeTab?.uuid}
                    dashboardTabs={dashboardTabs}
                    allowedTileTypes={EMBED_EDIT_TILE_TYPES}
                    spaceUuid={writeActions?.spaceUuid}
                    maxSelectedValues={1}
                    disabled={isSaving}
                />
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconX} />}
                    onClick={handleCancel}
                    disabled={isSaving}
                >
                    Cancel
                </Button>
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconCheck} />}
                    onClick={handleSaveDashboard}
                    loading={isSaving}
                    disabled={!hasDashboardChanged}
                >
                    Save
                </Button>
            </Group>
        );
    };

    const renderDashboardEditToolbar = () => {
        const editControls = renderEditControls();

        if (!editControls && !(canWriteDashboard && isEditMode)) return null;

        return (
            <Group
                justify={
                    canWriteDashboard && isEditMode
                        ? 'space-between'
                        : 'flex-end'
                }
                px="lg"
                pt="sm"
            >
                {canWriteDashboard && isEditMode ? (
                    <TextInput
                        aria-label="Dashboard title"
                        value={draftDashboardName}
                        onChange={(event) =>
                            setDraftDashboardName(event.currentTarget.value)
                        }
                        size="xs"
                        w={320}
                    />
                ) : null}
                {editControls}
            </Group>
        );
    };

    return (
        <div
            // Used by EmbedDashboardExportPdf to temporarily set height:auto for multipage PDF printing
            id="embed-scroll-container"
            style={
                containerStyles ?? {
                    height: '100vh',
                    overflowY: 'auto',
                }
            }
        >
            <LockedDashboardModal
                opened={hasRequiredDashboardFiltersToSet && !!hasChartTiles}
            />

            {currentDashboardTiles.length === 0 ? (
                <>
                    <EmbedDashboardHeader
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                    />
                    {renderDashboardEditToolbar()}
                    <div style={{ marginTop: '20px' }}>
                        <SuboptimalState
                            title="Empty dashboard"
                            description="This dashboard has no tiles"
                        />
                    </div>
                </>
            ) : tabsEnabled ? (
                <Tabs
                    value={activeTab?.uuid}
                    onChange={handleTabChange}
                    classNames={{
                        list: tabStyles.list,
                        tab: tabStyles.tab,
                    }}
                >
                    <EmbedDashboardHeader
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                        tabs={
                            <Tabs.List px="lg">
                                {visibleTabs.map((tab) => (
                                    <Tabs.Tab
                                        key={tab.uuid}
                                        value={tab.uuid}
                                        maw={`${
                                            100 / (visibleTabs.length || 1)
                                        }vw`}
                                    >
                                        {tab.name}
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>
                        }
                    />
                    {renderDashboardEditToolbar()}
                    <EmbedDashboardGrid
                        filteredTiles={filteredTiles}
                        layouts={layouts}
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                        paletteColors={dashboard.selectedPalette?.colors}
                        paletteDarkColors={
                            dashboard.selectedPalette?.darkColors
                        }
                        hasRequiredDashboardFiltersToSet={
                            hasRequiredDashboardFiltersToSet
                        }
                        isTabEmpty={isTabEmpty}
                        gridProps={gridProps}
                        isEditMode={isEditMode}
                        onLayoutChange={handleLayoutChange}
                        onBreakpointChange={setCurrentCols}
                        onDeleteTile={handleDeleteTile}
                        onEditTile={handleEditTile}
                        useDashboardEditorTileQueries={canWriteDashboard}
                    />
                </Tabs>
            ) : (
                <>
                    <EmbedDashboardHeader
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                    />
                    {renderDashboardEditToolbar()}
                    <EmbedDashboardGrid
                        filteredTiles={filteredTiles}
                        layouts={layouts}
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                        paletteColors={dashboard.selectedPalette?.colors}
                        paletteDarkColors={
                            dashboard.selectedPalette?.darkColors
                        }
                        hasRequiredDashboardFiltersToSet={
                            hasRequiredDashboardFiltersToSet
                        }
                        gridProps={gridProps}
                        isEditMode={isEditMode}
                        onLayoutChange={handleLayoutChange}
                        onBreakpointChange={setCurrentCols}
                        onDeleteTile={handleDeleteTile}
                        onEditTile={handleEditTile}
                        useDashboardEditorTileQueries={canWriteDashboard}
                    />
                </>
            )}
        </div>
    );
};

export default EmbedDashboard;
