import {
    DashboardTileTypes,
    getTakenOutParameterKeys,
    omitTakenOutParameterValues,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import useDashboardFiltersForTile from '../../hooks/dashboard/useDashboardFiltersForTile';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useSearchParams from '../../hooks/useSearchParams';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { useSavedSqlChartResults } from '../sqlRunner/hooks/useSavedSqlChartResults';

// Runs the tile's own query, with the arguments the tile runs it with, and
// reports its columns
const TileLoader: FC<{
    tile: DashboardSqlChartTile;
    savedSqlUuid: string;
    projectUuid: string;
    dashboardUuid: string;
}> = ({ tile, savedSqlUuid, projectUuid, dashboardUuid }) => {
    const context = useSearchParams('context') || undefined;
    const dashboardFilters = useDashboardFiltersForTile(tile.uuid);
    const dashboardParameterValues = useDashboardContext(
        (c) => c.parameterValues,
    );
    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const updateSqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.updateSqlChartTilesMetadata,
    );
    const parameters = useMemo(
        () =>
            omitTakenOutParameterValues(
                dashboardParameterValues,
                getTakenOutParameterKeys(parameterControls, tile.uuid),
            ),
        [dashboardParameterValues, parameterControls, tile.uuid],
    );
    const {
        chartResultsQuery: { data },
    } = useSavedSqlChartResults({
        projectUuid,
        savedSqlUuid,
        context,
        dashboardUuid,
        tileUuid: tile.uuid,
        dashboardFilters,
        dashboardSorts: [],
        parameters,
    });
    const originalColumns = data?.originalColumns;

    useEffect(() => {
        if (originalColumns) {
            updateSqlChartTilesMetadata(tile.uuid, {
                columns: Object.values(originalColumns),
            });
        }
    }, [originalColumns, tile.uuid, updateSqlChartTilesMetadata]);

    return null;
};

// A SQL chart tile only reports its columns once its chart has run, and a
// tile hosting a mapping, or on a tab not visited yet, never mounts its chart.
// This runs the query for the SQL tiles whose columns are still unknown.
const SqlColumnsLoader: FC = () => {
    const projectUuid = useProjectUuid();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    if (!projectUuid || !dashboardUuid) return null;

    return (
        <>
            {(dashboardTiles ?? []).map((tile) =>
                tile.type === DashboardTileTypes.SQL_CHART &&
                tile.properties.savedSqlUuid &&
                sqlChartTilesMetadata[tile.uuid] === undefined ? (
                    <TileLoader
                        key={tile.uuid}
                        tile={tile}
                        savedSqlUuid={tile.properties.savedSqlUuid}
                        projectUuid={projectUuid}
                        dashboardUuid={dashboardUuid}
                    />
                ) : null,
            )}
        </>
    );
};

export default SqlColumnsLoader;
