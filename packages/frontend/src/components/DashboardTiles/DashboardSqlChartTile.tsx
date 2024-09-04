import { subject } from '@casl/ability';
import {
    ChartKind,
    isVizTableConfig,
    type DashboardSqlChartTile as DashboardSqlChartTileType,
} from '@lightdash/common';
import { Box, Menu } from '@mantine/core';
import { IconAlertCircle, IconFilePencil } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useDashboardSqlChart } from '../../features/sqlRunner/hooks/useDashboardSqlChart';
import { SqlRunnerResultsRunner } from '../../features/sqlRunner/runners/SqlRunnerResultsRunner';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import ChartView from '../DataViz/visualizations/ChartView';
import { Table } from '../DataViz/visualizations/Table';
import TileBase from './TileBase';

interface Props
    extends Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > {
    tile: DashboardSqlChartTileType;
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
    }) => {
        const history = useHistory();
        return (
            <Box>
                <Menu.Item
                    icon={<MantineIcon icon={IconFilePencil} />}
                    disabled={isEditMode}
                    onClick={() =>
                        history.push(
                            `/projects/${projectUuid}/sql-runner/${slug}/edit`,
                        )
                    }
                >
                    Edit SQL chart
                </Menu.Item>
            </Box>
        );
    },
);

export const DashboardSqlChartTile: FC<Props> = ({
    tile,
    isEditMode,
    ...rest
}) => {
    const { user } = useApp();

    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const savedSqlUuid = tile.properties.savedSqlUuid;
    const { data, isLoading, error } = useDashboardSqlChart({
        projectUuid,
        savedSqlUuid,
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

    const resultsRunner = useMemo(
        () =>
            new SqlRunnerResultsRunner({
                rows: sqlRunnerChartData.results,
                columns: sqlRunnerChartData.columns,
            }),
        [sqlRunnerChartData],
    );

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
                    <Box w="100%">
                        <Table
                            resultsRunner={resultsRunner}
                            config={data.chart.config}
                        />
                    </Box>
                )}
            {savedSqlUuid &&
                (data.chart.config.type === ChartKind.VERTICAL_BAR ||
                    data.chart.config.type === ChartKind.LINE ||
                    data.chart.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={data.chart.config}
                        style={{
                            minHeight: 'inherit',
                            height: '100%',
                            width: '100%',
                        }}
                        resultsRunner={resultsRunner}
                        isLoading={false}
                        sql={data.chart.sql}
                        projectUuid={projectUuid}
                        uuid={savedSqlUuid}
                    />
                )}
        </TileBase>
    );
};
