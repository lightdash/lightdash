import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
} from '@lightdash/common';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { dashboardTileLoadingActions } from '../store/dashboardTileLoadingSlice';
import { createDashboardStore } from '../store/index';

interface Props {
    children: ReactNode;
}

/**
 * Creates a Redux store for progressive dashboard loading and
 * initializes tile states when the dashboard tiles are available.
 *
 * Must be rendered inside DashboardProvider (needs access to
 * dashboardTiles via context).
 */
const DashboardStoreProvider: FC<Props> = ({ children }) => {
    const [store] = useState(() => createDashboardStore());
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);

    // Initialize tile loading states when dashboard tiles change
    useEffect(() => {
        if (!dashboardTiles || dashboardTiles.length === 0) return;

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

        store.dispatch(
            dashboardTileLoadingActions.initializeTiles({
                chartTileUuids,
                staticTileUuids,
            }),
        );
    }, [dashboardTiles, store]);

    return <Provider store={store}>{children}</Provider>;
};

export default DashboardStoreProvider;
