import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { groupPipeline, nodeTypeLabelOf } from './groupPipeline';

const sql = (nodeId: string, title?: string): SourceQuery => ({
    sourceType: QuerySourceType.SQL,
    nodeId,
    title,
    sql: `select 1 as ${nodeId}`,
});

const duckdb = (
    nodeId: string,
    references: string[] | Record<string, string>,
    title?: string,
): SourceQuery => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId,
    title,
    sql: 'select 1',
    references,
});

const python = (
    nodeId: string,
    references: string[] | Record<string, string>,
    title?: string,
): SourceQuery => ({
    sourceType: QuerySourceType.PYTHON,
    nodeId,
    title,
    code: 'def run(inputs, params):\n    return inputs["a"]',
    references,
});

const ids = (nodes: { nodeId: string }[]) => nodes.map((node) => node.nodeId);

describe('groupPipeline', () => {
    it('places a fan-in join after everything it reads', () => {
        const layers = groupPipeline(
            [
                sql('a'),
                sql('b'),
                sql('c'),
                duckdb('ab', ['a', 'b']),
                duckdb('final', ['ab', 'c']),
            ],
            'final',
        );
        expect(layers.map((layer) => [layer.kind, ids(layer.nodes)])).toEqual([
            ['sources', ['a', 'b', 'c']],
            ['transformations', ['ab']],
            ['result', ['final']],
        ]);
        expect(layers[2].nodes[0].isTerminal).toBe(true);
    });

    it('resolves reads to titles, keeps unknown array references and falls back to node ids', () => {
        const layers = groupPipeline(
            [
                sql('orders', 'Orders by status'),
                sql('amounts'),
                duckdb('joined', ['orders', 'amounts', 'query-uuid-1']),
            ],
            'joined',
        );
        const joined = layers[1].nodes[0];
        expect(joined.title).toBe('joined');
        expect(joined.reads).toEqual([
            'Orders by status',
            'amounts',
            'query-uuid-1',
        ]);
        expect(joined.readNodeIds).toEqual(['orders', 'amounts']);
        expect(layers[0].nodes.map((node) => node.title)).toEqual([
            'Orders by status',
            'amounts',
        ]);
    });

    it('labels a single-layer pipeline as the result', () => {
        const [only, ...rest] = groupPipeline([sql('a')], 'a');
        expect(rest).toEqual([]);
        expect(only.kind).toBe('result');
        expect(only.nodes[0]).toMatchObject({
            nodeId: 'a',
            isTerminal: true,
            reads: [],
            readNodeIds: [],
            description: null,
        });
    });

    it('puts only the terminal in the result layer of a multi-sink pipeline', () => {
        const layers = groupPipeline(
            [sql('a'), duckdb('x', ['a']), duckdb('y', ['a'])],
            'x',
        );
        expect(layers.map((layer) => [layer.kind, ids(layer.nodes)])).toEqual([
            ['sources', ['a']],
            ['transformations', ['y']],
            ['result', ['x']],
        ]);
        expect(layers[2].nodes[0].isTerminal).toBe(true);
    });

    it('keeps the terminal last even when a deeper node reads it', () => {
        const layers = groupPipeline(
            [sql('a'), duckdb('x', ['a']), duckdb('y', ['x'])],
            'x',
        );
        expect(layers.map((layer) => [layer.kind, ids(layer.nodes)])).toEqual([
            ['sources', ['a']],
            ['transformations', ['y']],
            ['result', ['x']],
        ]);
        expect(
            layers.flatMap((layer) =>
                layer.nodes.map((node) => [node.nodeId, node.depth]),
            ),
        ).toEqual([
            ['a', 0],
            ['y', 2],
            ['x', 1],
        ]);
    });

    it('assigns ids to unnamed nodes and survives a reference cycle', () => {
        const layers = groupPipeline(
            [
                { sourceType: QuerySourceType.SQL, sql: 'select 1' },
                duckdb('loop_a', ['loop_b']),
                duckdb('loop_b', ['loop_a']),
            ],
            'loop_b',
        );
        expect(ids(layers[0].nodes)).toContain('query_1');
        expect(layers.flatMap((layer) => ids(layer.nodes)).sort()).toEqual([
            'loop_a',
            'loop_b',
            'query_1',
        ]);
    });

    it('layers python nodes as transformations that duckdb nodes can read', () => {
        const layers = groupPipeline(
            [
                sql('orders', 'Orders'),
                python('simulated', ['orders'], 'Simulated amounts'),
                duckdb('summary', { sims: 'simulated' }, 'Summary'),
            ],
            'summary',
        );
        expect(layers.map((layer) => [layer.kind, ids(layer.nodes)])).toEqual([
            ['sources', ['orders']],
            ['transformations', ['simulated']],
            ['result', ['summary']],
        ]);
        expect(layers[1].nodes[0]).toMatchObject({
            reads: ['Orders'],
            readNodeIds: ['orders'],
        });
        expect(layers[2].nodes[0]).toMatchObject({
            reads: ['Simulated amounts'],
            readNodeIds: ['simulated'],
        });
    });
});

describe('nodeTypeLabelOf', () => {
    it('labels sources and python nodes, not duckdb transformations', () => {
        expect(nodeTypeLabelOf(sql('a'))).toBe('Warehouse SQL');
        expect(nodeTypeLabelOf(python('p', ['a']))).toBe('Python');
        expect(nodeTypeLabelOf(duckdb('d', ['a']))).toBeNull();
    });
});
