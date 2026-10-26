import { MetricType } from '../../types/field';
import { FilterOperator, FilterType, UnitOfTime } from '../../types/filter';
import { type AdditionalMetric } from '../../types/metricQuery';
import { buildPopAdditionalMetric } from '../../types/periodOverPeriodComparison';
import {
    QuerySourceType,
    type SemanticLayerSourceQuery,
} from '../../types/querySources';
import { TimeFrames } from '../../types/timeFrames';
import { explore } from '../../utils/fields.mock';
import { toComposerSemanticArtifactVersion } from './composerSemanticArtifact';
import { type ComposerStoredChartVizConfig } from './schemas';
import { parseAiArtifactChartConfig, parseVizConfig } from './utils';

const node: SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_total_order_amount'],
    sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
    parameters: { 'orders.currency': 'EUR' },
    limit: 500,
};

const line: ComposerStoredChartVizConfig = {
    type: 'line',
    x: 'orders_order_date_month',
    y: ['orders_total_order_amount'],
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

// Filters as the query tool resolves a node's filter expressions.
const filters: SemanticLayerSourceQuery['filters'] = {
    dimensions: {
        id: 'dims',
        and: [
            {
                id: 'status',
                target: {
                    fieldId: 'orders_status',
                    fieldFilterType: FilterType.STRING,
                },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
            },
            {
                id: 'date',
                target: {
                    fieldId: 'orders_order_date_month',
                    fieldFilterType: FilterType.DATE,
                },
                operator: FilterOperator.IN_THE_PAST,
                values: [3],
                settings: { completed: true, unitOfTime: UnitOfTime.months },
            },
        ],
    },
    metrics: {
        id: 'metrics',
        or: [
            {
                id: 'amount',
                target: {
                    fieldId: 'orders_total_order_amount',
                    fieldFilterType: FilterType.NUMBER,
                },
                operator: FilterOperator.GREATER_THAN,
                values: [100],
            },
            {
                id: 'missing',
                target: {
                    fieldId: 'orders_total_order_amount',
                    fieldFilterType: FilterType.NUMBER,
                },
                operator: FilterOperator.NULL,
                values: [],
            },
        ],
    },
} as SemanticLayerSourceQuery['filters'];

const present = (
    overrides: Partial<SemanticLayerSourceQuery> = {},
    vizConfig: ComposerStoredChartVizConfig = line,
) =>
    toComposerSemanticArtifactVersion({
        title: 'Revenue by month',
        description: null,
        node: { ...node, ...overrides },
        vizConfig,
        maxQueryLimit: 1000,
        explore,
    });

const withoutIds = (value: unknown): unknown =>
    JSON.parse(
        JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v)),
    );

describe('toComposerSemanticArtifactVersion', () => {
    it('replays as the same metric query through the classic artifact parser', () => {
        const version = present({ filters });

        const artifact = parseAiArtifactChartConfig(version?.vizConfig);
        if (artifact?.source !== 'semantic') throw new Error('not semantic');
        const replay = parseVizConfig(artifact.config, 1000);

        expect(replay?.metricQuery).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_order_date_month', 'orders_status'],
            metrics: ['orders_total_order_amount'],
            sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
            limit: 500,
        });
        expect(replay?.parameters).toEqual({ 'orders.currency': 'EUR' });
        expect(withoutIds(replay?.metricQuery.filters)).toEqual({
            ...(withoutIds(filters) as object),
            tableCalculations: { and: [] },
        });
        expect(replay?.vizTool.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: null,
        });
    });

    it.each([
        [
            'nested filter groups',
            {
                filters: {
                    dimensions: { id: 'g', and: [{ id: 'n', or: [] }] },
                },
            },
        ],
        ['a limit above the classic maximum', { limit: 5000 }],
        [
            'table calculations',
            {
                tableCalculations: [
                    { name: 'tc', displayName: 'tc', sql: '1' },
                ],
            },
        ],
    ] as [string, Partial<SemanticLayerSourceQuery>][])(
        'is null for %s',
        (_, overrides) => {
            expect(present(overrides)).toBeNull();
        },
    );

    it('is null for a big number, which classic charts cannot draw', () => {
        expect(
            present({}, { ...line, type: 'big_number', x: null }),
        ).toBeNull();
    });

    it('is null for an area with a secondary axis, which classic charts stack', () => {
        expect(
            present({}, { ...line, type: 'area', y2: 'orders_count' }),
        ).toBeNull();
    });

    it('draws an area as a filled line and a horizontal bar as horizontal', () => {
        const area = present({}, { ...line, type: 'area' });
        const bar = present({}, { ...line, type: 'bar', horizontal: true });

        expect(area?.vizConfig.config.chartConfig).toMatchObject({
            defaultVizType: 'line',
            lineType: 'area',
        });
        expect(bar?.vizConfig.config.chartConfig).toMatchObject({
            defaultVizType: 'horizontal',
        });
    });

    describe('custom metrics and period comparisons', () => {
        const buyers: AdditionalMetric = {
            table: 'table1',
            name: 'buyers',
            label: 'Buyers',
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.dim1',
            baseDimensionName: 'dim1',
            filters: [
                {
                    id: 'buyers_filter_0',
                    target: { fieldRef: 'table1.dim1' },
                    operator: FilterOperator.EQUALS,
                    values: ['a'],
                },
            ],
        };
        const { additionalMetric: lastYear, metricId: lastYearId } =
            buildPopAdditionalMetric({
                metric: {
                    table: 'orders',
                    name: 'total_order_amount',
                    label: 'Total order amount',
                    type: MetricType.SUM,
                    sql: '${TABLE}.amount',
                },
                timeDimensionId: 'orders_order_date_month',
                granularity: TimeFrames.MONTH,
                periodOffset: 12,
            });
        const withCustomMetrics = (
            additionalMetrics: AdditionalMetric[],
        ): Partial<SemanticLayerSourceQuery> => ({
            metrics: ['orders_total_order_amount', lastYearId, 'table1_buyers'],
            additionalMetrics,
        });

        it('replays them through the classic artifact parser', () => {
            const version = present(withCustomMetrics([buyers, lastYear]));

            const artifact = parseAiArtifactChartConfig(version?.vizConfig);
            if (artifact?.source !== 'semantic')
                throw new Error('not semantic');
            const replay = parseVizConfig(artifact.config, 1000);

            expect(replay?.metricQuery.metrics).toEqual([
                'orders_total_order_amount',
                'table1_buyers',
            ]);
            expect(replay?.metricQuery.customMetrics).toMatchObject([
                {
                    table: 'table1',
                    name: 'buyers',
                    label: 'Buyers',
                    type: MetricType.COUNT_DISTINCT,
                    baseDimensionName: 'dim1',
                    filters: [
                        {
                            target: { fieldRef: 'table1.dim1' },
                            operator: FilterOperator.EQUALS,
                            values: ['a'],
                        },
                    ],
                },
                {
                    kind: 'periodComparison',
                    baseMetricId: 'orders_total_order_amount',
                    timeDimensionId: 'orders_order_date_month',
                    granularity: TimeFrames.MONTH,
                    periodOffset: 12,
                },
            ]);
        });

        it.each([
            [
                'a percentile, which runQuery cannot carry',
                [
                    {
                        ...buyers,
                        type: MetricType.PERCENTILE,
                        percentile: 90,
                        filters: undefined,
                    },
                ],
            ],
            [
                'a filter on a field the explore lacks',
                [
                    {
                        ...buyers,
                        filters: [
                            {
                                ...buyers.filters![0],
                                target: { fieldRef: 'table1.missing' },
                            },
                        ],
                    },
                ],
            ],
        ] as [string, AdditionalMetric[]][])(
            'is null for %s',
            (_, additionalMetrics) => {
                expect(
                    present(withCustomMetrics(additionalMetrics)),
                ).toBeNull();
            },
        );

        it('carries an unfiltered custom metric without the explore', () => {
            const version = toComposerSemanticArtifactVersion({
                title: 'Buyers',
                description: null,
                node: {
                    ...node,
                    ...withCustomMetrics([{ ...buyers, filters: undefined }]),
                },
                vizConfig: line,
                maxQueryLimit: 1000,
                explore: null,
            });

            const artifact = parseAiArtifactChartConfig(version?.vizConfig);
            if (artifact?.source !== 'semantic')
                throw new Error('not semantic');
            expect(
                parseVizConfig(artifact.config, 1000)?.metricQuery
                    .customMetrics,
            ).toMatchObject([
                {
                    name: 'buyers',
                    baseDimensionName: 'dim1',
                    filters: undefined,
                },
            ]);
        });

        it('is null for a filtered custom metric without the explore', () => {
            expect(
                toComposerSemanticArtifactVersion({
                    title: 'Buyers',
                    description: null,
                    node: { ...node, ...withCustomMetrics([buyers]) },
                    vizConfig: line,
                    maxQueryLimit: 1000,
                    explore: null,
                }),
            ).toBeNull();
        });
    });
});
