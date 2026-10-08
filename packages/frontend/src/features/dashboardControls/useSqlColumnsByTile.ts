import {
    DashboardTileTypes,
    getFilterTypeFromItemType,
    isDimension,
    type DashboardFilterRule,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { getFieldKind } from './fieldKinds';
import { getSqlColumnsOfKind, type SqlColumnsByTile } from './peers';
import {
    useFilterRuleField,
    useFilterRuleSqlColumnType,
} from './useFilterRuleField';

const NO_SQL_COLUMNS: SqlColumnsByTile = {};

export const useSqlColumnsByTile = (
    rule: DashboardFilterRule | null,
): SqlColumnsByTile => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const field = useFilterRuleField(rule);
    const sqlColumnType = useFilterRuleSqlColumnType(rule);
    // A dimension filter takes columns of its kind, a SQL column filter those
    // of its column's type; a metric filter never reaches a SQL chart tile
    const kind =
        sqlColumnType !== null
            ? getFilterTypeFromItemType(sqlColumnType)
            : field !== null && isDimension(field)
              ? getFieldKind(field)
              : null;

    return useMemo(() => {
        if (kind === null) return NO_SQL_COLUMNS;
        return Object.fromEntries(
            (dashboardTiles ?? [])
                .filter((tile) => tile.type === DashboardTileTypes.SQL_CHART)
                .map((tile) => {
                    const columns =
                        sqlChartTilesMetadata[tile.uuid]?.columns ?? [];
                    return [
                        tile.uuid,
                        getSqlColumnsOfKind(
                            columns.flatMap((column) =>
                                typeof column.reference === 'string'
                                    ? [
                                          {
                                              reference: column.reference,
                                              type: column.type,
                                          },
                                      ]
                                    : [],
                            ),
                            kind,
                        ),
                    ];
                }),
        );
    }, [kind, dashboardTiles, sqlChartTilesMetadata]);
};
