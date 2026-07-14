import { ChartType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { parseChartFromExplorerSearchParams } from './useExplorerRoute';

const searchFromPayload = (payload: unknown) =>
    `?create_saved_chart_version=${encodeURIComponent(
        JSON.stringify(payload),
    )}`;

describe('parseChartFromExplorerSearchParams', () => {
    it('returns undefined when the param is absent', () => {
        expect(parseChartFromExplorerSearchParams('')).toBeUndefined();
    });

    it('defaults missing state keys instead of crashing', () => {
        // Regression: agent-generated share links carried payloads with only
        // a metricQuery — no chartConfig/tableConfig/tableCalculations — and
        // the explorer crashed reading `chartConfig.type` on load
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total'],
                    sorts: [{ fieldId: 'orders_total', descending: true }],
                    limit: 500,
                },
            }),
        );

        expect(parsed).toBeDefined();
        expect(parsed!.chartConfig).toEqual({
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        });
        expect(parsed!.tableConfig).toEqual({ columnOrder: [] });
        expect(parsed!.metricQuery.filters).toEqual({});
        expect(parsed!.metricQuery.tableCalculations).toEqual([]);
    });

    it('defaults missing metricQuery arrays', () => {
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: { exploreName: 'orders', limit: 500 },
            }),
        );

        expect(parsed!.metricQuery.dimensions).toEqual([]);
        expect(parsed!.metricQuery.metrics).toEqual([]);
        expect(parsed!.metricQuery.sorts).toEqual([]);
    });

    it('falls back to tableName when exploreName is missing', () => {
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: { dimensions: [], metrics: [], limit: 500 },
            }),
        );

        expect(parsed!.metricQuery.exploreName).toBe('orders');
    });

    it('keeps provided state untouched', () => {
        const chartConfig = {
            type: ChartType.TABLE,
            config: { showColumnCalculation: false },
        };
        const parsed = parseChartFromExplorerSearchParams(
            searchFromPayload({
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                chartConfig,
                tableConfig: { columnOrder: ['orders_status'] },
            }),
        );

        expect(parsed!.chartConfig).toEqual(chartConfig);
        expect(parsed!.tableConfig).toEqual({
            columnOrder: ['orders_status'],
        });
        expect(parsed!.metricQuery.limit).toBe(100);
    });
});
