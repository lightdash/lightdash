import {
    ChartKind,
    type Dashboard,
    type DashboardSqlChartTile as DashboardSqlChartTileType,
} from '@lightdash/common';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
import BarChart from '../../features/sqlRunner/components/visualizations/BarChart';
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
    onAddTiles?: (tiles: Dashboard['tiles'][number][]) => void;
}

/**
 * TODO
 * Handle minimal mode
 * Handle edit
 * Add support for description and title
 */

export const DashboardSqlChartTile: FC<Props> = ({ tile, isEditMode }) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { data, isLoading, error } = useSqlChartAndResults({
        projectUuid,
        savedSqlUuid: tile.properties.savedSqlUuid,
    });

    if (isLoading) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                titleHref={`/projects/${projectUuid}/sql-runner-new/saved/${tile.properties.savedSqlUuid}/`}
                // TODO: complete this
                belongsToDashboard={false}
                tile={tile}
                isLoading
                title={tile.properties.chartName || ''}
                // TODO: see if we can remove these
                onDelete={() => {}}
                onEdit={() => {}}
            />
        );
    }

    if (error !== null || !data)
        return (
            <TileBase
                title=""
                isEditMode={isEditMode}
                tile={tile}
                onDelete={() => {}}
                onEdit={() => {}}
            >
                <SuboptimalState
                    icon={IconAlertCircle}
                    // TODO: handle error
                    title="No data available"
                />
            </TileBase>
        );

    return (
        <>
            {data.chart && data.results ? (
                <TileBase
                    isEditMode={isEditMode}
                    chartName={tile.properties.chartName ?? ''}
                    // TODO: Fix this link - should we use uuid or slug?
                    titleHref={`/projects/${projectUuid}/sql-runner-new/saved/${tile.properties.savedSqlUuid}`}
                    tile={tile}
                    title={
                        tile.properties.title || tile.properties.chartName || ''
                    }
                    // TODO: see if we can remove these
                    onDelete={() => {}}
                    onEdit={() => {}}
                >
                    {data.chart.config.type === ChartKind.TABLE && (
                        <Table data={data.results} config={data.chart.config} />
                    )}
                    {data.chart.config.type === ChartKind.VERTICAL_BAR && (
                        <BarChart
                            data={data.results}
                            config={data.chart.config}
                            style={{
                                minHeight: 'inherit',
                                height: '100%',
                                width: '100%',
                            }}
                        />
                    )}
                </TileBase>
            ) : (
                <div>No data</div>
            )}
        </>
    );
};
