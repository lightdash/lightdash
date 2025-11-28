import {
    assertUnreachable,
    DashboardTileTypes,
    type DashboardTile,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useLocation, useNavigate } from 'react-router';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
    type ResponsiveGridLayoutProps,
} from '../../../../../components/DashboardTabs/gridUtils';
import LoomTile from '../../../../../components/DashboardTiles/DashboardLoomTile';
import SqlChartTile from '../../../../../components/DashboardTiles/DashboardSqlChartTile';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { LockedDashboardModal } from '../../../../../components/common/modal/LockedDashboardModal';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useEmbedDashboard } from '../hooks';
import EmbedDashboardChartTile from './EmbedDashboardChartTile';
import EmbedDashboardHeader from './EmbedDashboardHeader';

import { Group, Tabs, Title } from '@mantine/core';
import '../../../../../styles/react-grid.css';
import { EmbedMarkdownTile } from './EmbedMarkdownTile';

const ResponsiveGridLayout = WidthProvider(Responsive);

const EmbedDashboardGrid: FC<{
    filteredTiles: DashboardTile[];
    layouts: { lg: Layout[]; md: Layout[]; sm: Layout[] };
    dashboard: any;
    projectUuid: string;
    hasRequiredDashboardFiltersToSet: boolean;
    isTabEmpty?: boolean;
    gridProps: ResponsiveGridLayoutProps;
}> = ({
    filteredTiles,
    layouts,
    dashboard,
    projectUuid,
    hasRequiredDashboardFiltersToSet,
    isTabEmpty,
    gridProps,
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
            <ResponsiveGridLayout
                {...gridProps}
                layouts={layouts}
                className={`react-grid-layout-dashboard ${
                    hasRequiredDashboardFiltersToSet ? 'locked' : ''
                }`}
            >
                {filteredTiles.map((tile, index) => (
                    <div key={tile.uuid}>
                        {tile.type === DashboardTileTypes.SAVED_CHART ? (
                            <EmbedDashboardChartTile
                                projectUuid={projectUuid}
                                dashboardSlug={dashboard.slug}
                                key={tile.uuid}
                                minimal
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                                canExportCsv={dashboard.canExportCsv}
                                canExportImages={dashboard.canExportImages}
                                locked={hasRequiredDashboardFiltersToSet}
                                tileIndex={index}
                            />
                        ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                            <EmbedMarkdownTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                                tileIndex={index}
                                dashboardSlug={dashboard.slug}
                            />
                        ) : tile.type === DashboardTileTypes.LOOM ? (
                            <LoomTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        ) : tile.type === DashboardTileTypes.SQL_CHART ? (
                            <SqlChartTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
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
        )}
    </Group>
);

const EmbedDashboard: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const activeTab = useDashboardContext((c) => c.activeTab);
    const setActiveTab = useDashboardContext((c) => c.setActiveTab);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);

    const { embedToken, mode } = useEmbed();
    const navigate = useNavigate();
    const { pathname, search } = useLocation();

    if (!embedToken) {
        throw new Error('Embed token is required');
    }

    const { data: dashboard, error: dashboardError } =
        useEmbedDashboard(projectUuid);

    useEffect(() => {
        if (dashboard) {
            setDashboardTiles(dashboard.tiles);
        }
    }, [dashboard, setDashboardTiles]);

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
    const hasChartTiles =
        useMemo(
            () =>
                dashboard?.tiles.some(
                    (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                ),
            [dashboard],
        ) || false;

    // Sort tabs by order
    const sortedTabs = useMemo(() => {
        if (!dashboard?.tabs || dashboard.tabs.length === 0) {
            return [];
        }
        return dashboard.tabs.sort((a, b) => a.order - b.order);
    }, [dashboard?.tabs]);

    // Ensure dashboard tabs are set in context
    useEffect(() => {
        if (!dashboardTabs.length && sortedTabs.length) {
            setDashboardTabs(sortedTabs);
        }
    }, [sortedTabs, dashboardTabs, setDashboardTabs]);

    // Filter tiles by active tab
    const filteredTiles = useMemo(() => {
        if (!dashboard?.tiles) {
            return [];
        }

        // If no tabs or only one tab, show all tiles
        if (sortedTabs.length <= 1) {
            return dashboard.tiles;
        }

        // Make sure we have a tab selected
        const tab = activeTab || sortedTabs[0];

        // If there are tabs, filter tiles by active tab
        if (tab) {
            return dashboard.tiles.filter((tile) => {
                // Show tiles that belong to the active tab
                const tileBelongsToActiveTab = tile.tabUuid === tab.uuid;

                // Show tiles that don't belong to any tab (legacy tiles) on the first tab
                const tileHasNoTab = !tile.tabUuid;
                const isFirstTab = tab.uuid === sortedTabs[0]?.uuid;

                return tileBelongsToActiveTab || (tileHasNoTab && isFirstTab);
            });
        }

        return [];
    }, [dashboard?.tiles, sortedTabs, activeTab]);

    // Check if tabs should be enabled (more than one tab)
    const tabsEnabled = sortedTabs.length > 1;
    const MAGIC_SCROLL_AREA_HEIGHT = 40;

    const gridProps = getResponsiveGridLayoutProps({ enableAnimation: false });
    const layouts = useMemo(
        () => ({
            lg: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.lg),
            ),
            md: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.md),
            ),
            sm: filteredTiles.map<Layout>((tile) =>
                getReactGridLayoutConfig(tile, false, gridProps.cols.sm),
            ),
        }),
        [filteredTiles, gridProps.cols],
    );

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

    if (dashboard.tiles.length === 0) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Empty dashboard"
                    description="This dashboard has no tiles"
                />
            </div>
        );
    }

    // Check if current tab is empty
    const isTabEmpty = tabsEnabled && filteredTiles.length === 0;

    // Sync tabs with URL when user changes tab for iframes.
    // SDK mode does not sync URL when user changes tab because
    // the SDK app uses the same URL as the embedding app.
    const handleTabChange = (tabUuid: string) => {
        const tab = sortedTabs.find((t) => t.uuid === tabUuid);
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

    return (
        <div style={containerStyles ?? { height: '100vh', overflowY: 'auto' }}>
            <EmbedDashboardHeader
                dashboard={dashboard}
                projectUuid={projectUuid}
            />

            <LockedDashboardModal
                opened={hasRequiredDashboardFiltersToSet && !!hasChartTiles}
            />

            {tabsEnabled ? (
                <Tabs
                    value={activeTab?.uuid}
                    onTabChange={handleTabChange}
                    mt="md"
                    styles={{
                        tabsList: {
                            flexWrap: 'nowrap',
                            height: MAGIC_SCROLL_AREA_HEIGHT - 1,
                        },
                    }}
                    variant="outline"
                >
                    <Tabs.List bg="ldGray.0" px="lg">
                        {sortedTabs.map((tab) => (
                            <Tabs.Tab
                                key={tab.uuid}
                                value={tab.uuid}
                                bg={
                                    activeTab?.uuid === tab.uuid
                                        ? 'white'
                                        : 'ldGray.0'
                                }
                            >
                                <Title
                                    fw={500}
                                    order={6}
                                    color="ldGray.7"
                                    truncate
                                    maw={`calc(${
                                        100 / (sortedTabs?.length || 1)
                                    }vw)`}
                                >
                                    {tab.name}
                                </Title>
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                    <EmbedDashboardGrid
                        filteredTiles={filteredTiles}
                        layouts={layouts}
                        dashboard={dashboard}
                        projectUuid={projectUuid}
                        hasRequiredDashboardFiltersToSet={
                            hasRequiredDashboardFiltersToSet
                        }
                        isTabEmpty={isTabEmpty}
                        gridProps={gridProps}
                    />
                </Tabs>
            ) : (
                <EmbedDashboardGrid
                    filteredTiles={filteredTiles}
                    layouts={layouts}
                    dashboard={dashboard}
                    projectUuid={projectUuid}
                    hasRequiredDashboardFiltersToSet={
                        hasRequiredDashboardFiltersToSet
                    }
                    gridProps={gridProps}
                />
            )}
        </div>
    );
};

export default EmbedDashboard;
