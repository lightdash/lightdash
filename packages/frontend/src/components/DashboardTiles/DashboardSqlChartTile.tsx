import {
    ChartKind,
    isVizTableConfig,
    type DashboardSqlChartTile as DashboardSqlChartTileType,
    type SqlChart,
} from '@lightdash/common';
import { Box, Menu } from '@mantine/core';
import { IconAlertCircle, IconFilePencil } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useSqlChartAndResults } from '../../features/sqlRunner/hooks/useSqlChartAndResults';
import { SqlRunnerResultsRunner } from '../../features/sqlRunner/runners/SqlRunnerResultsRunner';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { type ResultsAndColumns } from '../DataViz/Results';
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
const DashboardOptions = ({
    isEditMode,
    data,
}: {
    isEditMode: boolean;
    data: {
        resultsAndColumns: ResultsAndColumns;
        chart: SqlChart;
    };
}) => {
    const history = useHistory();
    return (
        <Box>
            <Menu.Item
                icon={<MantineIcon icon={IconFilePencil} />}
                disabled={isEditMode}
                onClick={() =>
                    history.push(
                        `/projects/${data.chart.project.projectUuid}/sql-runner/${data.chart.slug}/edit`,
                    )
                }
            >
                Edit SQL chart
            </Menu.Item>
        </Box>
    );
};
export const DashboardSqlChartTile: FC<Props> = ({
    tile,
    isEditMode,
    ...rest
}) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { data, isLoading, error } = useSqlChartAndResults({
        projectUuid,
        savedSqlUuid: tile.properties.savedSqlUuid,
    });

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
                {...rest}
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
                <DashboardOptions isEditMode={isEditMode} data={data} />
            }
        >
            {data.chart.config.type === ChartKind.TABLE &&
                isVizTableConfig(data.chart.config) && (
                    <Table
                        resultsRunner={resultsRunner}
                        config={data.chart.config}
                    />
                )}
            {(data.chart.config.type === ChartKind.VERTICAL_BAR ||
                data.chart.config.type === ChartKind.LINE ||
                data.chart.config.type === ChartKind.PIE) && (
                <ChartView
                    data={sqlRunnerChartData}
                    config={data.chart.config}
                    style={{
                        minHeight: 'inherit',
                        height: '100%',
                        width: '100%',
                    }}
                    resultsRunner={resultsRunner}
                    isLoading={isLoading}
                    sql={data.chart.sql}
                    projectUuid={projectUuid}
                />
            )}
        </TileBase>
    );
};
