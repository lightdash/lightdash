import { ChartType } from '../types/savedCharts';
import { getPivotConfig } from './pivotConfig';

describe('getPivotConfig', () => {
    describe('Cartesian chart visibleMetricFieldIds', () => {
        it('sets visibleMetricFieldIds to yField for cartesian charts with pivot', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'dim_a',
                            yField: ['metric_a', 'metric_b'],
                        },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotConfig: { columns: ['dim_b'] },
                tableConfig: { columnOrder: [] },
            });

            expect(result).toBeDefined();
            expect(result?.visibleMetricFieldIds).toEqual([
                'metric_a',
                'metric_b',
            ]);
        });

        it('includes table calculations in visibleMetricFieldIds when they are in yField', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'dim_a',
                            yField: [
                                'metric_a',
                                'revenue_per_order', // table calculation
                            ],
                        },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotConfig: { columns: ['dim_b'] },
                tableConfig: { columnOrder: [] },
            });

            expect(result).toBeDefined();
            expect(result?.visibleMetricFieldIds).toEqual([
                'metric_a',
                'revenue_per_order',
            ]);
        });

        it('does not set visibleMetricFieldIds when yField is empty', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'dim_a',
                            yField: [],
                        },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotConfig: { columns: ['dim_b'] },
                tableConfig: { columnOrder: [] },
            });

            expect(result).toBeDefined();
            expect(result?.visibleMetricFieldIds).toBeUndefined();
        });

        it('does not set visibleMetricFieldIds when yField is undefined', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'dim_a',
                            yField: undefined,
                        },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotConfig: { columns: ['dim_b'] },
                tableConfig: { columnOrder: [] },
            });

            expect(result).toBeDefined();
            expect(result?.visibleMetricFieldIds).toBeUndefined();
        });

        it('returns undefined for cartesian charts without pivot config', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            xField: 'dim_a',
                            yField: ['metric_a'],
                        },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotConfig: undefined,
                tableConfig: { columnOrder: [] },
            });

            expect(result).toBeUndefined();
        });

        it('does not set visibleMetricFieldIds for table charts', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {},
                },
                pivotConfig: { columns: ['dim_b'] },
                tableConfig: { columnOrder: [] },
            });

            expect(result).toBeDefined();
            expect(result?.visibleMetricFieldIds).toBeUndefined();
        });
    });
});
