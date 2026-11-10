import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { createDashboardTestStore } from '../../../testing/dashboardStore';
import { dashboardEditActions } from './dashboardEditReducer';
import { selectTileQuerySourcesKey } from './dashboardEditSelectors';
import { dashboardParametersActions } from './dashboardParametersReducer';

const chartTile = (uuid: string, savedChartUuid: string) =>
    ({
        uuid,
        type: DashboardTileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        h: 3,
        w: 3,
        properties: { savedChartUuid },
    }) as DashboardTile;

describe('selectTileQuerySourcesKey', () => {
    it('rebuilds the key only when the tiles change', () => {
        const store = createDashboardTestStore();
        store.dispatch(
            dashboardEditActions.setTiles([
                chartTile('tile-b', 'chart-2'),
                chartTile('tile-a', 'chart-1'),
            ]),
        );
        const key = selectTileQuerySourcesKey(store.getState());
        expect(key).toBe('tile-a:chart-1:,tile-b:chart-2:');

        const recomputations = selectTileQuerySourcesKey.recomputations();
        store.dispatch(
            dashboardParametersActions.setParameter({
                key: 'region',
                value: 'EU',
            }),
        );
        expect(selectTileQuerySourcesKey(store.getState())).toBe(key);
        expect(selectTileQuerySourcesKey.recomputations()).toBe(recomputations);
    });
});
