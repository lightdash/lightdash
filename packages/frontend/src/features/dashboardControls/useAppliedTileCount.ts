import { type DashboardFilterRule } from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardTabs,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import { canTileTakeFilter, getTabCounts, getTileField } from './peers';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

/** Tiles the filter is on, over every tab: the rail's and the strip's count. */
export const useAppliedTileCount = (rule: DashboardFilterRule): number => {
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(rule);
    return useMemo(() => {
        const tiles = dashboardTiles ?? [];
        if (dashboardTabs.length === 0) {
            return tiles.filter(
                (tile) =>
                    canTileTakeFilter(
                        tile,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
                    ) &&
                    getTileField(
                        rule,
                        tile,
                        filterableFieldsByTileUuid,
                        sqlColumnsByTile,
                    ) !== null,
            ).length;
        }
        return Object.values(
            getTabCounts(
                rule,
                tiles,
                dashboardTabs,
                filterableFieldsByTileUuid,
                sqlColumnsByTile,
            ),
        ).reduce((sum, count) => sum + count.applied, 0);
    }, [
        rule,
        dashboardTiles,
        dashboardTabs,
        filterableFieldsByTileUuid,
        sqlColumnsByTile,
    ]);
};
