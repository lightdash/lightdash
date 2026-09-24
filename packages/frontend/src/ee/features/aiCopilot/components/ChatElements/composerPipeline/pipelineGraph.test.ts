import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { groupPipeline } from './groupPipeline';
import {
    layoutPipelineFlow,
    toPipelineFlow,
    type PipelineFlowNode,
} from './pipelineGraph';

const sql = (nodeId: string, title: string): SourceQuery => ({
    sourceType: QuerySourceType.SQL,
    nodeId,
    title,
    sql: 'select 1',
});

const duckdb = (
    nodeId: string,
    title: string,
    references: string[] | Record<string, string>,
): SourceQuery => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId,
    title,
    sql: 'select 1',
    references,
});

const measured = (nodes: PipelineFlowNode[]) =>
    nodes.map((node) => ({ ...node, measured: { width: 160, height: 40 } }));

const xOf = (nodes: PipelineFlowNode[], id: string) =>
    nodes.find((node) => node.id === id)!.position.x;

describe('toPipelineFlow', () => {
    it('makes one node per pipeline node with source and terminal flags', () => {
        const { nodes } = toPipelineFlow(
            groupPipeline(
                [
                    sql('orders', 'Orders by status'),
                    duckdb('joined', 'Orders with amounts', ['orders']),
                ],
                'joined',
            ),
        );
        expect(nodes.map((node) => node.data)).toEqual([
            {
                title: 'Orders by status',
                sourceLabel: 'Warehouse SQL',
                isTerminal: false,
            },
            {
                title: 'Orders with amounts',
                sourceLabel: null,
                isTerminal: true,
            },
        ]);
    });

    it('makes one edge per read, from the read node to the reader', () => {
        const { edges } = toPipelineFlow(
            groupPipeline(
                [
                    sql('a', 'A'),
                    sql('b', 'B'),
                    duckdb('ab', 'AB', ['a', 'b']),
                    duckdb('final', 'Final', ['ab', 'missing']),
                ],
                'final',
            ),
        );
        expect(edges.map((edge) => [edge.source, edge.target])).toEqual([
            ['a', 'ab'],
            ['b', 'ab'],
            ['ab', 'final'],
        ]);
    });

    it('draws an earlier result placeholder with an edge to its reader', () => {
        const { nodes, edges } = toPipelineFlow(
            groupPipeline(
                [duckdb('final', 'Final', { prev: 'uuid-1' })],
                'final',
            ),
        );
        expect(nodes.map((node) => [node.id, node.data])).toEqual([
            [
                'earlier:uuid-1',
                {
                    title: 'prev',
                    sourceLabel: 'Earlier result',
                    isTerminal: false,
                },
            ],
            ['final', { title: 'Final', sourceLabel: null, isTerminal: true }],
        ]);
        expect(edges.map((edge) => [edge.source, edge.target])).toEqual([
            ['earlier:uuid-1', 'final'],
        ]);
        const laidOut = layoutPipelineFlow(measured(nodes), edges);
        expect(xOf(laidOut, 'earlier:uuid-1')).toBeLessThan(
            xOf(laidOut, 'final'),
        );
    });

    it('returns empty arrays for an empty pipeline', () => {
        expect(toPipelineFlow([])).toEqual({ nodes: [], edges: [] });
        expect(layoutPipelineFlow([], [])).toEqual([]);
    });
});

describe('layoutPipelineFlow', () => {
    it('flows left to right, reads before readers', () => {
        const { nodes, edges } = toPipelineFlow(
            groupPipeline(
                [
                    sql('a', 'A'),
                    duckdb('ab', 'AB', ['a']),
                    duckdb('final', 'Final', ['ab']),
                ],
                'final',
            ),
        );
        const laidOut = layoutPipelineFlow(measured(nodes), edges);
        expect(xOf(laidOut, 'a')).toBeLessThan(xOf(laidOut, 'ab'));
        expect(xOf(laidOut, 'ab')).toBeLessThan(xOf(laidOut, 'final'));
        expect(laidOut.every((node) => Number.isFinite(node.position.y))).toBe(
            true,
        );
    });

    it('puts the terminal furthest right in a multi-sink pipeline', () => {
        const { nodes, edges } = toPipelineFlow(
            groupPipeline(
                [
                    sql('a', 'A'),
                    duckdb('x', 'X', ['a']),
                    duckdb('y', 'Y', ['x']),
                    duckdb('z', 'Z', ['a']),
                ],
                'x',
            ),
        );
        const laidOut = layoutPipelineFlow(measured(nodes), edges);
        const terminalX = xOf(laidOut, 'x');
        ['a', 'y', 'z'].forEach((id) =>
            expect(xOf(laidOut, id)).toBeLessThan(terminalX),
        );
        // y reads the terminal, so it sits just before it rather than at rank 0
        expect(xOf(laidOut, 'y')).toBeGreaterThan(xOf(laidOut, 'a'));
    });
});
