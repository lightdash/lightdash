import {
    ChartType,
    ContentAsCodeType,
    FilterOperator,
    type ChartAsCode,
} from '../..';
import {
    buildChartAsCodeArtifact,
    getChartAsCodeMetricQuery,
    isChartAsCodeArtifactConfig,
} from './chartAsCodeArtifact';

describe('chartAsCodeArtifact', () => {
    const chartAsCode = {
        name: 'Orders over time',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_created_date'],
            metrics: ['orders_count'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        },
        chartConfig: {
            type: ChartType.TABLE,
        },
        slug: 'orders-over-time',
        spaceSlug: 'agent-suggestions',
        version: 1,
        contentType: ContentAsCodeType.CHART,
    } as unknown as ChartAsCode;

    it('detects chart-as-code artifact configs', () => {
        expect(isChartAsCodeArtifactConfig(chartAsCode)).toBe(true);
        // The explicit contentType discriminator is required — shape alone is not enough
        expect(
            isChartAsCodeArtifactConfig({
                ...chartAsCode,
                contentType: undefined,
            }),
        ).toBe(false);
        expect(
            isChartAsCodeArtifactConfig({
                title: 'Legacy',
                queryConfig: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: ['orders_count'],
                    sorts: [],
                    limit: 500,
                },
                chartConfig: null,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            }),
        ).toBe(false);
    });

    it('normalizes metric queries for artifact execution', () => {
        expect(getChartAsCodeMetricQuery(chartAsCode)).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_created_date'],
            metrics: ['orders_count'],
            filters: {},
            additionalMetrics: [],
            tableCalculations: [],
        });
    });

    it('adds missing filter ids for runtime query execution', () => {
        const metricQuery = getChartAsCodeMetricQuery({
            ...chartAsCode,
            metricQuery: {
                ...chartAsCode.metricQuery,
                filters: {
                    dimensions: {
                        and: [
                            {
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['complete'],
                            },
                        ],
                    },
                },
            },
        } as unknown as ChartAsCode);

        expect(metricQuery.filters.dimensions).toEqual({
            id: expect.any(String),
            and: [
                {
                    id: expect.any(String),
                    target: { fieldId: 'orders_status' },
                    operator: FilterOperator.EQUALS,
                    values: ['complete'],
                },
            ],
        });
    });

    it('builds normalized AI chart artifacts with default metadata', () => {
        expect(
            buildChartAsCodeArtifact({
                name: 'Orders over time',
                tableName: 'orders',
                metricQuery: chartAsCode.metricQuery,
                chartConfig: chartAsCode.chartConfig,
            }),
        ).toMatchObject({
            name: 'Orders over time',
            tableName: 'orders',
            slug: 'orders-over-time',
            spaceSlug: 'agent-suggestions',
            version: 1,
            contentType: 'chart',
            tableConfig: {
                columnOrder: ['orders_created_date', 'orders_count'],
            },
        });
    });

    it('preserves canonical chart-as-code table config', () => {
        expect(
            buildChartAsCodeArtifact({
                name: 'Orders over time',
                tableName: 'orders',
                metricQuery: chartAsCode.metricQuery,
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        columns: {
                            orders_count: {
                                displayStyle: 'bar',
                                color: '#4CAF50',
                            },
                        },
                    },
                },
            }).chartConfig,
        ).toMatchObject({
            type: ChartType.TABLE,
            config: {
                columns: {
                    orders_count: {
                        displayStyle: 'bar',
                        color: '#4CAF50',
                    },
                },
            },
        });
    });
});
