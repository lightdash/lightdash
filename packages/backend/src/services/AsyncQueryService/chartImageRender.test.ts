import { QueryExecutionContext } from '@lightdash/common';
import { getChartImageRenderOverrides } from './chartImageRender';

const dashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

describe('getChartImageRenderOverrides', () => {
    it('replays a dashboard tile request with its sorts and date zoom', () => {
        const overrides = getChartImageRenderOverrides({
            context: QueryExecutionContext.DASHBOARD,
            chartUuid: 'chart-uuid',
            dashboardUuid: 'dashboard-uuid',
            tileUuid: 'tile-uuid',
            dashboardFilters,
            dashboardSorts: [{ fieldId: 'orders_count', descending: true }],
            dateZoom: { granularity: 'week' },
            parameters: { region: 'emea' },
            excludedParameterKeys: ['region'],
        });

        expect(overrides).toEqual({
            dashboardTileRenderRequest: {
                dashboardUuid: 'dashboard-uuid',
                tileUuid: 'tile-uuid',
                dashboardFilters,
                dashboardSorts: [{ fieldId: 'orders_count', descending: true }],
                dateZoom: { granularity: 'week' },
                parameters: { region: 'emea' },
                excludedParameterKeys: ['region'],
            },
        });
    });

    it('sends no chart filter or parameter overrides for a tile, so the chart page stays in view mode', () => {
        const overrides = getChartImageRenderOverrides({
            chartUuid: 'chart-uuid',
            dashboardUuid: 'dashboard-uuid',
            tileUuid: 'tile-uuid',
            dashboardFilters,
            dashboardSorts: [],
        });

        expect(overrides).not.toHaveProperty('parameters');
    });

    it('sends no overrides for a saved chart without parameters', () => {
        expect(
            getChartImageRenderOverrides({
                chartUuid: 'chart-uuid',
                parameters: {},
            }),
        ).toEqual({});
    });

    it('renders a saved chart with the parameters its results used', () => {
        expect(
            getChartImageRenderOverrides({
                chartUuid: 'chart-uuid',
                parameters: { region: 'emea' },
                resultEffectiveParameters: { region: 'apac' },
            }),
        ).toEqual({ parameters: { region: 'apac' } });
    });
});
