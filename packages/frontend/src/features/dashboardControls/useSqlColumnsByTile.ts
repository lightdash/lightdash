import {
    DashboardTileTypes,
    type DashboardFilterRule,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectDashboardTiles,
    selectSqlChartTilesMetadata,
    useDashboardSelector,
    type DashboardStoreState,
} from '../dashboard/store';
import { type SqlColumnsByTile } from './peers';

const NO_SQL_COLUMNS: SqlColumnsByTile = {};

const toSqlColumnsByTile = (
    dashboardTiles: ReturnType<typeof selectDashboardTiles>,
    sqlChartTilesMetadata: ReturnType<typeof selectSqlChartTilesMetadata>,
): SqlColumnsByTile =>
    Object.fromEntries(
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

// As the hook, read once from the store's state
export const getSqlColumnsByTile = (
    rule: DashboardFilterRule,
    state: DashboardStoreState,
): SqlColumnsByTile =>
    rule.target.fieldId === ''
        ? NO_SQL_COLUMNS
        : toSqlColumnsByTile(
              selectDashboardTiles(state),
              selectSqlChartTilesMetadata(state),
          );

// Every column of every SQL chart tile, whatever the filter's type, as the
// shipped popover offers them. A placeholder reaches no tile yet
export const useSqlColumnsByTile = (
    rule: DashboardFilterRule | null,
): SqlColumnsByTile => {
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const sqlChartTilesMetadata = useDashboardSelector(
        selectSqlChartTilesMetadata,
    );
    const hasTarget = rule !== null && rule.target.fieldId !== '';

    return useMemo(
        () =>
            hasTarget
                ? toSqlColumnsByTile(dashboardTiles, sqlChartTilesMetadata)
                : NO_SQL_COLUMNS,
        [hasTarget, dashboardTiles, sqlChartTilesMetadata],
    );
};
