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

    describe('hidden field splitting for table charts', () => {
        it('splits hidden fields into hiddenDimensionFieldIds and hiddenMetricFieldIds when metricQuery is provided', () => {
            // Chart config has both a hidden dim (orders_status) and a hidden metric (payments_total_revenue)
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            orders_status: { visible: false },
                            payments_total_revenue: { visible: false },
                        },
                    },
                },
                pivotConfig: { columns: ['payments_payment_method'] },
                tableConfig: { columnOrder: [] },
                metricQuery: {
                    dimensions: ['payments_payment_method', 'orders_status'],
                },
            });

            expect(result).toBeDefined();
            // orders_status is a dimension → hiddenDimensionFieldIds
            expect(result?.hiddenDimensionFieldIds).toEqual(['orders_status']);
            // payments_total_revenue is NOT in dimensions → hiddenMetricFieldIds
            expect(result?.hiddenMetricFieldIds).toEqual([
                'payments_total_revenue',
            ]);
        });

        it('only populates hiddenDimensionFieldIds when all hidden fields are dimensions', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            orders_status: { visible: false },
                        },
                    },
                },
                pivotConfig: { columns: ['payments_payment_method'] },
                tableConfig: { columnOrder: [] },
                metricQuery: {
                    dimensions: ['payments_payment_method', 'orders_status'],
                },
            });

            expect(result).toBeDefined();
            expect(result?.hiddenDimensionFieldIds).toEqual(['orders_status']);
            // No hidden metrics → should be absent (not an empty array)
            expect(result?.hiddenMetricFieldIds).toBeUndefined();
        });

        it('only populates hiddenMetricFieldIds when all hidden fields are metrics', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            payments_total_revenue: { visible: false },
                        },
                    },
                },
                pivotConfig: { columns: ['payments_payment_method'] },
                tableConfig: { columnOrder: [] },
                metricQuery: {
                    dimensions: ['payments_payment_method', 'orders_status'],
                },
            });

            expect(result).toBeDefined();
            // payments_total_revenue is not a dimension → hiddenMetricFieldIds
            expect(result?.hiddenMetricFieldIds).toEqual([
                'payments_total_revenue',
            ]);
            // No hidden dims → should be absent
            expect(result?.hiddenDimensionFieldIds).toBeUndefined();
        });

        it('omits both hiddenDimensionFieldIds and hiddenMetricFieldIds when metricQuery is provided but no fields are hidden', () => {
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            orders_status: { visible: true },
                            payments_total_revenue: { visible: true },
                        },
                    },
                },
                pivotConfig: { columns: ['payments_payment_method'] },
                tableConfig: { columnOrder: [] },
                metricQuery: {
                    dimensions: ['payments_payment_method', 'orders_status'],
                },
            });

            expect(result).toBeDefined();
            // No hidden fields at all → both arrays must be absent (not empty arrays)
            expect(result?.hiddenDimensionFieldIds).toBeUndefined();
            expect(result?.hiddenMetricFieldIds).toBeUndefined();
        });

        it('falls back to hiddenMetricFieldIds for all hidden fields when metricQuery is absent', () => {
            // Backward-compat: callers that cannot provide metricQuery (e.g. ChartDownloadMenu)
            // get the legacy flat list in hiddenMetricFieldIds.
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            orders_status: { visible: false },
                            payments_total_revenue: { visible: false },
                        },
                    },
                },
                pivotConfig: { columns: ['payments_payment_method'] },
                tableConfig: { columnOrder: [] },
                // No metricQuery provided
            });

            expect(result).toBeDefined();
            // Both fields land in hiddenMetricFieldIds (legacy behaviour)
            expect(result?.hiddenMetricFieldIds).toEqual(
                expect.arrayContaining([
                    'orders_status',
                    'payments_total_revenue',
                ]),
            );
            expect(result?.hiddenDimensionFieldIds).toBeUndefined();
        });

        it('routes hidden dimensions into hiddenDimensionFieldIds (not hiddenMetricFieldIds) when getPivotConfig receives metricQuery', () => {
            // Regression guard: ChartDownloadMenu now passes metricQuery, so
            // sort-helper dimensions must land in hiddenDimensionFieldIds and be
            // excluded from the downloaded file.
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            sort_helper_dim: { visible: false },
                        },
                        showSubtotals: false,
                    },
                },
                pivotConfig: { columns: ['shipping_method'] },
                tableConfig: { columnOrder: [] },
                metricQuery: {
                    dimensions: ['shipping_method', 'sort_helper_dim'],
                },
            });

            expect(result?.hiddenDimensionFieldIds).toEqual([
                'sort_helper_dim',
            ]);
            // The hidden dim must NOT appear in hiddenMetricFieldIds, otherwise
            // pivotQueryResults would ignore it and the dim leaks into the export.
            expect(result?.hiddenMetricFieldIds).toBeUndefined();
        });

        it('falls back to hiddenMetricFieldIds when metricQuery is omitted (footgun: callers must pass metricQuery for dim hiding to work)', () => {
            // Documentation test: demonstrates why ChartDownloadMenu MUST pass
            // metricQuery. Without it the hidden sort-helper dim ends up in
            // hiddenMetricFieldIds, which pivotQueryResults ignores for
            // dimension-typed columns — so the dim leaks into the CSV/XLSX export.
            const result = getPivotConfig({
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: { sort_helper_dim: { visible: false } },
                    },
                },
                pivotConfig: { columns: ['shipping_method'] },
                tableConfig: { columnOrder: [] },
                // metricQuery intentionally omitted
            });

            // Footgun: without metricQuery we can't classify, so hidden dims end up
            // in hiddenMetricFieldIds — where pivotQueryResults will ignore them.
            expect(result?.hiddenMetricFieldIds).toEqual(['sort_helper_dim']);
            expect(result?.hiddenDimensionFieldIds).toBeUndefined();
        });
    });
});
