import {
    DashboardTileTypes,
    type DashboardFilterRule,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { type SqlColumnsByTile } from './peers';

const NO_SQL_COLUMNS: SqlColumnsByTile = {};

// Every column of every SQL chart tile, whatever the filter's type, as the
// shipped popover offers them. A placeholder reaches no tile yet
export const useSqlColumnsByTile = (
    rule: DashboardFilterRule | null,
): SqlColumnsByTile => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const hasTarget = rule !== null && rule.target.fieldId !== '';

    return useMemo(() => {
        if (!hasTarget) return NO_SQL_COLUMNS;
        return Object.fromEntries(
            (dashboardTiles ?? [])
                .filter((tile) => tile.type === DashboardTileTypes.SQL_CHART)
                .map((tile) => [
                    tile.uuid,
                    (sqlChartTilesMetadata[tile.uuid]?.columns ?? []).flatMap(
                        (column) =>
                            typeof column.reference === 'string'
                                ? [
                                      {
                                          reference: column.reference,
                                          type: column.type,
                                      },
                                  ]
                                : [],
                    ),
                ]),
        );
    }, [hasTarget, dashboardTiles, sqlChartTilesMetadata]);
};
