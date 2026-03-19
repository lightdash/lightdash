import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type DashboardTile,
} from '@lightdash/common';
import { useEffect } from 'react';
import { dashboardTileLoadingActions } from '../store/dashboardTileLoadingSlice';
import { useDashboardDispatch } from '../store/hooks';

/**
 * Initializes the progressive tile loading state when dashboard tiles
 * are available. Chart/SQL tiles start as 'pending' (query gated);
 * static tiles (markdown, loom, heading) start as 'visible'.
 *
 * Resets state when tiles change (e.g. tab switch, dashboard reload).
 */
export function useDashboardTileLoadingInit(
    dashboardTiles: DashboardTile[] | undefined,
) {
    const dispatch = useDashboardDispatch();

    useEffect(() => {
        if (!dashboardTiles || dashboardTiles.length === 0) {
            dispatch(dashboardTileLoadingActions.reset());
            return;
        }

        const chartTileUuids: string[] = [];
        const staticTileUuids: string[] = [];

        for (const tile of dashboardTiles) {
            if (
                isDashboardChartTileType(tile) ||
                isDashboardSqlChartTile(tile)
            ) {
                chartTileUuids.push(tile.uuid);
            } else {
                staticTileUuids.push(tile.uuid);
            }
        }

        dispatch(
            dashboardTileLoadingActions.initializeTiles({
                chartTileUuids,
                staticTileUuids,
            }),
        );
    }, [dashboardTiles, dispatch]);
}
