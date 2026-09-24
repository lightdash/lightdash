import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    type AiSemanticChartArtifactConfig,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildChartIntentContext } from './chartIntent';
import { composeInstantReply } from './instantReplies';

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    tables: {
        orders: {
            label: 'Orders',
            dimensions: {
                month: {
                    name: 'month',
                    table: 'orders',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    label: 'Order month',
                },
                region: {
                    name: 'region',
                    table: 'orders',
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    label: 'Region',
                },
            },
            metrics: {
                revenue: {
                    name: 'revenue',
                    table: 'orders',
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    label: 'Revenue',
                },
            },
        },
    },
} as unknown as Explore;

const artifact: AiSemanticChartArtifactConfig = {
    source: 'semantic',
    config: {
        title: 'Revenue',
        description: 'Revenue by month',
        queryConfig: {
            exploreName: 'orders',
            dimensions: ['orders_month', 'orders_region'],
            metrics: ['orders_revenue'],
            sorts: [
                {
                    fieldId: 'orders_revenue',
                    descending: true,
                    nullsFirst: null,
                },
            ],
            limit: 500,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: {
                type: 'and',
                dimensions: [
                    {
                        fieldId: 'orders_region',
                        fieldType: DimensionType.STRING,
                        fieldFilterType: FilterType.STRING,
                        operator: FilterOperator.EQUALS,
                        values: ['North'],
                    },
                ],
                metrics: null,
                tableCalculations: null,
            },
        },
        chartConfig: null,
    },
};

const chart = {
    exploreLabel: 'Orders',
    context: buildChartIntentContext({
        prompt: 'show me the query',
        artifact,
        explore,
        usage: { verified: new Map(), charts: new Map() },
        filterRules: [
            { fieldId: 'orders_region', operator: 'equals', values: ['North'] },
        ],
    }),
};

describe('composeInstantReply', () => {
    it('summarises the chart query from the chart itself', () => {
        expect(
            composeInstantReply({
                kind: 'show_query',
                chart,
                canDownload: true,
            }),
        ).toBe(
            [
                'This chart queries **Orders**:',
                '- Metrics: Revenue',
                '- Breakdowns: Order month, Region',
                '- Filters: Region is North',
                '- Sorted by: Revenue (highest first)',
                '',
                'For the exact SQL, open the **⋯** menu on the chart and choose **View SQL**.',
            ].join('\n'),
        );
    });

    it('only explains downloads to people who can download', () => {
        expect(
            composeInstantReply({
                kind: 'download_help',
                chart,
                canDownload: true,
            }),
        ).toContain('Download results');
        expect(
            composeInstantReply({
                kind: 'download_help',
                chart,
                canDownload: false,
            }),
        ).toBeNull();
    });

    it('needs a chart for anything but an acknowledgement', () => {
        expect(
            composeInstantReply({
                kind: 'show_query',
                chart: null,
                canDownload: true,
            }),
        ).toBeNull();
        expect(
            composeInstantReply({
                kind: 'acknowledgement',
                chart: null,
                canDownload: false,
            }),
        ).toBe('Glad that helps. Ask me anything else about this data.');
    });
});
