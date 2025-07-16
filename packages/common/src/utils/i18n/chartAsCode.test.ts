import { type ChartAsCode } from '../../types/coder';
import { ChartType, type ChartConfig } from '../../types/savedCharts';
import { ChartAsCodeInternalization } from './chartAsCode';

describe('ChartAsCodeInternalization', () => {
    describe('getLanguageMap', () => {
        it('should handle chart with empty yAxis entry', () => {
            // Create a chart with cartesian type but empty yAxis entry
            const chartAsCode: ChartAsCode = {
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                name: 'Test Chart',
                description: '',
                tableName: 'test_table',
                slug: 'test-chart',
                spaceSlug: 'test-space',
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        eChartsConfig: {
                            yAxis: [
                                {
                                    name: 'top axis',
                                },
                                {}, // empty bottom axis
                            ],
                        },
                    },
                } as ChartConfig,
                metricQuery: {
                    exploreName: 'test_explore',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();
            const languageMap =
                chartAsCodeInternalization.getLanguageMap(chartAsCode);

            expect(languageMap).toBeDefined();
            expect(languageMap.chart).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug]).toBeDefined();
            expect(
                languageMap.chart[chartAsCode.slug].chartConfig,
            ).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug].chartConfig?.type).toBe(
                ChartType.CARTESIAN,
            );
        });

        it('should throw error for chart with missing eChartsConfig for cartesian type', () => {
            // Create a chart with cartesian type but missing eChartsConfig
            const chartAsCode: ChartAsCode = {
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                name: 'Test Chart',
                description: '',
                tableName: 'test_table',
                slug: 'test-chart',
                spaceSlug: 'test-space',
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        // Missing eChartsConfig
                    },
                } as ChartConfig,
                metricQuery: {
                    exploreName: 'test_explore',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();

            expect(() => {
                chartAsCodeInternalization.getLanguageMap(chartAsCode);
            }).toThrow();
        });

        it('should handle valid pie chart', () => {
            // Create a valid pie chart
            const chartAsCode: ChartAsCode = {
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                name: 'Test Pie Chart',
                description: '',
                tableName: 'test_table',
                slug: 'test-pie-chart',
                spaceSlug: 'test-space',
                chartConfig: {
                    type: ChartType.PIE,
                    config: {
                        groupLabelOverrides: {
                            label1: 'Override 1',
                        },
                    },
                },
                metricQuery: {
                    exploreName: 'test_explore',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();
            const languageMap =
                chartAsCodeInternalization.getLanguageMap(chartAsCode);

            expect(languageMap).toBeDefined();
            expect(languageMap.chart).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug]).toBeDefined();
            expect(
                languageMap.chart[chartAsCode.slug].chartConfig,
            ).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug].chartConfig?.type).toBe(
                ChartType.PIE,
            );
        });

        it('should handle valid funnel chart', () => {
            // Create a valid funnel chart
            const chartAsCode: ChartAsCode = {
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                name: 'Test Funnel Chart',
                description: '',
                tableName: 'test_table',
                slug: 'test-funnel-chart',
                spaceSlug: 'test-space',
                chartConfig: {
                    type: ChartType.FUNNEL,
                    config: {
                        labelOverrides: {
                            label1: 'Override 1',
                        },
                    },
                },
                metricQuery: {
                    exploreName: 'test_explore',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();
            const languageMap =
                chartAsCodeInternalization.getLanguageMap(chartAsCode);

            expect(languageMap).toBeDefined();
            expect(languageMap.chart).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug]).toBeDefined();
            expect(
                languageMap.chart[chartAsCode.slug].chartConfig,
            ).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug].chartConfig?.type).toBe(
                ChartType.FUNNEL,
            );
        });

        it('should handle valid big number chart', () => {
            // Create a valid big number chart
            const chartAsCode: ChartAsCode = {
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                name: 'Test Big Number Chart',
                description: '',
                tableName: 'test_table',
                slug: 'test-big-number-chart',
                spaceSlug: 'test-space',
                chartConfig: {
                    type: ChartType.BIG_NUMBER,
                    config: {
                        label: 'Test Label',
                        comparisonLabel: 'Comparison Label',
                    },
                },
                metricQuery: {
                    exploreName: 'test_explore',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();
            const languageMap =
                chartAsCodeInternalization.getLanguageMap(chartAsCode);

            expect(languageMap).toBeDefined();
            expect(languageMap.chart).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug]).toBeDefined();
            expect(
                languageMap.chart[chartAsCode.slug].chartConfig,
            ).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug].chartConfig?.type).toBe(
                ChartType.BIG_NUMBER,
            );
        });

        it('should handle valid table chart', () => {
            // Create a valid table chart
            const chartAsCode: ChartAsCode = {
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                name: 'Test Table Chart',
                description: '',
                tableName: 'test_table',
                slug: 'test-table-chart',
                spaceSlug: 'test-space',
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            column1: {
                                name: 'Column 1',
                            },
                        },
                    },
                },
                metricQuery: {
                    exploreName: 'test_explore',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();
            const languageMap =
                chartAsCodeInternalization.getLanguageMap(chartAsCode);

            expect(languageMap).toBeDefined();
            expect(languageMap.chart).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug]).toBeDefined();
            expect(
                languageMap.chart[chartAsCode.slug].chartConfig,
            ).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug].chartConfig?.type).toBe(
                ChartType.TABLE,
            );
        });

        it('should handle custom chart', () => {
            const chartAsCode: ChartAsCode = {
                name: 'Average Order Per Payment Method',
                description: '',
                tableName: 'payments',
                slug: 'average-order-per-payment-method',
                spaceSlug: 'parent-space-5',
                dashboardSlug: undefined,
                pivotConfig: { columns: [] },
                chartConfig: {
                    type: ChartType.CUSTOM,
                    config: {
                        spec: {
                            mark: 'bar',
                            encoding: {
                                x: {
                                    axis: {
                                        labelAngle: 0,
                                    },
                                    type: 'nominal',
                                    field: 'payments_payment_method',
                                    title: 'Payment Method',
                                },
                                y: {
                                    type: 'quantitative',
                                    field: 'orders_average_order_size',
                                    title: 'Average Order Size',
                                },
                                color: {
                                    type: 'nominal',
                                    field: 'payments_payment_method',
                                    legend: null,
                                },
                                tooltip: [
                                    {
                                        type: 'nominal',
                                        field: 'payments_payment_method',
                                        title: 'Payment Method',
                                    },
                                    {
                                        type: 'quantitative',
                                        field: 'orders_average_order_size',
                                        title: 'Average Order Size',
                                        format: '.2f',
                                    },
                                ],
                            },
                        },
                    },
                },
                metricQuery: {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_method'],
                    metrics: ['orders_average_order_size'],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_average_order_size',
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                tableConfig: {
                    columnOrder: [
                        'payments_payment_method',
                        'orders_average_order_size',
                    ],
                },
                updatedAt: new Date(),
                version: 1,
            };

            const chartAsCodeInternalization = new ChartAsCodeInternalization();
            const languageMap =
                chartAsCodeInternalization.getLanguageMap(chartAsCode);

            expect(languageMap).toBeDefined();
            expect(languageMap.chart).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug]).toBeDefined();
            expect(
                languageMap.chart[chartAsCode.slug].chartConfig,
            ).toBeDefined();
            expect(languageMap.chart[chartAsCode.slug].chartConfig?.type).toBe(
                ChartType.CUSTOM,
            );
        });
    });
});
