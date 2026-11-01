import Dagre from '@dagrejs/dagre';
import { type SourceQuery } from '@lightdash/common';
import type { Edge, Node } from '@xyflow/react';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import { nodeTypeLabelOf, type PipelineLayer } from './groupPipeline';

type PipelineFlowNodeData = {
    title: string;
    typeLabel: string;
    query: SourceQuery;
    isTerminal: boolean;
    /** Another node is hovered and this one is not linked to it. */
    isDimmed: boolean;
    status: ComposerRunNodeStatus | null;
};

export type PipelineFlowNode = Node<PipelineFlowNodeData, 'pipeline'>;

/** Global so the flow's stylesheet can target it; edges take no CSS module class. */
const EDGE_ACTIVE_CLASS = 'lineage-edge-active';

const RANK_GAP = 48;
const NODE_GAP = 16;

/** One flow node per pipeline node, one edge per read (read node -> reader). */
export const toPipelineFlow = (
    layers: PipelineLayer[],
    display: {
        hoveredNodeId: string | null;
        nodeStatuses: Readonly<Record<string, ComposerRunNodeStatus>>;
    },
): { nodes: PipelineFlowNode[]; edges: Edge[] } => {
    const pipelineNodes = layers.flatMap((layer) => layer.nodes);
    const { hoveredNodeId } = display;
    const isLinked = (nodeId: string) =>
        hoveredNodeId === null ||
        nodeId === hoveredNodeId ||
        pipelineNodes.some(
            (node) =>
                (node.nodeId === hoveredNodeId &&
                    node.readNodeIds.includes(nodeId)) ||
                (node.nodeId === nodeId &&
                    node.readNodeIds.includes(hoveredNodeId)),
        );
    const nodes = pipelineNodes.map<PipelineFlowNode>((node) => ({
        id: node.nodeId,
        type: 'pipeline',
        position: { x: 0, y: 0 },
        data: {
            title: node.title,
            typeLabel: nodeTypeLabelOf(node.query),
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
                hoveredNodeId !== null &&
                (readId === hoveredNodeId || node.nodeId === hoveredNodeId)
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
