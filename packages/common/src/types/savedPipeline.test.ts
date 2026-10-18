import { describe, expect, it } from 'vitest';
import { DimensionType, FieldType } from './field';
import { QuerySourceType, type SourceQuery } from './querySources';
import {
    buildSavedPipelineExplore,
    buildSavedPipelineVizNode,
    getSavedPipelineFieldIds,
    parseSavedPipelineDefinition,
    PIPELINE_VIZ_NODE_ID,
    pipelineHasWarehouseSql,
    type SavedPipelineDefinition,
} from './savedPipeline';

const queries: SourceQuery[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'orders',
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total'],
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'ranked',
        sql: 'SELECT orders_status AS status, orders_total AS total FROM orders',
        references: ['orders'],
    },
];

const pipeline: SavedPipelineDefinition = {
    queries,
    terminalNodeId: 'ranked',
    columns: {
        status: { reference: 'status', type: DimensionType.STRING },
        total: {
            reference: 'total',
            type: DimensionType.NUMBER,
            provenance: {
                fieldId: 'orders_total',
                fieldType: FieldType.METRIC,
            },
        },
    },
};

describe('parseSavedPipelineDefinition', () => {
    it('accepts a self-contained pipeline', () => {
        expect(parseSavedPipelineDefinition(pipeline)).toEqual(pipeline);
    });

    it('rejects a terminal node that is not in the pipeline', () => {
        expect(
            parseSavedPipelineDefinition({
                ...pipeline,
                terminalNodeId: 'missing',
            }),
        ).toBeNull();
    });

    it('rejects a node that reads outside the pipeline', () => {
        expect(
            parseSavedPipelineDefinition({
                ...pipeline,
                queries: [
                    queries[0],
                    { ...queries[1], references: ['elsewhere'] },
                ],
            }),
        ).toBeNull();
    });

    it('rejects a node without an id, a duplicate id and the run node id', () => {
        expect(
            parseSavedPipelineDefinition({
                ...pipeline,
                queries: [{ ...queries[0], nodeId: undefined }, queries[1]],
            }),
        ).toBeNull();
        expect(
            parseSavedPipelineDefinition({
                ...pipeline,
                queries: [queries[0], { ...queries[1], nodeId: 'orders' }],
            }),
        ).toBeNull();
        expect(
            parseSavedPipelineDefinition({
                ...pipeline,
                terminalNodeId: PIPELINE_VIZ_NODE_ID,
                queries: [
                    queries[0],
                    { ...queries[1], nodeId: PIPELINE_VIZ_NODE_ID },
                ],
            }),
        ).toBeNull();
    });

    it('rejects columns that do not describe themselves', () => {
        expect(
            parseSavedPipelineDefinition({
                ...pipeline,
                columns: { status: { reference: 'other', type: 'string' } },
            }),
        ).toBeNull();
        expect(parseSavedPipelineDefinition(null)).toBeNull();
        expect(parseSavedPipelineDefinition({ queries: [] })).toBeNull();
    });
});

describe('buildSavedPipelineExplore', () => {
    it('builds a one table explore whose fields are the terminal columns', () => {
        const explore = buildSavedPipelineExplore(pipeline);
        expect(explore.name).toBe('ranked');
        expect(explore.baseTable).toBe('ranked');
        expect(Object.keys(explore.tables)).toEqual(['ranked']);
        expect(Object.keys(explore.tables.ranked.dimensions)).toEqual([
            'status',
        ]);
        expect(Object.keys(explore.tables.ranked.metrics)).toEqual(['total']);
        expect(explore.tables.ranked.metrics.total.table).toBe('ranked');
    });
});

describe('buildSavedPipelineVizNode', () => {
    it('selects every terminal column under its field id', () => {
        const node = buildSavedPipelineVizNode({ pipeline });
        expect(node.nodeId).toBe(PIPELINE_VIZ_NODE_ID);
        expect(node.references).toEqual(['ranked']);
        expect(node.sql).toBe(
            'SELECT "status" AS "ranked_status", "total" AS "ranked_total" FROM "ranked"',
        );
        expect(node.pivotConfiguration).toBeUndefined();
    });

    it('carries the pivot to the node', () => {
        const pivotConfiguration = {
            indexColumn: [{ reference: 'ranked_status', type: 'category' }],
            valuesColumns: [{ reference: 'ranked_total', aggregation: 'sum' }],
            groupByColumns: undefined,
            sortBy: undefined,
        } as const;
        expect(
            buildSavedPipelineVizNode({
                pipeline,
                pivotConfiguration:
                    pivotConfiguration as unknown as NonNullable<
                        Parameters<
                            typeof buildSavedPipelineVizNode
                        >[0]['pivotConfiguration']
                    >,
            }).pivotConfiguration,
        ).toEqual(pivotConfiguration);
    });
});

describe('pipeline helpers', () => {
    it('lists field ids in column order', () => {
        expect(getSavedPipelineFieldIds(pipeline)).toEqual([
            'ranked_status',
            'ranked_total',
        ]);
    });

    it('knows when a pipeline runs warehouse SQL', () => {
        expect(pipelineHasWarehouseSql(pipeline)).toBe(false);
        expect(
            pipelineHasWarehouseSql({
                queries: [
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'raw',
                        sql: 'select 1',
                    },
                ],
            }),
        ).toBe(true);
    });
});
