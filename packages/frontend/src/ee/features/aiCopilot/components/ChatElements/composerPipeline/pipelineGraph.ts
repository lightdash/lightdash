import Dagre from '@dagrejs/dagre';
import { type SourceQuery } from '@lightdash/common';
import type { Edge, Node } from '@xyflow/react';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import { type PipelineLayer, type PipelineNode } from './groupPipeline';

type PipelineFlowNodeData = {
    title: string;
    query: SourceQuery;
    isTerminal: boolean;
    /** Another node is focused and this one is outside its lineage. */
    isDimmed: boolean;
    status: ComposerRunNodeStatus | null;
};

export type PipelineFlowNode = Node<PipelineFlowNodeData, 'pipeline'>;

/** Global so the flow's stylesheet can target it; edges take no CSS module class. */
const EDGE_ACTIVE_CLASS = 'lineage-edge-active';

const RANK_GAP = 36;
const NODE_GAP = 16;

const walk = (
    startId: string,
    next: (nodeId: string) => readonly string[],
): Set<string> => {
    const seen = new Set<string>();
    const stack = [...next(startId)];
    while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...next(id));
    }
    return seen;
};

/** Every node the given one reads, directly or through other nodes. */
const getUpstreamNodeIds = (
    pipelineNodes: readonly PipelineNode[],
    nodeId: string,
): Set<string> => {
    const readsById = new Map(
        pipelineNodes.map((node) => [node.nodeId, node.readNodeIds]),
    );
    return walk(nodeId, (id) => readsById.get(id) ?? []);
};

/** The focused node plus every node upstream and downstream of it. */
const getLineageNodeIds = (
    pipelineNodes: readonly PipelineNode[],
    focusedNodeId: string,
): Set<string> => {
    const ancestors = getUpstreamNodeIds(pipelineNodes, focusedNodeId);
    const descendants = walk(focusedNodeId, (id) =>
        pipelineNodes
            .filter((node) => node.readNodeIds.includes(id))
            .map((node) => node.nodeId),
    );
    return new Set([focusedNodeId, ...ancestors, ...descendants]);
};

/** One flow node per pipeline node, one edge per read (read node -> reader). */
export const toPipelineFlow = (
    layers: PipelineLayer[],
    display: {
        /** Hovered, else selected; everything outside its lineage dims. */
        focusedNodeId: string | null;
        nodeStatuses: Readonly<Record<string, ComposerRunNodeStatus>>;
    },
): { nodes: PipelineFlowNode[]; edges: Edge[] } => {
    const pipelineNodes = layers.flatMap((layer) => layer.nodes);
    const { focusedNodeId } = display;
    const lineage =
        focusedNodeId === null
            ? null
            : getLineageNodeIds(pipelineNodes, focusedNodeId);
    const isLinked = (nodeId: string) => lineage?.has(nodeId) ?? true;
    const nodes = pipelineNodes.map<PipelineFlowNode>((node) => ({
        id: node.nodeId,
        type: 'pipeline',
        position: { x: 0, y: 0 },
        data: {
            title: node.title,
            query: node.query,
            isTerminal: node.isTerminal,
            isDimmed: !isLinked(node.nodeId),
            status: display.nodeStatuses[node.nodeId] ?? null,
        },
    }));
    const edges = pipelineNodes.flatMap<Edge>((node) =>
        node.readNodeIds.map((readId) => ({
            id: `${readId}->${node.nodeId}`,
            source: readId,
            target: node.nodeId,
            type: 'pipeline',
            className:
                lineage !== null &&
                lineage.has(readId) &&
                lineage.has(node.nodeId)
                    ? EDGE_ACTIVE_CLASS
                    : undefined,
        })),
    );
    return { nodes, edges };
};

/**
 * Left-to-right dagre layout over measured nodes. Edges out of the terminal
 * are reversed and every other sink is wired into it, so it is always last.
 */
export const layoutPipelineFlow = (
    nodes: PipelineFlowNode[],
    edges: Edge[],
): PipelineFlowNode[] => {
    const terminal = nodes.find((node) => node.data.isTerminal);
    const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', ranksep: RANK_GAP, nodesep: NODE_GAP });
    nodes.forEach((node) =>
        graph.setNode(node.id, {
            width: node.measured?.width ?? 0,
            height: node.measured?.height ?? 0,
        }),
    );
    edges.forEach((edge) =>
        edge.source === terminal?.id
            ? graph.setEdge(edge.target, edge.source)
            : graph.setEdge(edge.source, edge.target),
    );
    if (terminal) {
        nodes
            .filter(
                (node) =>
                    node.id !== terminal.id &&
                    graph.outEdges(node.id)?.length === 0,
            )
            .forEach((sink) => graph.setEdge(sink.id, terminal.id));
    }
    Dagre.layout(graph);
    return nodes.map((node) => {
        const { x, y } = graph.node(node.id);
        return {
            ...node,
            position: {
                x: x - (node.measured?.width ?? 0) / 2,
                y: y - (node.measured?.height ?? 0) / 2,
            },
        };
    });
};

export const GRAPH_FIT_PADDING = 0.08;
// Room for the expand toggle; fitView centres, so it is kept above and below.
const GRAPH_CHROME_HEIGHT = 72;

/** Height of the laid-out nodes, in flow units (px at 100% zoom). */
export const getPipelineFlowHeight = (nodes: PipelineFlowNode[]): number => {
    if (nodes.length === 0) return 0;
    const top = Math.min(...nodes.map((node) => node.position.y));
    const bottom = Math.max(
        ...nodes.map((node) => node.position.y + (node.measured?.height ?? 0)),
    );
    return bottom - top;
};

/** Graph pane share (%) that shows the nodes at 100% zoom, within the bounds. */
export const getFittedGraphShare = (
    contentHeight: number,
    containerHeight: number,
    { min, max }: { min: number; max: number },
): number => {
    if (contentHeight <= 0 || containerHeight <= 0) return max;
    const needed =
        contentHeight * (1 + GRAPH_FIT_PADDING) + GRAPH_CHROME_HEIGHT;
    return Math.min(
        max,
        Math.max(min, Math.ceil((needed / containerHeight) * 100)),
    );
};
