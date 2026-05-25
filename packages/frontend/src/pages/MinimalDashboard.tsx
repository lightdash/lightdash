import type {
    Dashboard,
    DashboardFilterRule,
    DashboardTab,
    ParametersValuesMap,
} from '@lightdash/common';
import {
    assertUnreachable,
    DASHBOARD_GRID_CLASS,
    DashboardTileTypes,
    isDashboardScheduler,
    isTileInSelectedTabs,
    SessionStorageKeys,
} from '@lightdash/common';
import { useSessionStorage } from '@mantine/hooks';
import { IconLayoutDashboard } from '@tabler/icons-react';
import { useEffect, useMemo, type FC, type ReactNode } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import ScreenshotProgressIndicator from '../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ChartTile from '../components/DashboardTiles/DashboardChartTile';
import DataAppTile from '../components/DashboardTiles/DashboardDataAppTile';
import HeadingTile from '../components/DashboardTiles/DashboardHeadingTile';
import LoomTile from '../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../components/DashboardTiles/DashboardMarkdownTile';
import SqlChartTile from '../components/DashboardTiles/DashboardSqlChartTile';
import MinimalDashboardTabs from '../components/MinimalDashboardTabs';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from '../features/dashboardTabs/gridUtils';
import { useScheduler } from '../features/scheduler/hooks/useScheduler';
import { useDashboardQuery } from '../hooks/dashboard/useDashboard';
import {
    getActiveDashboardTab,
    getDateZoomGranularityFromSearch,
    getMinimalDashboardTabPath,
    sortDashboardTabs,
} from '../providers/Dashboard/dashboardPageUtils';
import DashboardProvider from '../providers/Dashboard/DashboardProvider';
import { DashboardRouterProvider } from '../providers/Dashboard/DashboardRouterProvider';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import { useDashboardPageContext } from '../providers/Dashboard/useDashboardPageContext';
import useDashboardTileStatusContext from '../providers/Dashboard/useDashboardTileStatusContext';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);
type TabGroup = {
    key: string;
    tiles: Dashboard['tiles'];
    layouts: { lg: Layout[]; md: Layout[] };
};

type MinimalDashboardContentProps = {
    filteredAndSortedDashboardTiles: Dashboard['tiles'];
    layouts: { lg: Layout[]; md: Layout[] };
    tabGroups: TabGroup[] | null;
    gridProps: ReturnType<typeof getResponsiveGridLayoutProps>;
    isTabEmpty: boolean;
    canNavigateBetweenTabs: boolean;
    tabs: DashboardTab[];
    activeTab: DashboardTab | null;
    onTabChange: (tabUuid: string) => void;
};

const renderDashboardTile = (tile: Dashboard['tiles'][number]) => {
    switch (tile.type) {
        case DashboardTileTypes.SAVED_CHART:
            return (
                <ChartTile
                    key={tile.uuid}
                    minimal
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.MARKDOWN:
            return (
                <MarkdownTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.LOOM:
            return (
                <LoomTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.SQL_CHART:
            return (
                <SqlChartTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.HEADING:
            return (
                <HeadingTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        case DashboardTileTypes.DATA_APP:
            return (
                <DataAppTile
                    key={tile.uuid}
                    tile={tile}
                    isEditMode={false}
                    onDelete={() => {}}
                    onEdit={() => {}}
                />
            );
        default:
            return assertUnreachable(
                tile,
                `Dashboard tile type is not recognised`,
            );
    }
};

const MinimalDashboardContent: FC<MinimalDashboardContentProps> = ({
    filteredAndSortedDashboardTiles,
    layouts,
    tabGroups,
    gridProps,
    isTabEmpty,
    canNavigateBetweenTabs,
    tabs,
    activeTab,
    onTabChange,
}) => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);

    const isReadyForScreenshot = useDashboardTileStatusContext(
        (c) => c.isReadyForScreenshot,
    );
    const expectedScreenshotTilesCount = useDashboardTileStatusContext(
        (c) => c.expectedScreenshotTilesCount,
    );
    const screenshotReadyTilesCount = useDashboardTileStatusContext(
        (c) => c.screenshotReadyTilesCount,
    );
    const screenshotErroredTilesCount = useDashboardTileStatusContext(
        (c) => c.screenshotErroredTilesCount,
    );
    const expectedScreenshotTileUuids = useDashboardTileStatusContext(
        (c) => c.expectedScreenshotTileUuids,
    );
    const screenshotReadyTileUuids = useDashboardTileStatusContext(
        (c) => c.screenshotReadyTileUuids,
    );
    const screenshotErroredTileUuids = useDashboardTileStatusContext(
        (c) => c.screenshotErroredTileUuids,
    );

    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;

        setDashboardTiles(dashboard?.tiles ?? []);
        setDashboardTabs(dashboard?.tabs ?? []);
    }, [
        isDashboardLoading,
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTabs,
    ]);

    // Wait for dashboardTiles to be set in context before rendering tiles.
    // This prevents a race condition where tiles call markTileScreenshotErrored
    // before the context is initialized, then the reset effect clears that status.
    if (!dashboardTiles) {
        return null;
    }

    return (
        <>
            {/* This is when viewing a dashboard with tabs in mobile mode - you can navigate between tabs. */}
            {canNavigateBetweenTabs && (
                <MinimalDashboardTabs
                    tabs={tabs}
                    activeTabId={activeTab?.uuid || null}
                    onTabChange={onTabChange}
                />
            )}

            {isTabEmpty ? (
                <SuboptimalState
                    icon={IconLayoutDashboard}
                    title="Tab is empty"
                    mt="40px"
                />
            ) : (
                // Wrapper is the deterministic screenshot/PDF target used by
                // UnfurlService — it must encompass all grids so multi-tab
                // exports are captured fully.
                <div className={DASHBOARD_GRID_CLASS}>
                    {tabGroups ? (
                        // Multi-tab export: one grid per tab so each tab
                        // keeps its own y=0 origin and react-grid-layout's
                        // vertical compact cannot flow tiles from one tab
                        // into another tab's empty cells.
                        tabGroups.map((group) => (
                            <ResponsiveGridLayout
                                key={group.key}
                                {...gridProps}
                                layouts={group.layouts}
                            >
                                {group.tiles.map((tile) => (
                                    <div key={tile.uuid}>
                                        {renderDashboardTile(tile)}
                                    </div>
                                ))}
                            </ResponsiveGridLayout>
                        ))
                    ) : (
                        <ResponsiveGridLayout {...gridProps} layouts={layouts}>
                            {filteredAndSortedDashboardTiles.map((tile) => (
                                <div key={tile.uuid}>
                                    {renderDashboardTile(tile)}
                                </div>
                            ))}
                        </ResponsiveGridLayout>
                    )}
                </div>
            )}

            <ScreenshotProgressIndicator
                expectedTileUuids={expectedScreenshotTileUuids}
                readyTileUuids={screenshotReadyTileUuids}
                erroredTileUuids={screenshotErroredTileUuids}
            />
            {isReadyForScreenshot && (
                <ScreenshotReadyIndicator
                    tilesTotal={expectedScreenshotTilesCount}
                    tilesReady={screenshotReadyTilesCount}
                    tilesErrored={screenshotErroredTilesCount}
                />
            )}
        </>
    );
};

type MinimalDashboardViewProps = {
    dashboardContextBridge?: ReactNode;
};

export const MinimalDashboardView: FC<MinimalDashboardViewProps> = ({
    dashboardContextBridge,
}) => {
    const projectUuid = useDashboardPageContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardPageContext((c) => c.dashboardUuid);
    const tabUuid = useDashboardPageContext((c) => c.tabUuid);
    const search = useDashboardPageContext((c) => c.search);
    const switchToTab = useDashboardPageContext((c) => c.switchToTab);

    const searchParams = useMemo(() => new URLSearchParams(search), [search]);
    const schedulerUuid = searchParams.get('schedulerUuid');
    const schedulerTabs = searchParams.get('selectedTabs');
    const dateZoom = useMemo(
        () => getDateZoomGranularityFromSearch(search),
        [search],
    );

    const [sendNowSchedulerFilters] = useSessionStorage<
        DashboardFilterRule[] | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_FILTERS,
    });

    const [sendNowSchedulerParameters] = useSessionStorage<
        ParametersValuesMap | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_PARAMETERS,
    });

    const {
        data: dashboard,
        isError: isDashboardError,
        error: dashboardError,
    } = useDashboardQuery({
        uuidOrSlug: dashboardUuid,
        projectUuid,
    });

    const activeTab = useMemo(
        () =>
            getActiveDashboardTab({
                tabs: dashboard?.tabs ?? [],
                tabUuid,
                isEditMode: false,
            }) ?? null,
        [dashboard?.tabs, tabUuid],
    );

    const {
        data: scheduler,
        isError: isSchedulerError,
        error: schedulerError,
    } = useScheduler(schedulerUuid, {
        enabled: !!schedulerUuid && !sendNowSchedulerFilters,
    });

    const schedulerFilters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.filters;
        }

        return sendNowSchedulerFilters;
    }, [scheduler, schedulerUuid, sendNowSchedulerFilters]);

    const schedulerParameters = useMemo(() => {
        if (schedulerUuid && scheduler && isDashboardScheduler(scheduler)) {
            return scheduler.parameters;
        }

        return sendNowSchedulerParameters;
    }, [scheduler, schedulerUuid, sendNowSchedulerParameters]);

    const schedulerTabsSelected = useMemo(() => {
        if (schedulerTabs) {
            return JSON.parse(schedulerTabs);
        }
        return undefined;
    }, [schedulerTabs]);

    const sortedTabs = useMemo(
        () => sortDashboardTabs(dashboard?.tabs ?? []),
        [dashboard?.tabs],
    );
    const navigableTabs = useMemo(
        () => sortedTabs.filter((tab) => !tab.hidden),
        [sortedTabs],
    );

    const gridProps = getResponsiveGridLayoutProps({
        stackVerticallyOnSmallestBreakpoint: true,
    });

    const filteredAndSortedDashboardTiles = useMemo(() => {
        const filteredTiles =
            dashboard?.tiles.filter((tile) => {
                // If there are selected tabs when sending now/scheduling, aggregate ALL tiles into one view.
                // Orphan tiles (tabUuid null/undefined) are always included so picked-tab PDF
                // exports surface legacy tiles on the first tab, matching the backend rule in
                // isTileInSelectedTabs (PROD-2505).
                if (schedulerTabsSelected) {
                    return isTileInSelectedTabs(tile, schedulerTabsSelected);
                }

                // This is when viewed a dashboard with tabs in mobile mode - you can navigate between tabs.
                if (!activeTab) {
                    return true;
                }

                // Tile belongs to tab
                if (tile.tabUuid === activeTab.uuid) return true;

                // Show legacy tiles (without tabUuid) on the first tab for backwards compatibility
                const tileHasNoTab = !tile.tabUuid;
                const isFirstTab =
                    activeTab.uuid ===
                    (navigableTabs[0]?.uuid ?? sortedTabs[0]?.uuid);

                return tileHasNoTab && isFirstTab;
            }) ?? [];

        // Sort tiles by their tab order
        return filteredTiles.sort((a, b) => {
            const tabAIndex = sortedTabs.findIndex(
                (tab) => tab.uuid === a.tabUuid,
            );
            const tabBIndex = sortedTabs.findIndex(
                (tab) => tab.uuid === b.tabUuid,
            );
            return tabAIndex - tabBIndex;
        });
    }, [
        dashboard?.tiles,
        schedulerTabsSelected,
        activeTab,
        navigableTabs,
        sortedTabs,
    ]);

    const layouts = useMemo(() => {
        return {
            lg: filteredAndSortedDashboardTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.lg),
            ),
            md: filteredAndSortedDashboardTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.md),
            ),
        };
    }, [filteredAndSortedDashboardTiles, gridProps.cols]);

    // Multi-tab export: group tiles per tab so each tab renders in its own
    // <ResponsiveGridLayout>. Tabs share the same y=0 origin, so a single grid
    // lets react-grid-layout's vertical compact reflow tiles across tab
    // boundaries (PROD-2505-style overlap).
    //
    // Orphan tiles (no tabUuid) are merged into the first tab's group so they
    // share its grid coordinate space — matching how the regular dashboard
    // view renders them on the first tab (PROD-2505 fix). If they had their
    // own grid, orphans that were positioned to share a row with first-tab
    // tiles (e.g. left/right halves at y=0) would get split into two stacked
    // rows in the export. If no tabs have tiles, orphans get their own group.
    const tabGroups = useMemo<TabGroup[] | null>(() => {
        if (!schedulerTabsSelected) return null;

        const tilesByTab = new Map<string, Dashboard['tiles']>();
        const orphanTiles: Dashboard['tiles'] = [];
        for (const tile of filteredAndSortedDashboardTiles) {
            if (!tile.tabUuid) {
                orphanTiles.push(tile);
                continue;
            }
            const bucket = tilesByTab.get(tile.tabUuid) ?? [];
            bucket.push(tile);
            tilesByTab.set(tile.tabUuid, bucket);
        }

        const buildLayouts = (tiles: Dashboard['tiles']) => ({
            lg: tiles.map((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.lg),
            ),
            md: tiles.map((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.md),
            ),
        });

        const groups: TabGroup[] = [];
        let orphansAssigned = false;
        for (const tab of sortedTabs) {
            const tabTiles = tilesByTab.get(tab.uuid);
            if (!tabTiles || tabTiles.length === 0) continue;

            const tiles =
                !orphansAssigned && orphanTiles.length > 0
                    ? [...orphanTiles, ...tabTiles]
                    : tabTiles;
            if (!orphansAssigned && orphanTiles.length > 0) {
                orphansAssigned = true;
            }
            groups.push({
                key: tab.uuid,
                tiles,
                layouts: buildLayouts(tiles),
            });
        }

        // No selected tab has tiles — fall back to orphan-only group so they
        // still render.
        if (!orphansAssigned && orphanTiles.length > 0) {
            groups.push({
                key: 'orphan-tiles',
                tiles: orphanTiles,
                layouts: buildLayouts(orphanTiles),
            });
        }
        return groups;
    }, [
        schedulerTabsSelected,
        filteredAndSortedDashboardTiles,
        sortedTabs,
        gridProps.cols,
    ]);

    if (isDashboardError || isSchedulerError) {
        if (dashboardError) return <span>{dashboardError.error.message}</span>;
        if (schedulerError) return <span>{schedulerError.error.message}</span>;
    }

    if (!dashboard) {
        return <span>Loading...</span>;
    }

    if (schedulerUuid && !scheduler) {
        return <span>Loading...</span>;
    }

    if (dashboard.tiles.length === 0) {
        return <span>No tiles</span>;
    }

    const isTabEmpty =
        activeTab && filteredAndSortedDashboardTiles.length === 0;

    const canNavigateBetweenTabs =
        !schedulerTabsSelected && navigableTabs.length > 0;

    return (
        <DashboardProvider
            projectUuid={projectUuid}
            schedulerFilters={schedulerFilters}
            schedulerParameters={schedulerParameters}
            schedulerTabsSelected={schedulerTabsSelected}
            dateZoom={dateZoom}
            defaultInvalidateCache={true}
        >
            {dashboardContextBridge}
            <MinimalDashboardContent
                filteredAndSortedDashboardTiles={
                    filteredAndSortedDashboardTiles
                }
                layouts={layouts}
                tabGroups={tabGroups}
                gridProps={gridProps}
                isTabEmpty={!!isTabEmpty}
                canNavigateBetweenTabs={canNavigateBetweenTabs}
                tabs={navigableTabs}
                activeTab={activeTab}
                onTabChange={switchToTab}
            />
        </DashboardProvider>
    );
};

const MinimalDashboard: FC = () => (
    <DashboardRouterProvider buildTabPath={getMinimalDashboardTabPath}>
        <MinimalDashboardView />
    </DashboardRouterProvider>
);

export default MinimalDashboard;
