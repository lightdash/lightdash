import { describe, expect, it } from 'vitest';
import {
    dashboardDateZoomActions,
    dashboardTileStatusActions,
} from '../../features/dashboard/store';
import { createDashboardTestStore } from '../../testing/dashboardStore';

describe('CustomVisualization dashboard state', () => {
    it('can report tile readiness after Vega loads without mutating stored Sets', async () => {
        const store = createDashboardTestStore();
        store.dispatch(
            dashboardDateZoomActions.setTilesWithDateZoomApplied(
                new Set(['native-chart']),
            ),
        );
        store.dispatch(
            dashboardTileStatusActions.markTileLoaded('native-chart'),
        );

        // Match the lazy import used by CustomVisualization. Vega-Lite adds a
        // Set serializer here, after Redux has started tracking dashboard state.
        await import('react-vega');

        expect(() =>
            store.dispatch(
                dashboardTileStatusActions.markTileScreenshotReady(
                    'custom-chart',
                ),
            ),
        ).not.toThrow();
        expect(store.getState().tileStatus.screenshotReadyTiles).toEqual(
            new Set(['custom-chart']),
        );
        expect(store.getState().dateZoom.tilesWithDateZoomApplied).toEqual(
            new Set(['native-chart']),
        );
        expect(
            Object.getOwnPropertyDescriptor(Set.prototype, 'toJSON'),
        ).toMatchObject({ enumerable: false });
        expect(JSON.parse(JSON.stringify(new Set(['native-chart'])))).toBe(
            'Set("native-chart")',
        );

        // Keep the mutation guard enabled for real dashboard state changes.
        store.getState().dateZoom.controlGranularities.unexpected = 'Month';
        expect(() =>
            store.dispatch(dashboardTileStatusActions.markTileLoaded('next')),
        ).toThrow(/state mutation.*dateZoom.controlGranularities.unexpected/i);
    });
});
