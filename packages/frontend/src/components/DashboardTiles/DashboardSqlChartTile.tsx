import {
    ChartKind,
    isTableChartSQLConfig,
    type DashboardSqlChartTile as DashboardSqlChartTileType,
} from '@lightdash/common';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import SqlRunnerChart from '../../features/sqlRunner/components/visualizations/SqlRunnerChart';
import { Table } from '../../features/sqlRunner/components/visualizations/Table';
import { useSqlChartAndResults } from '../../features/sqlRunner/hooks/useSqlChartAndResults';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
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
        >
            {data.chart.config.type === ChartKind.TABLE &&
                isTableChartSQLConfig(data.chart.config) && (
                    <Table
                        data={data.resultsAndColumns.results}
                        config={data.chart.config}
                    />
                )}
            {(data.chart.config.type === ChartKind.VERTICAL_BAR ||
                data.chart.config.type === ChartKind.LINE ||
                data.chart.config.type === ChartKind.PIE) && (
                <SqlRunnerChart
                    data={sqlRunnerChartData}
                    config={data.chart.config}
                    style={{
                        minHeight: 'inherit',
                        height: '100%',
                        width: '100%',
                    }}
                    isLoading={isLoading}
                />
            )}
        </TileBase>
    );
};
