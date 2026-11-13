import {
    parseComposerPipeline,
    parseComposerStoredChart,
} from '../../composer/composerChart';
import { DimensionType, FieldType } from '../../types/field';
import { MergeJoinType } from '../../types/mergeQuery';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import { ChartType } from '../../types/savedCharts';
import { type AiComposerChartArtifactConfigV2 } from './composerArtifact';
import {
    getComposerChartSaveDraft,
    savesAsComposerChart,
} from './composerChartSave';
import {
    composerChartVizConfigSchemaPersisted,
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
} from './schemas/tools/composerChartVizConfigSchema';

const orders: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
};
const unrelated: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'unrelated',
    title: 'Something the thread tried',
    sql: 'SELECT 1 AS one',
};
const byStatus: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'by_status',
    title: 'Revenue by status',
    sql: 'SELECT orders_status AS status, orders_order_date_month AS month, orders_total_order_amount AS revenue FROM orders',
    references: ['orders'],
};

const columns: ResultColumn[] = [
    { reference: 'status', type: DimensionType.STRING },
    { reference: 'month', type: DimensionType.DATE },
    { reference: 'revenue', type: DimensionType.NUMBER },
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

const answer = (
    vizConfig: ComposerStoredChartVizConfig | null,
    queries: SourceQuery[] = [orders, unrelated, byStatus],
    terminalNodeId = 'by_status',
): AiComposerChartArtifactConfigV2 => ({
    source: 'composer',
    schemaVersion: 2,
    queries,
    terminalNodeId,
    vizConfig,
});

const metadata = { title: 'Revenue by status', description: '' };

const ready = (draft: ReturnType<typeof getComposerChartSaveDraft>) => {
    if (draft.status !== 'ready') throw new Error(draft.reason);
    return draft;
};

describe('getComposerChartSaveDraft', () => {
    test('saves the presented node and what it reads, dropping the thread’s other nodes', () => {
        const { pipeline } = ready(
            getComposerChartSaveDraft({
                config: answer(
                    viz({ type: 'bar', x: 'status', y: ['revenue'] }),
                ),
                columns,
                metadata,
            }),
        );

        expect(parseComposerPipeline(pipeline)).toEqual({
            schemaVersion: 1,
            terminalNodeId: 'by_status',
            nodes: [orders, byStatus],
        });
    });

    test('stores the chart over column names, x a dimension and y a metric', () => {
        const { chart } = ready(
            getComposerChartSaveDraft({
                config: answer(
                    viz({ type: 'bar', x: 'status', y: ['revenue'] }),
                ),
                columns,
                metadata,
            }),
        );

        const parsed = parseComposerStoredChart(chart);
        expect(parsed.columns).toEqual([
            { reference: 'status', fieldType: FieldType.DIMENSION },
            { reference: 'revenue', fieldType: FieldType.METRIC },
        ]);
        expect(parsed.chartConfig).toMatchObject({
            type: ChartType.CARTESIAN,
            config: { layout: { xField: 'status', yField: ['revenue'] } },
        });
        expect(parsed.pivotConfig).toBeNull();
        expect(parsed.tableConfig).toEqual({
            columnOrder: ['status', 'revenue'],
        });
    });

    test('a series split is a dimension and pivots', () => {
        const { chart } = ready(
            getComposerChartSaveDraft({
                config: answer(
                    viz({
                        type: 'bar',
                        x: 'month',
                        y: ['revenue'],
                        groupBy: ['status'],
                    }),
                ),
                columns,
                metadata,
            }),
        );

        const parsed = parseComposerStoredChart(chart);
        expect(parsed.columns).toEqual([
            { reference: 'month', fieldType: FieldType.DIMENSION },
            { reference: 'status', fieldType: FieldType.DIMENSION },
            { reference: 'revenue', fieldType: FieldType.METRIC },
        ]);
        expect(parsed.pivotConfig).toEqual({ columns: ['status'] });
    });

    test('a table, or no viz config, keeps every column with numbers as metrics', () => {
        const { chart } = ready(
            getComposerChartSaveDraft({
                config: answer(null),
                columns,
                metadata,
            }),
        );

        const parsed = parseComposerStoredChart(chart);
        expect(parsed.chartConfig.type).toBe(ChartType.TABLE);
        expect(parsed.columns).toEqual([
            { reference: 'status', fieldType: FieldType.DIMENSION },
            { reference: 'month', fieldType: FieldType.DIMENSION },
            { reference: 'revenue', fieldType: FieldType.METRIC },
        ]);
    });

    test('a dotted column keeps its name, so the server refusal names it', () => {
        const { chart } = ready(
            getComposerChartSaveDraft({
                config: answer(null),
                columns: [{ reference: 'a.b', type: DimensionType.STRING }],
                metadata,
            }),
        );

        expect(chart.columns).toEqual([
            { reference: 'a.b', fieldType: FieldType.DIMENSION },
        ]);
        expect(() => parseComposerStoredChart(chart)).toThrow(
            'Column "a.b" has a dot in its name',
        );
    });

    test.each([
        [
            'until the run has loaded its columns',
            answer(viz({ type: 'bar' })),
            [],
            'Waiting for the result to load',
        ],
        [
            'with a custom chart type',
            answer({
                type: 'custom',
                customChartTypeSlug: 'ribbon',
                fieldMapping: { x: 'status' },
                options: null,
                dataAppVizUuid: 'viz-uuid',
                dataAppVizVersion: 1,
            }),
            columns,
            'Answers with a custom chart type cannot be saved to a dashboard yet',
        ],
        [
            'when a node it reads cannot run on a dashboard',
            answer(viz({ type: 'table' }), [
                {
                    sourceType: QuerySourceType.EXTERNAL,
                    nodeId: 'orders',
                    title: 'Orders table',
                    sql: 'SELECT 1',
                    tables: [],
                },
                byStatus,
            ]),
            columns,
            'Step "Orders table" cannot run on a dashboard',
        ],
    ])('is unavailable %s', (_, config, resultColumns, reason) => {
        expect(
            getComposerChartSaveDraft({
                config,
                columns: resultColumns,
                metadata,
            }),
        ).toEqual({ status: 'unavailable', reason });
    });
});

describe('savesAsComposerChart', () => {
    const payments: SourceQuery = {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'payments',
        title: 'Payments',
        exploreName: 'payments',
        dimensions: ['payments_payment_month'],
        metrics: ['payments_total_revenue'],
    };
    const merge = (sourceNodeId: string): SourceQuery => ({
        sourceType: QuerySourceType.MERGE,
        nodeId: 'orders_vs_payments',
        title: 'Orders vs payments',
        sources: [{ nodeId: sourceNodeId }, { nodeId: 'payments' }],
        joinKey: [
            {
                name: 'month',
                fieldIdBySourceId: {
                    [sourceNodeId]: 'orders_order_date_month',
                    payments: 'payments_payment_month',
                },
            },
        ],
        joinType: MergeJoinType.FULL,
    });

    test('a merge that fits a merged chart keeps saving as one', () => {
        expect(
            savesAsComposerChart(
                answer(
                    null,
                    [orders, payments, merge('orders')],
                    'orders_vs_payments',
                ),
            ),
        ).toBe(false);
    });

    test('an older answer does not save', () => {
        expect(
            savesAsComposerChart({
                ...answer(null),
                schemaVersion: 1,
                vizConfig: null,
            }),
        ).toBe(false);
    });

    test.each([
        ['a transformation', answer(null)],
        [
            'a merge over a transformation',
            answer(
                null,
                [orders, byStatus, payments, merge('by_status')],
                'orders_vs_payments',
            ),
        ],
    ])('%s saves as a composer chart', (_, config) => {
        expect(savesAsComposerChart(config)).toBe(true);
    });
});
