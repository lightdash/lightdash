import { subject } from '@casl/ability';
import {
    ChartKind,
    isVizCartesianChartConfig,
    isVizPieChartConfig,
    isVizTableConfig,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle, IconFilePencil } from '@tabler/icons-react';
import { memo, useEffect, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import { useSavedSqlChartResults } from '../../features/sqlRunner/hooks/useSavedSqlChartResults';
import useDashboardFiltersForTile from '../../hooks/dashboard/useDashboardFiltersForTile';
import useSearchParams from '../../hooks/useSearchParams';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { formatChartErrorMessage } from '../../utils/chartErrorUtils';
import ChartView from '../DataViz/visualizations/ChartView';
import { Table } from '../DataViz/visualizations/Table';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import TileBase from './TileBase';

interface Props
    extends Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > {
    tile: DashboardSqlChartTile;
    minimal?: boolean;
}

/**
 * TODO
 * Handle minimal mode
 * handle tabs
 */
const DashboardOptions = memo(
    ({
        isEditMode,
        projectUuid,
        slug,
    }: {
        isEditMode: boolean;
        projectUuid: string;
        slug: string;
    }) => (
        <LinkMenuItem
            icon={<MantineIcon icon={IconFilePencil} />}
            href={`/projects/${projectUuid}/sql-runner/${slug}/edit`}
            disabled={isEditMode}
            target="_blank"
        >
            Edit SQL chart
        </LinkMenuItem>
    ),
);

const SqlChartTile: FC<Props> = ({ tile, isEditMode, ...rest }) => {
    const { user } = useApp();
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const context = useSearchParams('context') || undefined;
    const savedSqlUuid = tile.properties.savedSqlUuid || undefined;
    const canManageSqlRunner = user.data?.ability?.can(
        'manage',
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const updateSqlChartTilesMetadata = useDashboardContext(
        (c) => c.updateSqlChartTilesMetadata,
    );
    const dashboardFilters = useDashboardFiltersForTile(tile.uuid);

    const {
        chartQuery: {
            data: chartData,
            isLoading: isChartLoading,
            error: chartError,
        },
        chartResultsQuery: {
            data: chartResultsData,
            isLoading: isChartResultsLoading,
            error: chartResultsError,
            isFetching: isChartResultsFetching,
        },
    } = useSavedSqlChartResults({
        projectUuid,
        savedSqlUuid,
        context,
        dashboardUuid,
        tileUuid: tile.uuid,
        dashboardFilters,
        dashboardSorts: [],
    });

    // Charts in Dashboard shouldn't have animation
    const specWithoutAnimation = useMemo(() => {
        if (!chartResultsData?.chartSpec) return chartResultsData?.chartSpec;
        return {
            ...chartResultsData.chartSpec,
            animation: false,
        };
    }, [chartResultsData?.chartSpec]);

    // Update SQL chart columns in the dashboard context
    useEffect(() => {
        if (chartResultsData?.originalColumns) {
            updateSqlChartTilesMetadata(tile.uuid, {
                columns: Object.values(chartResultsData.originalColumns),
            });
        }
    }, [
        chartResultsData?.originalColumns,
        tile.uuid,
        updateSqlChartTilesMetadata,
    ]);

    // No chart available or savedSqlUuid is undefined - which means that the chart was deleted
    if (chartData === undefined || !savedSqlUuid) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                tile={tile}
                isLoading={!!savedSqlUuid && isChartLoading}
                title={tile.properties.title || tile.properties.chartName || ''}
                {...rest}
            >
                {!isChartLoading && (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={formatChartErrorMessage(
                            tile.properties.chartName,
                            chartError?.error?.message ||
                                'Error fetching chart',
                        )}
                    />
                )}
            </TileBase>
        );
    }

    // Chart data but no results
    if (chartResultsData === undefined) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                tile={tile}
                title={tile.properties.title || tile.properties.chartName || ''}
                isLoading={isChartResultsLoading}
                {...rest}
                titleHref={`/projects/${projectUuid}/sql-runner/${chartData.slug}`}
                extraMenuItems={
                    projectUuid &&
                    canManageSqlRunner &&
                    chartData.slug && (
                        <DashboardOptions
                            isEditMode={isEditMode}
                            projectUuid={projectUuid}
                            slug={chartData.slug}
                        />
                    )
                }
            >
                {chartResultsError && (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={formatChartErrorMessage(
                            tile.properties.chartName,
                            chartResultsError?.error?.message ||
                                'No data available',
                        )}
                    />
                )}
            </TileBase>
        );
    }

    // Chart available & results available!
    return (
        <TileBase
            isEditMode={isEditMode}
            chartName={tile.properties.chartName ?? ''}
            titleHref={`/projects/${projectUuid}/sql-runner/${chartData.slug}`}
            tile={tile}
            title={tile.properties.title || tile.properties.chartName || ''}
            {...rest}
            extraMenuItems={
                projectUuid &&
                canManageSqlRunner && (
                    <DashboardOptions
                        isEditMode={isEditMode}
                        projectUuid={projectUuid}
                        slug={chartData.slug}
                    />
                )
            }
        >
            {chartData.config.type === ChartKind.TABLE &&
                isVizTableConfig(chartData.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={chartResultsData.resultsRunner}
                            columnsConfig={chartData.config.columns}
                            flexProps={{
                                mah: '100%',
                            }}
                        />
                    </Box>
                )}
            {(isVizCartesianChartConfig(chartData.config) ||
                isVizPieChartConfig(chartData.config)) && (
                <ChartView
                    config={chartData.config}
                    spec={specWithoutAnimation}
                    isLoading={isChartResultsFetching}
                    error={undefined}
                    style={{
                        minHeight: 'inherit',
                        height: '100%',
                        width: '100%',
                    }}
                />
            )}
        </TileBase>
    );
};

export default SqlChartTile;
