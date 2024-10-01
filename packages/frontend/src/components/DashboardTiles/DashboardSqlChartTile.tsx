import { subject } from '@casl/ability';
import {
    ChartKind,
    isVizTableConfig,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle, IconFilePencil } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import { useDashboardSqlChart } from '../../features/sqlRunner/hooks/useDashboardSqlChart';
import { SqlRunnerResultsRunnerFrontend } from '../../features/sqlRunner/runners/SqlRunnerResultsRunnerFrontend';
import { useOrganization } from '../../hooks/organization/useOrganization';
import useSearchParams from '../../hooks/useSearchParams';
import { useApp } from '../../providers/AppProvider';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import getChartDataModel from '../DataViz/transformers/getChartDataModel';
import ChartView from '../DataViz/visualizations/ChartView';
import { Table } from '../DataViz/visualizations/Table';
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
    const org = useOrganization();
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const context = useSearchParams('context') || undefined;
    const savedSqlUuid = tile.properties.savedSqlUuid;
    const { data, isLoading, error } = useDashboardSqlChart({
        projectUuid,
        savedSqlUuid,
        context,
    });

    const canManageSqlRunner = user.data?.ability?.can(
        'manage',
        subject('SqlRunner', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const sqlRunnerChartData = useMemo(
        () => ({
            results: data?.resultsAndColumns.results ?? [],
            columns: data?.resultsAndColumns.columns ?? [],
        }),
        [data],
    );

    const resultsRunner = useMemo(() => {
        return new SqlRunnerResultsRunnerFrontend({
            rows: sqlRunnerChartData.results,
            columns: sqlRunnerChartData.columns,
            projectUuid,
            sql: data?.chart.sql ?? '',
        });
    }, [projectUuid, sqlRunnerChartData, data]);

    const vizDataModel = useMemo(() => {
        return getChartDataModel(resultsRunner, data?.chart.config, org.data);
    }, [data?.chart.config, org.data, resultsRunner]);

    const {
        loading: chartLoading,
        error: chartDataError,
        value: chartData,
    } = useAsync(async () => {
        return vizDataModel.getPivotedChartData({
            limit: data?.chart.limit,
            sql: data?.chart.sql ?? '',
            sortBy: [],
            filters: [],
        });
    }, [vizDataModel, data?.chart.limit, data?.chart.sql]);

    const chartSpec = useMemo(() => {
        if (!chartData) return undefined;
        return vizDataModel.getSpec();
    }, [vizDataModel, chartData]);

    if (isLoading) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                tile={tile}
                isLoading
                title={tile.properties.title || tile.properties.chartName || ''}
                {...rest}
            />
        );
    }

    if (error !== null || !data) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                tile={tile}
                title={tile.properties.title || tile.properties.chartName || ''}
                titleHref={`/projects/${projectUuid}/sql-runner/${error.slug}`}
                {...rest}
                extraMenuItems={
                    canManageSqlRunner &&
                    error.slug && (
                        <DashboardOptions
                            isEditMode={isEditMode}
                            projectUuid={projectUuid}
                            slug={error.slug}
                        />
                    )
                }
            >
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={error?.error?.message || 'No data available'}
                />
            </TileBase>
        );
    }

    return (
        <TileBase
            isEditMode={isEditMode}
            chartName={tile.properties.chartName ?? ''}
            titleHref={`/projects/${projectUuid}/sql-runner/${data.chart.slug}`}
            tile={tile}
            title={tile.properties.title || tile.properties.chartName || ''}
            {...rest}
            extraMenuItems={
                canManageSqlRunner && (
                    <DashboardOptions
                        isEditMode={isEditMode}
                        projectUuid={projectUuid}
                        slug={data.chart.slug}
                    />
                )
            }
        >
            {data.chart.config.type === ChartKind.TABLE &&
                isVizTableConfig(data.chart.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={data.chart.config.columns}
                            flexProps={{
                                mah: '100%',
                            }}
                        />
                    </Box>
                )}
            {savedSqlUuid &&
                (data.chart.config.type === ChartKind.VERTICAL_BAR ||
                    data.chart.config.type === ChartKind.LINE ||
                    data.chart.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={data.chart.config}
                        spec={chartSpec}
                        isLoading={chartLoading}
                        error={chartDataError}
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
