import { ChartType } from '../types/savedCharts';
import { getPivotConfig } from './pivotConfig';

describe('getPivotConfig', () => {
    describe('Cartesian chart pivot config', () => {
        it('returns pivot config for cartesian charts with pivot', () => {
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
            expect(result?.pivotDimensions).toEqual(['dim_b']);
            expect(result?.metricsAsRows).toBe(false);
            // visibleMetricFieldIds should NOT be set — sort-only columns
            // are now excluded at the source via sortOnlyColumns
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
