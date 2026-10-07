import {
    DashboardTileTypes,
    getFilterTypeFromItemType,
    type DashboardFilterRule,
} from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { getSqlColumnsOfKind, type SqlColumnsByTile } from './peers';

export const useSqlColumnsByTile = (
    rule: DashboardFilterRule | null,
): SqlColumnsByTile => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const targetFieldId = rule?.target.fieldId ?? null;
    const targetField =
        targetFieldId === null ? undefined : fieldsMap[targetFieldId];
    const kind = targetField
        ? getFilterTypeFromItemType(targetField.type)
        : null;

    return useMemo(() => {
        if (kind === null) return {};
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
