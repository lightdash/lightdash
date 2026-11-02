import { QuerySourceType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import type { PipelineEvent, QueryEvent } from '../hooks/useAppSdkBridge';
import {
    findPipelineForSelection,
    highlightOf,
    toDataAppPipelines,
} from './dataAppPipelines';

const queryEvent = (overrides: Partial<QueryEvent>): QueryEvent => ({
    id: 'r1',
    timestamp: 1,
    label: null,
    queryId: null,
    description: null,
    chartUuid: null,
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 500,
    queryUuid: 'q-1',
    status: 'ready',
    rowCount: 4,
    durationMs: 12,
    error: null,
    rawMetricQuery: null,
    ...overrides,
});

const CHART_QUERY_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const pipelineEvent: PipelineEvent = {
    id: 'p1',
    timestamp: 3,
    queryId: 'revenue',
    label: 'Revenue',
    description: null,
    terminalNodeId: 'joined',
    queries: [
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'joined',
            sql: 'SELECT * FROM c',
            references: { c: CHART_QUERY_UUID },
        },
    ],
    savedChartNodes: [
        {
            nodeId: 'chart',
            chartUuid: 'chart-uuid',
            queryUuid: CHART_QUERY_UUID,
            title: 'Sales chart',
            description: null,
        },
    ],
    nodeQueryUuids: { chart: CHART_QUERY_UUID, joined: 'q-joined' },
    status: 'ready',
    error: null,
    durationMs: 40,
};

describe('toDataAppPipelines', () => {
    it('turns a plain query into a one-node semantic layer pipeline', () => {
        const [pipeline] = toDataAppPipelines(
            [
                queryEvent({
                    queryId: 'orders-by-status',
                    description: 'Orders per status',
                }),
            ],
            [],
        );
        expect(pipeline).toMatchObject({
            kind: 'query',
            title: 'orders-by-status',
            description: 'Orders per status',
            terminalNodeId: 'query',
            nodeQueryUuids: { query: 'q-1' },
            savedChartNodeIds: [],
            rowCount: 4,
        });
        expect(pipeline.queries).toEqual([
            expect.objectContaining({
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'query',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_count'],
                limit: 500,
            }),
        ]);
    });

    it('titles by label, then author id, then explore; skips blank rows', () => {
        const pipelines = toDataAppPipelines(
            [
                queryEvent({ id: 'a', label: 'Revenue', queryId: 'rev' }),
                queryEvent({ id: 'b', exploreName: 'customer_orders' }),
                queryEvent({ id: 'c', exploreName: '', queryUuid: null }),
            ],
            [],
        );
        expect(pipelines.map((p) => p.title)).toEqual([
            'Revenue',
            'Customer orders',
        ]);
    });

    it('keeps only the latest run per author id', () => {
        const pipelines = toDataAppPipelines(
            [
                queryEvent({ id: 'a', timestamp: 1, queryId: 'rev' }),
                queryEvent({ id: 'b', timestamp: 2, queryId: 'rev' }),
                queryEvent({ id: 'c', timestamp: 3 }),
                queryEvent({ id: 'd', timestamp: 4 }),
            ],
            [
                { ...pipelineEvent, id: 'p-old', timestamp: 5 },
                { ...pipelineEvent, id: 'p-new', timestamp: 6 },
            ],
        );
        expect(pipelines.map((p) => p.id)).toEqual(['b', 'c', 'd', 'p-new']);
    });

    it('folds saved-chart sources into the pipeline as nodes', () => {
        const chartRun = queryEvent({
            id: 'chart-run',
            timestamp: 2,
            queryUuid: CHART_QUERY_UUID,
            chartUuid: 'chart-uuid',
        });
        const pipelines = toDataAppPipelines([chartRun], [pipelineEvent]);
        const composer = pipelines.find((p) => p.kind === 'composer')!;
        expect(pipelines.map((p) => p.id)).toEqual(['p1']);
        expect(composer.savedChartNodeIds).toEqual(['chart']);
        expect(composer.queries).toEqual([
            expect.objectContaining({
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'chart',
                title: 'Sales chart',
                exploreName: 'orders',
            }),
            expect.objectContaining({
                nodeId: 'joined',
                references: { c: 'chart' },
            }),
        ]);
    });
});

describe('lineage selection and highlight', () => {
    const pipelines = toDataAppPipelines(
        [
            queryEvent({ id: 'old', timestamp: 1, queryId: 'revenue' }),
            queryEvent({
                id: 'chart',
                timestamp: 2,
                queryUuid: CHART_QUERY_UUID,
            }),
        ],
        [pipelineEvent],
    );

    it('matches the newest pipeline by author id before queryUuid', () => {
        expect(
            findPipelineForSelection(pipelines, {
                queryUuid: CHART_QUERY_UUID,
                queryId: 'revenue',
            })?.id,
        ).toBe('p1');
        expect(
            findPipelineForSelection(pipelines, {
                queryUuid: CHART_QUERY_UUID,
                queryId: null,
            })?.id,
        ).toBe('p1');
        expect(
            findPipelineForSelection(pipelines, {
                queryUuid: 'q-joined',
                queryId: null,
            })?.id,
        ).toBe('p1');
        expect(
            findPipelineForSelection(pipelines, {
                queryUuid: 'unknown',
                queryId: null,
            }),
        ).toBe(null);
    });

    it('highlights the terminal with the author id, inner nodes by uuid only', () => {
        const composer = pipelines.find((p) => p.id === 'p1')!;
        expect(highlightOf(composer, null, { scroll: true })).toEqual({
            queryUuid: 'q-joined',
            queryId: 'revenue',
            scroll: true,
        });
        expect(highlightOf(composer, 'chart', { scroll: false })).toEqual({
            queryUuid: CHART_QUERY_UUID,
            queryId: null,
            scroll: false,
        });
    });
});
