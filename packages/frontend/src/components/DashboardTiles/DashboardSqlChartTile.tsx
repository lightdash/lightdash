import {
    type Dashboard,
    type DashboardSqlChartTile as DashboardSqlChartTileType,
} from '@lightdash/common';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router-dom';
// import { Table } from '../../features/sqlRunner/components/visualizations/Table';
// import BarChart from '../../features/sqlRunner/components/visualizations/BarChart';
// import { Table } from '../../features/sqlRunner/components/visualizations/Table';
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
 * Use new hook that calls endpoint to get chart results + config - hook can be called: useSqlChartResults(tile.properties.savedSqlUuid)
 * Handle minimal mode
 * Handle error
 * Handle delete
 * Handle edit
 * Add support for description and title
 */

export const DashboardSqlChartTile: FC<Props> = ({ tile, isEditMode }) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const data = {
        results: undefined,
        config: undefined,
    };
    const isLoading = false;
    const error = undefined;
    // TODO: use new hook that calls endpoint to get chart results + config - hook can be called: useSqlChartResults(tile.properties.savedSqlUuid)
    // const { data, isLoading, error } = useSqlChartResults(
    //     tile.properties.savedSqlUuid,
    // );

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
            {data ? (
                <TileBase
                    isEditMode={isEditMode}
                    chartName={tile.properties.chartName ?? ''}
                    titleHref={`/projects/${projectUuid}/sql-runner-new/saved/${tile.properties.savedSqlUuid}/`}
                    tile={tile}
                    title={tile.properties.chartName || ''}
                    // TODO: see if we can remove these
                    onDelete={() => {}}
                    onEdit={() => {}}
                >
                    {/* {data.config.type === ChartKind.TABLE && (
                        <Table data={data.results} config={data.config} />
                    )}
                    {data.config.type === ChartKind.VERTICAL_BAR && (
                        <BarChart data={data.results} config={data.config} />
                    )} */}
                </TileBase>
            ) : (
                <div>No data</div>
            )}
        </>
    );
};
