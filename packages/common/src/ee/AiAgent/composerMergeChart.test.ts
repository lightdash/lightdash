import { describe, expect, it } from 'vitest';
import { DimensionType } from '../../types/field';
import {
    buildMergeQueryFromMergeDefinition,
    MergeJoinType,
    type MergeTableCalculation,
} from '../../types/mergeQuery';
import {
    getMergeNodeMergeQuery,
    QuerySourceType,
    type MergeSourceQuery,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import { ChartType } from '../../types/savedCharts';
import { TimeFrames } from '../../types/timeFrames';
import { type AiComposerChartArtifactConfigV2 } from './composerArtifact';
import { getComposerMergeSavedChart } from './composerMergeChart';
import {
    composerChartVizConfigSchemaPersisted,
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
} from './schemas/tools/composerChartVizConfigSchema';

const semantic = (
    nodeId: string,
    exploreName: string,
    dimension: string,
    metric: string,
    extra: Partial<SemanticLayerSourceQuery> = {},
): SemanticLayerSourceQuery => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId,
    exploreName,
    dimensions: [dimension],
    metrics: [metric],
    ...extra,
});

const orders = semantic(
    'orders_monthly',
    'orders',
    'orders_order_date_month',
    'orders_total_order_amount',
    {
        filters: {
            dimensions: {
                id: 'g',
                and: [
                    {
                        id: 'r',
                        target: { fieldId: 'orders_status' },
                        operator: 'equals' as never,
                        values: ['completed'],
                    },
                ],
            },
        },
        limit: 100,
        sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
        parameters: { region: 'EU' },
    },
);
const payments = semantic(
    'payments_monthly',
    'payments',
    'payments_payment_month',
    'payments_total_revenue',
    { parameters: { region: 'EU' } },
);
const customers = semantic(
    'new_customers',
    'customers',
    'customers_created_month',
    'customers_count',
    { parameters: { region: 'EU' } },
);

const margin: MergeTableCalculation = {
    name: 'margin',
    displayName: 'Margin',
    sql: '',
    formula:
        '=${payments_monthly_payments_total_revenue} - ${orders_monthly_orders_total_order_amount}',
};

const twoSourceMerge: MergeSourceQuery = {
    sourceType: QuerySourceType.MERGE,
    nodeId: 'orders_vs_payments',
    sources: [
        { nodeId: 'orders_monthly' },
        { nodeId: 'payments_monthly', repeatValues: true },
    ],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: {
                orders_monthly: 'orders_order_date_month',
                payments_monthly: 'payments_payment_month',
            },
        },
    ],
    joinType: MergeJoinType.FULL,
    tableCalculations: [margin],
    sorts: [{ fieldId: 'merge_margin', descending: true }],
    limit: 50,
};

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
    ...(type === DimensionType.TIMESTAMP
        ? { timeInterval: TimeFrames.MONTH }
        : {}),
});

const twoSourceColumns: ResultColumn[] = [
    column('merge_month', DimensionType.TIMESTAMP),
    column('orders_monthly_orders_total_order_amount', DimensionType.NUMBER),
    column('payments_monthly_payments_total_revenue', DimensionType.NUMBER),
    column('merge_margin', DimensionType.NUMBER),
];

const viz = (
    config: Partial<ComposerBuiltinChartVizConfig> &
        Pick<ComposerBuiltinChartVizConfig, 'type'>,
): ComposerStoredChartVizConfig =>
    composerChartVizConfigSchemaPersisted.parse({
        x: null,
        y: null,
        groupBy: null,
        stack: null,
        horizontal: null,
        y2: null,
        labels: null,
        ...config,
    });

const artifact = (
    queries: SourceQuery[],
    terminalNodeId: string,
    vizConfig: ComposerStoredChartVizConfig | null,
): AiComposerChartArtifactConfigV2 => ({
    source: 'composer',
    schemaVersion: 2,
    queries,
    terminalNodeId,
    vizConfig,
});

const metadata = { title: 'Orders vs payments', description: '' };

const roundTrip = (
    config: AiComposerChartArtifactConfigV2,
    columns: ResultColumn[],
) => {
    const saved = getComposerMergeSavedChart({ config, columns, metadata });
    if (!saved) throw new Error('expected a saved chart');
    const node = config.queries.find(
        (query) => query.nodeId === config.terminalNodeId,
    ) as MergeSourceQuery;
    return {
        saved,
        expected: getMergeNodeMergeQuery(node, config.queries)!,
        rebuilt: buildMergeQueryFromMergeDefinition(
            saved.metricQuery,
            saved.merge,
        ),
    };
};

describe('getComposerMergeSavedChart', () => {
    it('saves a two-source merge under its node ids, keeping calc, sort and repeat values', () => {
        const { saved, expected, rebuilt } = roundTrip(
            artifact(
                [orders, payments, twoSourceMerge],
                'orders_vs_payments',
                viz({
                    type: 'bar',
                    x: 'merge_month',
                    y: [
                        'orders_monthly_orders_total_order_amount',
                        'merge_margin',
                    ],
                }),
            ),
            twoSourceColumns,
        );

        expect(saved.tableName).toBe('orders');
        expect(saved.merge.chartAs).toBe('orders_monthly');
        expect(saved.parameters).toEqual({ region: 'EU' });
        expect(saved.metricQuery).toMatchObject({
            exploreName: 'orders',
            dimensions: ['orders_order_date_month'],
            sorts: [{ fieldId: 'merge_margin', descending: true }],
            limit: 50,
        });
        expect(saved.tableConfig.columnOrder).toEqual(
            twoSourceColumns.map(({ reference }) => reference),
        );
        const chartJson = JSON.stringify(saved.chartConfig);
        expect(chartJson).not.toContain('composer_result');
        expect(chartJson).toContain('"merge_month"');
        expect(chartJson).toContain('"merge_margin"');

        expect(rebuilt.sources.map(({ id }) => id)).toEqual([
            'orders_monthly',
            'payments_monthly',
        ]);
        expect(rebuilt.sources[1].repeatValues).toBe(true);
        expect(rebuilt.sources[0].repeatValues).toBeUndefined();
        expect(rebuilt.joinKey).toEqual(expected.joinKey);
        expect(rebuilt.joinType).toBe(MergeJoinType.FULL);
        expect(rebuilt.tableCalculations).toEqual([margin]);
        expect(rebuilt.sorts).toEqual(expected.sorts);
        expect(rebuilt.limit).toBe(50);
        rebuilt.sources.forEach((source, index) => {
            if (!('metricQuery' in source)) throw new Error('metric source');
            const { exploreName, dimensions, metrics, filters } =
                expected.sources[index].metricQuery;
            expect(source.metricQuery).toMatchObject({
                exploreName,
                dimensions,
                metrics,
                filters,
            });
        });
    });

    it('saves three sources with two join keys and a pivot', () => {
        const merge: MergeSourceQuery = {
            sourceType: QuerySourceType.MERGE,
            nodeId: 'all_three',
            sources: [
                { nodeId: 'orders_monthly' },
                { nodeId: 'payments_monthly' },
                { nodeId: 'new_customers' },
            ],
            joinKey: [
                {
                    name: 'month',
                    fieldIdBySourceId: {
                        orders_monthly: 'orders_order_date_month',
                        payments_monthly: 'payments_payment_month',
                        new_customers: 'customers_created_month',
                    },
                },
                {
                    name: 'region',
                    fieldIdBySourceId: {
                        orders_monthly: 'orders_region',
                        payments_monthly: 'payments_region',
                        new_customers: 'customers_region',
                    },
                },
            ],
            joinType: MergeJoinType.LEFT,
            sorts: [{ fieldId: 'merge_month', descending: false }],
        };
        const withRegion = (
            node: SemanticLayerSourceQuery,
            region: string,
        ): SemanticLayerSourceQuery => ({
            ...node,
            dimensions: [...node.dimensions, region],
        });
        const columns = [
            column('merge_month', DimensionType.TIMESTAMP),
            column('merge_region', DimensionType.STRING),
            column(
                'orders_monthly_orders_total_order_amount',
                DimensionType.NUMBER,
            ),
            column(
                'payments_monthly_payments_total_revenue',
                DimensionType.NUMBER,
            ),
            column('new_customers_customers_count', DimensionType.NUMBER),
        ];
        const { saved, expected, rebuilt } = roundTrip(
            artifact(
                [
                    withRegion(orders, 'orders_region'),
                    withRegion(payments, 'payments_region'),
                    withRegion(customers, 'customers_region'),
                    merge,
                ],
                'all_three',
                viz({
                    type: 'line',
                    x: 'merge_month',
                    y: ['new_customers_customers_count'],
                    groupBy: ['merge_region'],
                }),
            ),
            columns,
        );

        expect(saved.pivotConfig).toEqual({ columns: ['merge_region'] });
        expect(Object.keys(saved.merge.queries)).toEqual([
            'payments_monthly',
            'new_customers',
        ]);
        expect(rebuilt.sources.map(({ id }) => id)).toEqual([
            'orders_monthly',
            'payments_monthly',
            'new_customers',
        ]);
        expect(rebuilt.joinKey).toEqual(expected.joinKey);
        expect(rebuilt.joinType).toBe(MergeJoinType.LEFT);
        expect(rebuilt.sorts).toEqual(expected.sorts);
        expect(rebuilt.limit).toBe(expected.limit);
    });

    it('saves a table when the version presents the merge as a table', () => {
        const saved = getComposerMergeSavedChart({
            config: artifact(
                [orders, payments, twoSourceMerge],
                'orders_vs_payments',
                null,
            ),
            columns: twoSourceColumns,
            metadata,
        });
        expect(saved?.chartConfig).toEqual({
            type: ChartType.TABLE,
            config: {},
        });
        expect(saved?.pivotConfig).toBeUndefined();
    });

    it.each([
        [
            'the terminal node is not a merge',
            artifact(
                [orders, payments, twoSourceMerge],
                'orders_monthly',
                null,
            ),
        ],
        [
            'a source is not a semanticLayer node',
            artifact(
                [
                    orders,
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'payments_monthly',
                        sql: 'select 1',
                    } as SourceQuery,
                    twoSourceMerge,
                ],
                'orders_vs_payments',
                null,
            ),
        ],
        [
            'a node id is not a saved merge name',
            artifact(
                [
                    orders,
                    { ...payments, nodeId: '2payments' },
                    {
                        ...twoSourceMerge,
                        sources: [
                            { nodeId: 'orders_monthly' },
                            { nodeId: '2payments' },
                        ],
                        joinKey: [
                            {
                                name: 'month',
                                fieldIdBySourceId: {
                                    orders_monthly: 'orders_order_date_month',
                                    '2payments': 'payments_payment_month',
                                },
                            },
                        ],
                    },
                ],
                'orders_vs_payments',
                null,
            ),
        ],
        [
            'the chart is a custom chart type',
            artifact([orders, payments, twoSourceMerge], 'orders_vs_payments', {
                type: 'custom',
                customChartTypeSlug: 'ribbon',
                fieldMapping: { x: 'merge_month' },
                options: null,
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: null,
            }),
        ],
    ])('is null when %s', (_, config) => {
        expect(
            getComposerMergeSavedChart({
                config,
                columns: twoSourceColumns,
                metadata,
            }),
        ).toBeNull();
    });

    it('is null for a schema v1 version', () => {
        expect(
            getComposerMergeSavedChart({
                config: {
                    source: 'composer',
                    schemaVersion: 1,
                    queries: [orders, payments, twoSourceMerge],
                    terminalNodeId: 'orders_vs_payments',
                    vizConfig: null,
                },
                columns: twoSourceColumns,
                metadata,
            }),
        ).toBeNull();
    });

    it('is null when sources ran under different parameters, since a saved merge shares one map', () => {
        const config: AiComposerChartArtifactConfigV2 = {
            source: 'composer',
            schemaVersion: 2,
            queries: [
                orders,
                { ...payments, parameters: undefined },
                twoSourceMerge,
            ],
            terminalNodeId: 'orders_vs_payments',
            vizConfig: null,
        };
        expect(
            getComposerMergeSavedChart({
                config,
                columns: twoSourceColumns,
                metadata,
            }),
        ).toBeNull();
    });
});
