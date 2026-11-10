import {
    QuerySourceType,
    type DataAppManifestQuery,
    type DataAppQueryManifest,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import type { QueryEvent } from '../hooks/useAppSdkBridge';
import { toDataAppPipelines } from './dataAppPipelines';
import { toDeclaredPipeline, withDeclaredQueries } from './declaredPipelines';

const trend: DataAppManifestQuery = {
    kind: 'semantic',
    id: 'revenue-trend',
    title: 'Revenue trend',
    description: null,
    explore: 'orders',
    dimensions: [{ template: 'order_date_${grain}' }],
    metrics: ['total_revenue', 'customers.count'],
    filters: [
        { slot: 'globalFilters:orders' },
        { field: 'status', operator: 'equals', value: 'completed' },
    ],
    metricFilters: [],
    sorts: [{ field: { template: 'order_date_${grain}' }, direction: 'desc' }],
    limit: 200,
    parameters: {},
    loc: 'src/Trend.tsx:12',
    bucket: 'parametric',
    slots: [
        { name: 'grain', kind: 'local', explore: null, default: 'month' },
        {
            name: 'globalFilters:orders',
            kind: 'globalFilter',
            explore: 'orders',
            default: [],
        },
    ],
};

const pipeline: DataAppManifestQuery = {
    kind: 'composer',
    id: 'ranked',
    title: 'Ranked',
    description: null,
    parameters: {},
    nodes: [
        {
            kind: 'semantic',
            nodeId: 'chart',
            title: 'Saved',
            description: null,
            query: {
                kind: 'savedChart',
                id: null,
                title: null,
                description: null,
                chartUuid: 'chart-uuid',
                limit: null,
                filters: [],
                parameters: {},
            },
        },
        {
            kind: 'duckdb',
            nodeId: 'top',
            title: 'Top 10',
            description: null,
            sql: 'select * from chart limit 10',
            reads: ['chart'],
            limit: null,
        },
    ],
    terminal: 'top',
    loc: 'src/Ranked.tsx:4',
    bucket: 'static',
    slots: [],
};

const manifest: DataAppQueryManifest = {
    version: 1,
    queries: [trend, pipeline],
    bindings: [],
    error: null,
};

const ran: QueryEvent = {
    id: 'r1',
    timestamp: 5,
    label: 'Revenue trend',
    queryId: 'revenue-trend',
    description: null,
    chartUuid: null,
    exploreName: 'orders',
    dimensions: ['orders_order_date_week'],
    metrics: ['orders_total_revenue'],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 200,
    queryUuid: 'q-1',
    status: 'ready',
    rowCount: 4,
    durationMs: 12,
    error: null,
    rawMetricQuery: null,
};

describe('toDeclaredPipeline', () => {
    it('shows a parametric query at its slot defaults with qualified fields', () => {
        const declared = toDeclaredPipeline(trend);
        expect(declared).toMatchObject({
            id: 'declared:src/Trend.tsx:12',
            kind: 'query',
            queryId: 'revenue-trend',
            hasRun: false,
            nodeQueryUuids: {},
        });
        expect(declared?.queries).toEqual([
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'query',
                title: 'Revenue trend',
                description: undefined,
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_revenue', 'customers_count'],
                filters: {
                    dimensions: {
                        id: 'declared',
                        and: [
                            {
                                id: 'declared-0',
                                target: { fieldId: 'orders_status' },
                                operator: 'equals',
                                values: ['completed'],
                            },
                        ],
                    },
                },
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: true },
                ],
                limit: 200,
            },
        ]);
    });

    it('keeps pipeline nodes, reads and saved-chart sources', () => {
        const declared = toDeclaredPipeline(pipeline);
        expect(declared).toMatchObject({
            kind: 'composer',
            terminalNodeId: 'top',
            savedChartNodeIds: ['chart'],
        });
        expect(declared?.queries[1]).toMatchObject({
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'top',
            sql: 'select * from chart limit 10',
            references: ['chart'],
        });
    });
});

describe('withDeclaredQueries', () => {
    it('lists declared queries before they run and annotates them once they do', () => {
        const before = withDeclaredQueries([], manifest);
        expect(before.map((p) => [p.queryId, p.hasRun])).toEqual([
            ['revenue-trend', false],
            ['ranked', false],
        ]);

        const after = withDeclaredQueries(
            toDataAppPipelines([ran], []),
            manifest,
        );
        expect(after.map((p) => [p.id, p.hasRun])).toEqual([
            ['declared:src/Ranked.tsx:4', false],
            ['r1', true],
        ]);
        expect(after[1].declared).toBe(trend);
    });

    it('is a no-op without a manifest', () => {
        const pipelines = toDataAppPipelines([ran], []);
        expect(withDeclaredQueries(pipelines, null)).toBe(pipelines);
    });
});
