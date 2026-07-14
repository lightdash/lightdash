import {
    ChartType,
    DimensionType,
    MetricType,
    type SemanticLayerDimension,
    type SemanticLayerMetric,
    type SemanticLayerResult,
} from '@lightdash/common';
import { buildDashboardTemplate } from './dashboardTemplate';

const dimension = (
    name: string,
    type: DimensionType,
    hidden = false,
): SemanticLayerDimension => ({
    fieldId: `orders_${name}`,
    name,
    label: name,
    type,
    source: { table: 'orders', column: name.replace(/_month$/, '') },
    hidden,
});

const metric = (
    name: string,
    type: MetricType,
    hidden = false,
): SemanticLayerMetric => ({
    fieldId: `orders_${name}`,
    name,
    label: name,
    type,
    source: { table: 'orders', column: name },
    hidden,
});

const semanticLayer = (): SemanticLayerResult => ({
    primaryExploreName: 'orders',
    explores: [
        {
            name: 'orders',
            label: 'Orders',
            baseTable: 'orders',
            metrics: [
                metric('total_revenue', MetricType.SUM),
                metric('orders_count', MetricType.COUNT),
                metric('avg_revenue', MetricType.AVERAGE),
                metric('unique_customer_id', MetricType.COUNT_DISTINCT),
            ],
            dimensions: [
                dimension('created_at', DimensionType.TIMESTAMP),
                dimension('created_at_month', DimensionType.DATE),
                dimension('status', DimensionType.STRING),
                dimension('channel', DimensionType.STRING),
            ],
            joins: [],
        },
    ],
    skippedTableCount: 0,
    validationErrors: [],
    generatedAt: '2026-07-13T12:00:00.000Z',
});

describe('buildDashboardTemplate', () => {
    it('selects governed KPIs, comparisons, time series, breakdowns, and filters', () => {
        const result = buildDashboardTemplate(semanticLayer());

        expect(result.warnings).toEqual([]);
        expect(result.charts.map((chart) => chart.name)).toEqual([
            'total_revenue',
            'Orders',
            'Avg order value',
            'Unique customers',
            'total_revenue over time',
            'total_revenue by status',
            'total_revenue by channel',
        ]);
        expect(result.charts.slice(0, 4)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    chartConfig: {
                        type: ChartType.BIG_NUMBER,
                        config: expect.objectContaining({
                            showComparison: true,
                        }),
                    },
                    metricQuery: expect.objectContaining({
                        dimensions: ['orders_created_at_month'],
                        sorts: [
                            {
                                fieldId: 'orders_created_at_month',
                                descending: true,
                            },
                        ],
                        limit: 2,
                    }),
                }),
            ]),
        );
        expect(result.dashboard.filters?.dimensions).toEqual([
            expect.objectContaining({
                target: {
                    fieldId: 'orders_created_at',
                    tableName: 'orders',
                },
            }),
            expect.objectContaining({
                target: {
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            }),
        ]);
        expect(
            result.charts.every(
                (chart) =>
                    chart.metricQuery.metrics.every((fieldId) =>
                        fieldId.startsWith('orders_'),
                    ) &&
                    chart.metricQuery.dimensions.every((fieldId) =>
                        fieldId.startsWith('orders_'),
                    ),
            ),
        ).toBe(true);
    });

    it('omits comparisons and time series when no date dimension exists', () => {
        const fixture = semanticLayer();
        fixture.explores[0].dimensions = fixture.explores[0].dimensions.filter(
            (field) =>
                field.type !== DimensionType.DATE &&
                field.type !== DimensionType.TIMESTAMP,
        );

        const result = buildDashboardTemplate(fixture);

        expect(result.warnings).toContain(
            'Period comparisons and time-series chart omitted because no visible date dimension exists',
        );
        expect(
            result.charts.some((chart) => chart.name.endsWith('over time')),
        ).toBe(false);
        expect(result.charts[0].chartConfig).toEqual({
            type: ChartType.BIG_NUMBER,
            config: expect.objectContaining({ showComparison: false }),
        });
    });

    it('skips categorical and segment breakdowns when no usable strings exist', () => {
        const fixture = semanticLayer();
        fixture.explores[0].dimensions = [
            dimension('created_at', DimensionType.TIMESTAMP),
            dimension('created_at_month', DimensionType.DATE),
            dimension('customer_email', DimensionType.STRING),
            dimension('order_id', DimensionType.STRING),
        ];

        const result = buildDashboardTemplate(fixture);

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                'Categorical breakdown omitted because no visible string dimension exists',
                'Segment breakdown omitted because no second visible string dimension exists',
            ]),
        );
        expect(
            result.charts.filter((chart) => chart.name.includes(' by ')),
        ).toEqual([]);
    });

    it('excludes hidden metrics and warns when the average KPI is missing', () => {
        const fixture = semanticLayer();
        fixture.explores[0].metrics = [
            metric('total_revenue', MetricType.SUM, true),
            metric('orders_count', MetricType.COUNT),
            metric('unique_customer_id', MetricType.COUNT_DISTINCT),
        ];

        const result = buildDashboardTemplate(fixture);

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                'Revenue KPI omitted because no visible SUM money metric exists',
                'Avg order value KPI omitted because no visible AVERAGE metric exists',
            ]),
        );
        expect(
            result.charts.some((chart) =>
                chart.metricQuery.metrics.includes('orders_total_revenue'),
            ),
        ).toBe(false);
        expect(
            result.charts.some((chart) => chart.name === 'Avg order value'),
        ).toBe(false);
    });

    it('returns identical output for identical input', () => {
        const fixture = semanticLayer();

        expect(buildDashboardTemplate(fixture)).toEqual(
            buildDashboardTemplate(fixture),
        );
    });
});
