import {
    ChartType,
    type MetricQuery,
    type SavedChartDAO,
} from '@lightdash/common';
import { SavedChartService } from './SavedChartService';

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const chartWithConfig = (
    chartConfig: SavedChartDAO['chartConfig'],
): SavedChartDAO =>
    ({
        uuid: 'chart-uuid',
        projectUuid: 'project-uuid',
        name: 'Revenue by status',
        description: undefined,
        metricQuery,
        chartConfig,
        parameters: {},
    }) as SavedChartDAO;

describe('SavedChartService.getCreateEventProperties data app viz attribution', () => {
    it('carries the viz uuid and config shape for a data app viz chart', () => {
        const properties = SavedChartService.getCreateEventProperties(
            chartWithConfig({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz-uuid',
                    fieldMapping: {
                        category: 'orders_status',
                        value: 'orders_count',
                    },
                    optionValues: { showLegend: false },
                },
            }),
        );

        expect(properties.chartType).toBe(ChartType.DATA_APP_VIZ);
        expect(properties.dataAppViz).toEqual({
            dataAppVizUuid: 'viz-uuid',
            mappedFieldCount: 2,
            changedOptionCount: 1,
        });
    });

    it('reports zero changed options when the user kept every default', () => {
        const properties = SavedChartService.getCreateEventProperties(
            chartWithConfig({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz-uuid',
                    fieldMapping: { category: 'orders_status' },
                },
            }),
        );

        expect(properties.dataAppViz).toEqual({
            dataAppVizUuid: 'viz-uuid',
            mappedFieldCount: 1,
            changedOptionCount: 0,
        });
    });

    it('omits the block for a viz chart saved before a viz was picked', () => {
        const properties = SavedChartService.getCreateEventProperties(
            chartWithConfig({ type: ChartType.DATA_APP_VIZ }),
        );

        expect(properties.chartType).toBe(ChartType.DATA_APP_VIZ);
        expect(properties.dataAppViz).toBeUndefined();
    });

    it('omits the block for every other chart type', () => {
        const properties = SavedChartService.getCreateEventProperties(
            chartWithConfig({ type: ChartType.TABLE, config: {} }),
        );

        expect(properties.dataAppViz).toBeUndefined();
    });
});
