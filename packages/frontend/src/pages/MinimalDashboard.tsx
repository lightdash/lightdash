import type {
    Dashboard,
    DashboardFilters,
    DashboardFilterRule,
    DashboardTab,
    ParametersValuesMap,
} from '@lightdash/common';
import {
    assertUnreachable,
    DASHBOARD_GRID_CLASS,
    DashboardTileTypes,
    EXPORT_TAB_PAGE_CLASS,
    getPagedExportOrphanHomeTabUuid,
    isDashboardScheduler,
    isTileInSelectedTabs,
    SessionStorageKeys,
} from '@lightdash/common';
import { Stack, Text, Title } from '@mantine-8/core';
import { useSessionStorage } from '@mantine/hooks';
import { IconLayoutDashboard } from '@tabler/icons-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useParams } from 'react-router';
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
import { useDateZoomGranularitySearch } from '../hooks/useExplorerRoute';
import useSearchParams from '../hooks/useSearchParams';
import DashboardProvider from '../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../providers/Dashboard/useDashboardTileStatusContext';
import '../styles/export-paged-tabs.css';
import '../styles/react-grid.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

type TabWithUrls = DashboardTab & {
    prevUrl: string | null;
    nextUrl: string | null;
    selfUrl: string;
};

type TabGroup = {
    key: string;
    tab: DashboardTab | null;
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
    tabsWithUrls: TabWithUrls[];
    activeTab: DashboardTab | null;
    exportPagedTabs: boolean;
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
    tabsWithUrls,
    activeTab,
    exportPagedTabs,
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
                    tabs={tabsWithUrls}
                    activeTabId={activeTab?.uuid || null}
                />
            )}

            {/* Wrapper is the deterministic screenshot/PDF target used by
                UnfurlService — it must encompass all grids (and the empty
                state) so multi-tab exports are captured fully. */}
            <div className={DASHBOARD_GRID_CLASS}>
                {isTabEmpty ? (
                    <SuboptimalState
                        icon={IconLayoutDashboard}
                        title="Tab is empty"
                        mt="40px"
                    />
                ) : tabGroups ? (
                    // Multi-tab export: one grid per tab so each tab
                    // keeps its own y=0 origin and react-grid-layout's
                    // vertical compact cannot flow tiles from one tab
                    // into another tab's empty cells.
                    tabGroups.map((group) => {
                        const grid =
                            group.tiles.length === 0 ? (
                                <SuboptimalState
                                    icon={IconLayoutDashboard}
                                    title="Tab is empty"
                                    mt="40px"
                                />
                            ) : (
                                <ResponsiveGridLayout
                                    {...gridProps}
                                    layouts={group.layouts}
                                >
                                    {group.tiles.map((tile) => (
                                        <div key={tile.uuid}>
                                            {renderDashboardTile(tile)}
                                        </div>
                                    ))}
                                </ResponsiveGridLayout>
                            );
                        if (!exportPagedTabs) {
                            return <Fragment key={group.key}>{grid}</Fragment>;
                        }
                        // One page per tab: header block + grid (or empty
                        // state) inside a break-avoid page container.
                        return (
                            <div
                                key={group.key}
                                className={EXPORT_TAB_PAGE_CLASS}
                            >
                                {dashboard && (
                                    <Stack gap={0} p="md">
                                        <Title order={3}>
                                            {dashboard.name}
                                        </Title>
                                        {group.tab && (
                                            <Text size="sm" c="ldGray.6">
                                                {group.tab.name}
                                            </Text>
                                        )}
                                    </Stack>
                                )}
                                {grid}
                            </div>
                        );
                    })
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

const MinimalDashboard: FC = () => {
    const { projectUuid, dashboardUuid, tabUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
        tabUuid?: string;
    }>();

    const schedulerUuid = useSearchParams('schedulerUuid');

    const [sendNowSchedulerFilters] = useSessionStorage<
        DashboardFilterRule[] | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_FILTERS,
    });

    const [sendNowSchedulerDashboardFilters] = useSessionStorage<
        DashboardFilters | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_DASHBOARD_FILTERS,
    });

    const [sendNowSchedulerParameters] = useSessionStorage<
        ParametersValuesMap | undefined
    >({
        key: SessionStorageKeys.SEND_NOW_SCHEDULER_PARAMETERS,
    });

    const schedulerTabs = useSearchParams('selectedTabs');
    const dateZoom = useDateZoomGranularitySearch();

    const {
        data: dashboard,
        isError: isDashboardError,
        error: dashboardError,
    } = useDashboardQuery({
        uuidOrSlug: dashboardUuid,
        projectUuid,
    });

    const [activeTab, setActiveTab] = useState<DashboardTab | null>(null);

    useEffect(() => {
        // Minimal/embed renders are always treated as view mode — hidden tabs
        // should not be selectable. Fall back to the first visible tab.
        const visibleTabs = dashboard?.tabs.filter((tab) => !tab.hidden) ?? [];
        const matchedTab =
            visibleTabs.find((tab) => tab.uuid === tabUuid) ?? visibleTabs[0];
        setActiveTab(matchedTab || null);
    }, [tabUuid, dashboard?.tabs]);

    const {
        data: scheduler,
        isError: isSchedulerError,
        error: schedulerError,
    } = useScheduler(schedulerUuid, {
        enabled: !!schedulerUuid && !sendNowSchedulerFilters,
    });

    const schedulerDashboardFilters = useMemo(() => {
        return sendNowSchedulerDashboardFilters;
    }, [sendNowSchedulerDashboardFilters]);

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

    // Render every selected tab in one page, paginated by print page breaks
    // (see MinimalDashboardContent). Backend: unfurlPdfCssPaged.
    const exportPagedTabs = useSearchParams('exportPagedTabs') === 'true';

    // Chromium's page.pdf() uses document.title as the PDF /Title, so name the
    // exported document after the dashboard in paged export mode.
    useEffect(() => {
        if (exportPagedTabs && dashboard?.name) {
            document.title = dashboard.name;
        }
    }, [exportPagedTabs, dashboard?.name]);

    const generateTabUrl = useCallback(
        (tabId: string) =>
            `/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}/view/tabs/${tabId}`,
        [projectUuid, dashboardUuid],
    );

    const sortedTabs = useMemo(
        () => dashboard?.tabs.sort((a, b) => a.order - b.order) ?? [],
        [dashboard?.tabs],
    );

    const tabsWithUrls = useMemo(() => {
        return sortedTabs.map((tab, index) => {
            const prevTab = sortedTabs[index - 1];
            const nextTab = sortedTabs[index + 1];

            return {
                ...tab,
                prevUrl: prevTab ? generateTabUrl(prevTab.uuid) : null,
                nextUrl: nextTab ? generateTabUrl(nextTab.uuid) : null,
                selfUrl: generateTabUrl(tab.uuid),
            };
        });
    }, [sortedTabs, generateTabUrl]);

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
                const isFirstTab = activeTab.uuid === sortedTabs[0]?.uuid;

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
    }, [dashboard?.tiles, schedulerTabsSelected, activeTab, sortedTabs]);

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
    // Orphan tiles (no tabUuid) are merged into the first group so they share
    // its grid coordinate space — matching how the regular dashboard view
    // renders them on the first tab. If they had their own grid, orphans that
    // shared a row with first-tab tiles would get split into two stacked rows.
    //
    // In paged export every selected tab gets its own group (page), even when
    // empty; the plain multi-tab image only groups tabs that have tiles.
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

        const selectedTabUuids = (
            schedulerTabsSelected as (string | null)[]
        ).filter((t): t is string => t !== null);
        const groupTabs = sortedTabs.filter((tab) =>
            exportPagedTabs
                ? selectedTabUuids.includes(tab.uuid)
                : (tilesByTab.get(tab.uuid)?.length ?? 0) > 0,
        );

        // Orphans ride the first RESOLVED tab's page (not the literal first
        // dashboard tab), so a hidden/unselected first tab doesn't silently
        // drop them. Shared with the backend readiness set via the common
        // helper. The stacked image keeps riding orphans on the first group.
        const orphanHomeTabUuid = getPagedExportOrphanHomeTabUuid(
            groupTabs.map((t) => t.uuid),
        );
        const groups: TabGroup[] = [];
        let orphansAssigned = false;
        for (const tab of groupTabs) {
            const tabTiles = tilesByTab.get(tab.uuid) ?? [];
            const attachOrphansHere =
                orphanTiles.length > 0 &&
                !orphansAssigned &&
                (!exportPagedTabs || tab.uuid === orphanHomeTabUuid);
            const tiles = attachOrphansHere
                ? [...orphanTiles, ...tabTiles]
                : tabTiles;
            if (attachOrphansHere) orphansAssigned = true;
            groups.push({
                key: tab.uuid,
                tab,
                tiles,
                layouts: buildLayouts(tiles),
            });
        }

        // Orphans with no host tab render in their own group (untabbed
        // selection). Never in paged export, where an extra page would break
        // the one-page-per-selected-tab count.
        if (!orphansAssigned && orphanTiles.length > 0 && !exportPagedTabs) {
            groups.push({
                key: 'orphan-tiles',
                tab: null,
                tiles: orphanTiles,
                layouts: buildLayouts(orphanTiles),
            });
        }
        return groups;
    }, [
        schedulerTabsSelected,
        exportPagedTabs,
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

    // In paged export the tabGroups branch renders a per-tab header + "Tab is
    // empty" state inside each page container, so an all-empty selection must
    // NOT short-circuit to a single bare empty state (which would emit zero
    // page containers and break the one-page-per-tab count).
    const isTabEmpty =
        !exportPagedTabs &&
        !!activeTab &&
        filteredAndSortedDashboardTiles.length === 0;

    const canNavigateBetweenTabs =
        !schedulerTabsSelected && tabsWithUrls.length > 0;

    return (
        <DashboardProvider
            projectUuid={projectUuid}
            schedulerDashboardFilters={schedulerDashboardFilters}
            schedulerFilters={schedulerFilters}
            schedulerParameters={schedulerParameters}
            schedulerTabsSelected={schedulerTabsSelected}
            dateZoom={dateZoom}
            defaultInvalidateCache={true}
        >
            <MinimalDashboardContent
                filteredAndSortedDashboardTiles={
                    filteredAndSortedDashboardTiles
                }
                layouts={layouts}
                tabGroups={tabGroups}
                gridProps={gridProps}
                isTabEmpty={!!isTabEmpty}
                canNavigateBetweenTabs={canNavigateBetweenTabs}
                tabsWithUrls={tabsWithUrls}
                activeTab={activeTab}
                exportPagedTabs={exportPagedTabs}
            />
        </DashboardProvider>
    );
};

export default MinimalDashboard;
