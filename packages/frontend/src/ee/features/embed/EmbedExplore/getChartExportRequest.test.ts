import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getChartExportRequest } from './getChartExportRequest';

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_date'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

describe('getChartExportRequest', () => {
    it('takes the table settings from a table chart', () => {
        const chart: CreateSavedChartVersion = {
            tableName: 'orders',
            metricQuery,
            tableConfig: { columnOrder: ['orders_total', 'orders_status'] },
            pivotConfig: { columns: ['orders_date'] },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showColumnCalculation: true,
                    columns: {
                        orders_status: { name: 'Status' },
                        orders_date: { visible: false },
                    },
                    conditionalFormattings: [],
                },
            },
        };

        expect(getChartExportRequest(chart, 'query-uuid')).toEqual({
            queryUuid: 'query-uuid',
            columnOrder: ['orders_total', 'orders_status'],
            hiddenFields: ['orders_date'],
            exportPivotedData: true,
            pivotConfig: expect.objectContaining({
                pivotDimensions: ['orders_date'],
            }),
            customLabels: { orders_status: 'Status' },
            conditionalFormattings: [],
            showColumnTotals: true,
            showTableNames: false,
        });
    });

    it('keeps only column order and pivots for other chart types', () => {
        const chart: CreateSavedChartVersion = {
            tableName: 'orders',
            metricQuery,
            tableConfig: { columnOrder: ['orders_status'] },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: { xField: 'orders_status', yField: [] },
                    eChartsConfig: { series: [] },
                },
            },
        };

        expect(getChartExportRequest(chart, null)).toEqual({
            queryUuid: null,
            columnOrder: ['orders_status'],
            hiddenFields: [],
            exportPivotedData: true,
        });
    });
});
