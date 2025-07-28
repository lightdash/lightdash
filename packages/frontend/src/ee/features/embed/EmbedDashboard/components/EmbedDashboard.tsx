import {
    assertUnreachable,
    DashboardTileTypes,
    getItemId,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
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
import { convertSdkFilterToDashboardFilter } from '../utils';
import { EmbedMarkdownTile } from './EmbedMarkdownTile';

const ResponsiveGridLayout = WidthProvider(Responsive);

const EmbedDashboardGrid: FC<{
    filteredTiles: DashboardTile[];
    layouts: { lg: Layout[] };
    dashboard: any;
    projectUuid: string;
    hasRequiredDashboardFiltersToSet: boolean;
    isTabEmpty?: boolean;
}> = ({
    filteredTiles,
    layouts,
    dashboard,
    projectUuid,
    hasRequiredDashboardFiltersToSet,
    isTabEmpty,
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
                {...getResponsiveGridLayoutProps({ enableAnimation: false })}
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
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const { embedToken, filters } = useEmbed();

    const sdkDashboardFilters = useMemo(() => {
        if (
            !filters ||
            filters.length === 0 ||
            Object.keys(allFilterableFieldsMap).length === 0
        ) {
            return undefined;
        }

        const dimensionFilters = filters
            ?.map((filter) => {
                const fieldId = getItemId({
                    table: filter.model,
                    name: filter.field,
                });

                const field = allFilterableFieldsMap[fieldId];

                if (!field) {
                    console.warn(`Field ${filter.field} not found`, filter);
                    console.warn(
                        `Here are all the fields:`,
                        allFilterableFieldsMap,
                    );
                    return null;
                }

                return convertSdkFilterToDashboardFilter(filter);
            })
            .filter((filter) => filter !== null);

        if (!dimensionFilters) {
            return undefined;
        }

        return {
            dimensions: dimensionFilters,
            metrics: [],
            tableCalculations: [],
        };
    }, [filters, allFilterableFieldsMap]);

    useEffect(() => {
        if (sdkDashboardFilters) {
            setDashboardFilters(sdkDashboardFilters);
        }
    }, [sdkDashboardFilters, setDashboardFilters]);

    if (!embedToken) {
        throw new Error('Embed token is required');
    }

    const { data: dashboard, error: dashboardError } =
        useEmbedDashboard(projectUuid);

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

    // Tab state
    const [activeTab, setActiveTab] = useState<DashboardTab | undefined>();

    // Sort tabs by order
    const sortedTabs = useMemo(() => {
        if (!dashboard?.tabs || dashboard.tabs.length === 0) {
            return [];
        }
        return dashboard.tabs.sort((a, b) => a.order - b.order);
    }, [dashboard?.tabs]);

    // Set active tab to first tab if no active tab is set
    useEffect(() => {
        if (sortedTabs.length > 0 && !activeTab) {
            setActiveTab(sortedTabs[0]);
        }
    }, [sortedTabs, activeTab]);

    // Filter tiles by active tab
    const filteredTiles = useMemo(() => {
        if (!dashboard?.tiles) {
            return [];
        }

        // If no tabs or only one tab, show all tiles
        if (sortedTabs.length <= 1) {
            return dashboard.tiles;
        }

        // If there are tabs, filter tiles by active tab
        if (activeTab) {
            return dashboard.tiles.filter((tile) => {
                // Show tiles that belong to the active tab
                const tileBelongsToActiveTab = tile.tabUuid === activeTab.uuid;

                // Show tiles that don't belong to any tab (legacy tiles) on the first tab
                const tileHasNoTab = !tile.tabUuid;
                const isFirstTab = activeTab.uuid === sortedTabs[0]?.uuid;

                return tileBelongsToActiveTab || (tileHasNoTab && isFirstTab);
            });
        }

        return [];
    }, [dashboard?.tiles, sortedTabs, activeTab]);

    // Check if tabs should be enabled (more than one tab)
    const tabsEnabled = sortedTabs.length > 1;
    const MAGIC_SCROLL_AREA_HEIGHT = 40;

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

    const layouts = {
        lg: filteredTiles.map<Layout>((tile) => getReactGridLayoutConfig(tile)),
    };

    // Check if current tab is empty
    const isTabEmpty = tabsEnabled && filteredTiles.length === 0;

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
                    onTabChange={(e) => {
                        const tab = sortedTabs.find((t) => t.uuid === e);
                        if (tab) {
                            setActiveTab(tab);
                        }
                    }}
                    mt="md"
                    styles={{
                        tabsList: {
                            flexWrap: 'nowrap',
                            height: MAGIC_SCROLL_AREA_HEIGHT - 1,
                        },
                    }}
                    variant="outline"
                >
                    <Tabs.List bg="gray.0" px="lg">
                        {sortedTabs.map((tab) => (
                            <Tabs.Tab
                                key={tab.uuid}
                                value={tab.uuid}
                                bg={
                                    activeTab?.uuid === tab.uuid
                                        ? 'white'
                                        : 'gray.0'
                                }
                            >
                                <Title
                                    fw={500}
                                    order={6}
                                    color="gray.7"
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
                />
            )}
        </div>
    );
};

export default EmbedDashboard;
