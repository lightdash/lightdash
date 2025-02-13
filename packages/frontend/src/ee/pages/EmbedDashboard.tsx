import {
    assertUnreachable,
    DashboardTileTypes,
    FilterInteractivityValues,
    getFilterInteractivityValue,
    getItemId,
    isFilterInteractivityEnabled,
    type ApiChartAndResults,
    type ApiError,
    type Dashboard,
    type DashboardFilterInteractivityOptions,
    type DashboardFilterRule,
    type DashboardFilters,
    type FilterOperator,
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
import { v4 as uuidv4 } from 'uuid';
import { lightdashApi } from '../../api';
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
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../components/common/MantineIcon';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { LockedDashboardModal } from '../../components/common/modal/LockedDashboardModal';
import { DateZoom } from '../../features/dateZoom';
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
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    return useQuery<ApiChartAndResults, ApiError>({
        queryKey: [
            'embed-chart-and-results',
            projectUuid,
            tileUuid,
            dashboardFilters,
            dateZoomGranularity,
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
                    dateZoomGranularity,
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
    canExportPagePdf,
    canDateZoom,
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
            canExportPagePdf={canExportPagePdf}
            canDateZoom={canDateZoom}
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
    const projectUuid = useDashboardContext((c) => c.projectUuid);

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

    // FIXME fieldsWithSuggestions is required
    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={{}}
            startOfWeek={undefined}
        >
            <Flex gap="xs" wrap="wrap" w="100%" justify="flex-start">
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

const ExportPagePdf: FC<{
    dashboard: Dashboard & InteractivityOptions;
    inHeader: boolean;
    projectUuid: string;
}> = ({ projectUuid, dashboard, inHeader }) => {
    const { track } = useTracking();

    if (!dashboard.canExportPagePdf) {
        return null;
    }
    return (
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
                    ...(inHeader
                        ? {}
                        : {
                              position: 'absolute',
                              top: 20,
                              right: 72, // Make sure the button does not overlap the chart options
                          }),
                    zIndex: 1000,
                }}
            >
                <MantineIcon size="xl" icon={IconPrinter} />
            </ActionIcon>
        </Tooltip>
    );
};

const DashboardHeader: FC<{
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
}> = ({ dashboard, projectUuid }) => {
    const hasHeader =
        dashboard.canDateZoom ||
        isFilterInteractivityEnabled(dashboard.dashboardFiltersInteractivity);

    // If no header, and exportPagePdf is enabled, show the Export button on the top right corner
    if (!hasHeader && dashboard.canExportPagePdf) {
        return (
            <ExportPagePdf
                dashboard={dashboard}
                projectUuid={projectUuid}
                inHeader={false}
            />
        );
    }
    return (
        <Flex
            justify="flex-end"
            align="center"
            pos="relative"
            m="sm"
            mb="0"
            gap="sm"
            style={{ flexGrow: 1 }}
        >
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
            {dashboard.canDateZoom && <DateZoom isEditMode={false} />}

            {dashboard.canExportPagePdf && (
                <ExportPagePdf
                    dashboard={dashboard}
                    projectUuid={projectUuid}
                    inHeader={true}
                />
            )}
        </Flex>
    );
};

type EmbedDashboardProps = {
    filters?: SdkFilter[];
};

const EmbedDashboard: FC<EmbedDashboardProps> = ({ filters }) => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );

    const sdkDashboardFilters = useMemo(() => {
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

                const dashboardFilter: DashboardFilterRule = {
                    id: uuidv4(),
                    label: filter.field,
                    target: {
                        fieldId,
                        tableName: filter.model,
                    },
                    operator: filter.operator,
                    values: Array.isArray(filter.value)
                        ? filter.value
                        : [filter.value],
                    tileTargets: {},
                };
                return dashboardFilter;
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

    const { embedToken } = useEmbed();

    if (!embedToken) {
        throw new Error('Embed token is required');
    }

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
            <DashboardHeader dashboard={dashboard} projectUuid={projectUuid} />

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

export type SdkFilter = {
    model: string;
    field: string;
    operator: FilterOperator;
    value: unknown | unknown[];
};

type Props = {
    projectUuid?: string;
    filters?: SdkFilter[];
};

const EmbedDashboardPage: FC<Props> = ({
    projectUuid: projectUuidFromProps,
    filters,
}) => {
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const { embedToken } = useEmbed();

    const projectUuid = projectUuidFromProps ?? projectUuidFromParams;

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
            <EmbedDashboard filters={filters} />
        </DashboardProvider>
    );
};
export default EmbedDashboardPage;
