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
    references: string[],
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
                nodeId: 'orders',
                title: 'Orders by status',
                sourceLabel: 'Warehouse SQL',
                isTerminal: false,
            },
            {
                nodeId: 'joined',
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
    });
});
