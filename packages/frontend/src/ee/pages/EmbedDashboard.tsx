import {
    assertUnreachable,
    DashboardTileTypes,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    isFilterInteractivityEnabled,
    type ApiChartAndResults,
    type ApiError,
    type Dashboard,
    type DashboardFilterInteractivityOptions,
    type DashboardFilters,
    type InteractivityOptions,
} from '@lightdash/common';
import { ActionIcon, Box, Flex, Tooltip } from '@mantine/core';
import { IconPrinter, IconUnlink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { mapValues } from 'lodash';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ComponentProps,
    type FC,
} from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { useParams } from 'react-router';
import { lightdashApi } from '../../api';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../components/common/MantineIcon';
import { LockedDashboardModal } from '../../components/common/modal/LockedDashboardModal';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import ActiveFilters from '../../components/DashboardFilter/ActiveFilters';
import {
    getReactGridLayoutConfig,
    getResponsiveGridLayoutProps,
} from '../../components/DashboardTabs/gridUtils';
import type DashboardChartTile from '../../components/DashboardTiles/DashboardChartTile';
import { GenericDashboardChartTile } from '../../components/DashboardTiles/DashboardChartTile';
import LoomTile from '../../components/DashboardTiles/DashboardLoomTile';
import MarkdownTile from '../../components/DashboardTiles/DashboardMarkdownTile';
import SemanticViewerChartTile from '../../components/DashboardTiles/DashboardSemanticViewerChartTile';
import SqlChartTile from '../../components/DashboardTiles/DashboardSqlChartTile';
import TileBase from '../../components/DashboardTiles/TileBase';
import useDashboardFiltersForTile from '../../hooks/dashboard/useDashboardFiltersForTile';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type EventData } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import '../../styles/react-grid.css';
import '../features/embed/styles/print.css';
import useEmbed from '../providers/Embed/useEmbed';

const useEmbedDashboard = (
    projectUuid: string | undefined,
    embedToken: string | undefined,
) => {
    return useQuery<Dashboard & InteractivityOptions, ApiError>({
        queryKey: ['embed-dashboard'],
        queryFn: async () =>
            lightdashApi<Dashboard & InteractivityOptions>({
                url: `/embed/${projectUuid}/dashboard`,
                method: 'POST',
                headers: {
                    'Lightdash-Embed-Token': embedToken!,
                },
                body: undefined,
            }),
        enabled: !!embedToken && !!projectUuid,
        retry: false,
    });
};

const useEmbedChartAndResults = (
    projectUuid: string,
    embedToken: string | undefined,
    tileUuid: string,
) => {
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);

    return useQuery<ApiChartAndResults, ApiError>({
        queryKey: [
            'embed-chart-and-results',
            projectUuid,
            tileUuid,
            dashboardFilters,
        ],
        queryFn: async () =>
            lightdashApi<ApiChartAndResults>({
                url: `/embed/${projectUuid}/chart-and-results`,
                method: 'POST',
                headers: {
                    'Lightdash-Embed-Token': embedToken!,
                },
                body: JSON.stringify({
                    tileUuid,
                    dashboardFilters,
                }),
            }),
        enabled: !!embedToken,
        retry: false,
    });
};

const ResponsiveGridLayout = WidthProvider(Responsive);

const EmbedDashboardChartTile: FC<
    ComponentProps<typeof DashboardChartTile> & {
        projectUuid: string;
        embedToken: string;
        locked: boolean;
    }
> = ({
    projectUuid,
    embedToken,
    locked,
    canExportCsv,
    canExportImages,
    ...rest
}) => {
    const { isLoading, data, error } = useEmbedChartAndResults(
        projectUuid,
        embedToken,
        rest.tile.uuid,
    );
    if (locked) {
        return (
            <Box h="100%">
                <TileBase isLoading={false} title={''} {...rest} />
            </Box>
        );
    }
    return (
        <GenericDashboardChartTile
            {...rest}
            isLoading={isLoading}
            canExportCsv={canExportCsv}
            canExportImages={canExportImages}
            data={data}
            error={error}
        />
    );
};

const DashboardFilter: FC<{
    dashboardFilters: DashboardFilters;
    dashboardTiles: Dashboard['tiles'];
    filterInteractivityOptions: DashboardFilterInteractivityOptions;
}> = ({ dashboardFilters, dashboardTiles, filterInteractivityOptions }) => {
    const [openPopoverId, setPopoverId] = useState<string>();

    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );

    const allowedFilters = useMemo(() => {
        const filterInteractivityValue = getFilterInteractivityValue(
            filterInteractivityOptions.enabled,
        );

        if (filterInteractivityValue === FilterInteractivityValues.all) {
            return dashboardFilters;
        }

        return mapValues(dashboardFilters, (filters) => {
            return filters.filter((filter) =>
                filterInteractivityOptions.allowedFilters?.includes(filter.id),
            );
        });
    }, [dashboardFilters, filterInteractivityOptions]);

    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);

    useEffect(() => {
        setDashboardFilters(allowedFilters);
        setDashboardTiles(dashboardTiles);
    }, [
        allowedFilters,
        setDashboardFilters,
        setDashboardTiles,
        dashboardTiles,
    ]);

    const handlePopoverOpen = useCallback((id: string) => {
        setPopoverId(id);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setPopoverId(undefined);
    }, []);
    const { projectUuid } = useParams<{ projectUuid: string }>();

    // FIXME fieldsWithSuggestions is required
    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={{}}
            startOfWeek={undefined}
        >
            <Flex gap="xs" wrap="wrap" m="sm">
                <ActiveFilters
                    isEditMode={false}
                    onPopoverOpen={handlePopoverOpen}
                    onPopoverClose={handlePopoverClose}
                    openPopoverId={openPopoverId}
                    activeTabUuid={undefined}
                />
            </Flex>
        </FiltersProvider>
    );
};

const EmbedDashboard: FC<{ embedToken: string }> = ({ embedToken }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { track } = useTracking();
    const { data: dashboard, error: dashboardError } = useEmbedDashboard(
        projectUuid,
        embedToken,
    );
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
        lg: dashboard.tiles.map<Layout>((tile) =>
            getReactGridLayoutConfig(tile),
        ),
    };

    return (
        <div style={{ height: '100vh', overflowY: 'auto' }}>
            <Tooltip label="Print this page" withinPortal position="bottom">
                <ActionIcon
                    variant="default"
                    onClick={() => {
                        const event = {
                            name: 'embedding_print.clicked',
                            properties: {
                                projectUuid: projectUuid,
                                dashboardUuid: dashboard.uuid,
                            },
                        };
                        track(event as EventData);
                        const printContainer = document.getElementById(
                            'embed-scroll-container',
                        );

                        if (printContainer) {
                            printContainer.style.height = 'auto';
                            printContainer.style.overflowY = 'visible';
                        }

                        window.print();

                        if (printContainer) {
                            printContainer.style.height = '100vh';
                            printContainer.style.overflowY = 'auto';
                        }
                    }}
                    size="lg"
                    sx={{
                        position: 'absolute',
                        top: isFilterInteractivityEnabled(
                            dashboard.dashboardFiltersInteractivity,
                        )
                            ? 12
                            : 20,
                        right: isFilterInteractivityEnabled(
                            dashboard.dashboardFiltersInteractivity,
                        )
                            ? 12
                            : 40,
                        zIndex: 1000,
                    }}
                >
                    <MantineIcon size="xl" icon={IconPrinter} />
                </ActionIcon>
            </Tooltip>
            {dashboard.dashboardFiltersInteractivity &&
                isFilterInteractivityEnabled(
                    dashboard.dashboardFiltersInteractivity,
                ) && (
                    <DashboardFilter
                        dashboardFilters={dashboard.filters}
                        dashboardTiles={dashboard.tiles}
                        filterInteractivityOptions={
                            dashboard.dashboardFiltersInteractivity
                        }
                    />
                )}

            <LockedDashboardModal
                opened={hasRequiredDashboardFiltersToSet && !!hasChartTiles}
            />
            <ResponsiveGridLayout
                {...getResponsiveGridLayoutProps({ enableAnimation: false })}
                layouts={layouts}
                className={`react-grid-layout-dashboard ${
                    hasRequiredDashboardFiltersToSet ? 'locked' : ''
                }`}
            >
                {dashboard.tiles.map((tile) => (
                    <div key={tile.uuid}>
                        {tile.type === DashboardTileTypes.SAVED_CHART ? (
                            <EmbedDashboardChartTile
                                projectUuid={projectUuid}
                                embedToken={embedToken}
                                key={tile.uuid}
                                minimal
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
                                canExportCsv={dashboard.canExportCsv}
                                canExportImages={dashboard.canExportImages}
                                locked={hasRequiredDashboardFiltersToSet}
                            />
                        ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                            <MarkdownTile
                                key={tile.uuid}
                                tile={tile}
                                isEditMode={false}
                                onDelete={() => {}}
                                onEdit={() => {}}
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
                        ) : tile.type ===
                          DashboardTileTypes.SEMANTIC_VIEWER_CHART ? (
                            <SemanticViewerChartTile
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
        </div>
    );
};

const EmbedDashboardPage: FC = () => {
    const { embedToken } = useEmbed();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </div>
        );
    }

    return (
        <DashboardProvider embedToken={embedToken} projectUuid={projectUuid}>
            <EmbedDashboard embedToken={embedToken} />
        </DashboardProvider>
    );
};
export default EmbedDashboardPage;
