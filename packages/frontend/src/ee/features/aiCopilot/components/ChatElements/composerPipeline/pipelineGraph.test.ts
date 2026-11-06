import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { groupPipeline } from './groupPipeline';
import {
    getFittedGraphShare,
    getPipelineFlowHeight,
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

const noDisplay = {
    focusedNodeId: null,
    notebookLineage: null,
    nodeStatuses: {},
};

const xOf = (nodes: PipelineFlowNode[], id: string) =>
    nodes.find((node) => node.id === id)!.position.x;

describe('toPipelineFlow', () => {
    it('labels python nodes and draws edges into and out of them', () => {
        const { nodes, edges } = toPipelineFlow(
            groupPipeline(
                [
                    sql('orders', 'Orders by status'),
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'sim',
                        title: 'Simulation',
                        code: 'def run(inputs, params):\n    return inputs["orders"]',
                        references: ['orders'],
                    },
                    duckdb('summary', 'Summary', ['sim']),
                ],
                'summary',
            ),
            noDisplay,
        );
        expect(nodes.map((node) => [node.id, node.data.typeLabel])).toEqual([
            ['orders', 'Warehouse SQL'],
            ['sim', 'Python'],
            ['summary', 'DuckDB'],
        ]);
        expect(edges.map((edge) => edge.id)).toEqual([
            'orders->sim',
            'sim->summary',
        ]);
    });

    it('makes one node per pipeline node with source and terminal flags', () => {
        const { nodes } = toPipelineFlow(
            groupPipeline(
                [
                    sql('orders', 'Orders by status'),
                    duckdb('joined', 'Orders with amounts', ['orders']),
                ],
                'joined',
            ),
            noDisplay,
        );
        expect(nodes.map((node) => node.data)).toEqual([
            expect.objectContaining({
                title: 'Orders by status',
                typeLabel: 'Warehouse SQL',
                isTerminal: false,
                status: null,
            }),
            expect.objectContaining({
                title: 'Orders with amounts',
                typeLabel: 'DuckDB',
                isTerminal: true,
                status: null,
            }),
        ]);
    });

    it('carries each node status', () => {
        const { nodes } = toPipelineFlow(
            groupPipeline(
                [
                    sql('orders', 'Orders by status'),
                    duckdb('joined', 'Orders with amounts', ['orders']),
                ],
                'joined',
            ),
            {
                ...noDisplay,
                nodeStatuses: {
                    orders: {
                        status: 'success',
                        error: null,
                        totalRowCount: 20,
                        durationMs: null,
                    },
                },
            },
        );
        expect(
            nodes.map(({ id, data }) => [
                id,
                data.status?.totalRowCount ?? null,
            ]),
        ).toEqual([
            ['orders', 20],
            ['joined', null],
        ]);
    });

    it('keeps the focused node and its whole lineage undimmed', () => {
        const layers = groupPipeline(
            [
                sql('revenue', 'Revenue by payment method'),
                duckdb('quarterly', 'Quarterly revenue', ['revenue']),
                sql('customers', 'Customer first orders'),
                sql('unrelated', 'Unrelated'),
                duckdb('final', 'Revenue per new customer', [
                    'quarterly',
                    'customers',
                ]),
            ],
            'final',
        );
        const dimmed = (focusedNodeId: string) =>
            toPipelineFlow(layers, { ...noDisplay, focusedNodeId })
                .nodes.filter((node) => node.data.isDimmed)
                .map((node) => node.id);

        expect(dimmed('final')).toEqual(['unrelated']);
        expect(dimmed('revenue')).toEqual(['customers', 'unrelated']);
    });

    it("marks the notebook's lineage, its edges, and keeps it undimmed", () => {
        const layers = groupPipeline(
            [
                sql('a', 'A'),
                duckdb('b', 'B', ['a']),
                duckdb('final', 'Final', ['a', 'b']),
                sql('other', 'Other'),
            ],
            'final',
        );
        const { nodes, edges } = toPipelineFlow(layers, {
            ...noDisplay,
            focusedNodeId: 'other',
            notebookLineage: {
                nodeId: 'b',
                relatedIds: new Set(['a', 'final']),
            },
        });
        expect(
            nodes.map(({ id, data }) => [id, data.lineageRole, data.isDimmed]),
        ).toEqual([
            ['a', 'related', false],
            ['other', null, false],
            ['b', 'hovered', false],
            ['final', 'related', false],
        ]);
        // a->final joins two related nodes but not the hovered one.
        expect(
            edges.filter((edge) => edge.className).map((edge) => edge.id),
        ).toEqual(['a->b', 'b->final']);
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
            noDisplay,
        );
        expect(edges.map((edge) => [edge.source, edge.target])).toEqual([
            ['a', 'ab'],
            ['b', 'ab'],
            ['ab', 'final'],
        ]);
    });

    it('returns empty arrays for an empty pipeline', () => {
        expect(toPipelineFlow([], noDisplay)).toEqual({ nodes: [], edges: [] });
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
            noDisplay,
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
            noDisplay,
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

describe('graph pane fit', () => {
    const bounds = { min: 15, max: 35 };

    it('measures the laid-out nodes from top to bottom', () => {
        const { nodes } = toPipelineFlow(
            groupPipeline(
                [sql('a', 'A'), duckdb('final', 'Final', ['a'])],
                'final',
            ),
            noDisplay,
        );
        const [a, final] = measured(nodes);
        expect(
            getPipelineFlowHeight([
                { ...a, position: { x: 0, y: 10 } },
                { ...final, position: { x: 200, y: 60 } },
            ]),
        ).toBe(90);
    });

    it('sizes a short pipeline to its content, a tall one to the cap', () => {
        expect(getFittedGraphShare(100, 1000, bounds)).toBe(18);
        expect(getFittedGraphShare(600, 1000, bounds)).toBe(35);
        expect(getFittedGraphShare(10, 1000, bounds)).toBe(15);
    });

    it('keeps the cap until both heights are known', () => {
        expect(getFittedGraphShare(0, 1000, bounds)).toBe(35);
        expect(getFittedGraphShare(100, 0, bounds)).toBe(35);
    });
});
