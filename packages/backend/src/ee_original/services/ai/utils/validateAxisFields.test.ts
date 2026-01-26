import {
    type TableCalcsSchema,
    type ToolRunQueryArgsTransformed,
} from '@lightdash/common';

import { mockOrdersExplore } from './validationExplore.mock';
import { validateAxisFields } from './validators';

describe('validateAxisFields', () => {
    describe('Edge Cases', () => {
        it('should not throw when chartConfig is null or undefined', () => {
            expect(() =>
                validateAxisFields(
                    null,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();

            expect(() =>
                validateAxisFields(
                    undefined,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();
        });

        it('should not throw when xAxisDimension and yAxisMetrics are null', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'table',
                xAxisDimension: null,
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();
        });

        it('should not throw when yAxisMetrics is an empty array', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'table',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: [],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    ['orders_order_date'],
                    ['orders_total_revenue'],
                ),
            ).not.toThrow();
        });
    });

    describe('Happy Paths - xAxisDimension', () => {
        it('should not throw for valid xAxisDimension', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });

        it('should not throw when xAxisDimension is one of multiple selected dimensions', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = [
                'orders_order_date',
                'orders_customer_name',
                'orders_product_category',
            ];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Happy Paths - yAxisMetrics', () => {
        it('should not throw for valid yAxisMetrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });

        it('should not throw for multiple valid yAxisMetrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: [
                    'orders_total_revenue',
                    'orders_order_count',
                    'orders_avg_order_value',
                ],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: 'line',
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
                'orders_avg_order_value',
            ];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });

        it('should not throw when yAxisMetrics includes table calculations', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue', 'running_total_revenue'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: 'line',
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const tableCalculations: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_revenue',
                    displayName: 'Running Total Revenue',
                    fieldId: 'orders_total_revenue',
                },
            ];

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                    tableCalculations,
                ),
            ).not.toThrow();
        });

        it('should not throw when all yAxisMetrics are table calculations', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'line',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['running_total_revenue', 'percent_change'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: 'line',
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const tableCalculations: TableCalcsSchema = [
                {
                    type: 'running_total',
                    name: 'running_total_revenue',
                    displayName: 'Running Total Revenue',
                    fieldId: 'orders_total_revenue',
                },
                {
                    type: 'percent_change_from_previous',
                    name: 'percent_change',
                    displayName: 'Percent Change',
                    fieldId: 'orders_total_revenue',
                    orderBy: [],
                },
            ];

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                    tableCalculations,
                ),
            ).not.toThrow();
        });
    });

    describe('Combined Happy Paths', () => {
        it('should not throw for valid xAxisDimension and yAxisMetrics together', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue', 'orders_order_count'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'Date',
                yAxisLabel: 'Revenue & Count',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_order_count',
            ];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });

    describe('Error Cases - xAxisDimension', () => {
        it('should throw when xAxisDimension is not in queryConfig.dimensions', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_customer_name',
                yAxisMetrics: null,
                groupBy: null,
                xAxisType: 'category',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_customer_name/);
        });
    });

    describe('Error Cases - yAxisMetrics', () => {
        it('should throw when yAxisMetric is not in queryConfig.metrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: null,
                yAxisMetrics: ['orders_avg_order_value'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_avg_order_value/);
        });
    });

    describe('Error Cases - Combined', () => {
        it('should throw when both xAxisDimension and yAxisMetrics are not selected', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_customer_name',
                yAxisMetrics: ['orders_avg_order_value'],
                groupBy: null,
                xAxisType: null,
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = ['orders_total_revenue'];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).toThrow(/orders_customer_name/);
        });
    });

    describe('Custom Metrics Integration', () => {
        it('should not throw when yAxisMetrics includes custom metrics', () => {
            const chartConfig: ToolRunQueryArgsTransformed['chartConfig'] = {
                defaultVizType: 'bar',
                xAxisDimension: 'orders_order_date',
                yAxisMetrics: ['orders_total_revenue', 'orders_custom_metric'],
                groupBy: null,
                xAxisType: 'time',
                stackBars: null,
                lineType: null,
                funnelDataInput: null,
                xAxisLabel: 'xAxisLabel',
                yAxisLabel: 'yAxisLabel',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
            };

            const selectedDimensions = ['orders_order_date'];
            const selectedMetrics = [
                'orders_total_revenue',
                'orders_custom_metric',
            ];

            expect(() =>
                validateAxisFields(
                    chartConfig,
                    selectedDimensions,
                    selectedMetrics,
                ),
            ).not.toThrow();
        });
    });
});
