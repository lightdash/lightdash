import Dagre from '@dagrejs/dagre';
import {
    TimeFrames,
    type CatalogMetricsTreeEdge,
    type CatalogMetricsTreeNode,
} from '@lightdash/common';
import { MarkerType, type Edge } from '@xyflow/react';
import type { ExpandedNodeData } from './TreeComponents/nodes/ExpandedNode';

/**
 * Minimal metric type for canvas rendering.
 * CatalogField satisfies this (no positions), MetricsTreeNode satisfies this (with positions).
 */
export type CanvasMetric = CatalogMetricsTreeNode & {
    xPosition?: number | null;
    yPosition?: number | null;
};

const getEdgeId = (
    edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>,
): string => {
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
};

const getNodeGroups = (
    nodes: ExpandedNodeData[],
    edges: Edge[],
): { connectedNodes: ExpandedNodeData[]; freeNodes: ExpandedNodeData[] } => {
    const connectedNodeIds = new Set<string>();

    edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    const connectedNodes = nodes.filter((node) =>
        connectedNodeIds.has(node.id),
    );
    const freeNodes = nodes.filter((node) => !connectedNodeIds.has(node.id));

    return { connectedNodes, freeNodes };
};

export const getNodeLayout = (
    nodes: ExpandedNodeData[],
    edges: Edge[],
): { nodes: ExpandedNodeData[]; edges: Edge[] } => {
    const { connectedNodes, freeNodes } = getNodeGroups(nodes, edges);
    const treeGraph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(
        () => ({}),
    );
    treeGraph.setGraph({ rankdir: 'TB', ranksep: 100 });

    edges.forEach((edge) => treeGraph.setEdge(edge.source, edge.target));

    connectedNodes.forEach((node) =>
        treeGraph.setNode(node.id, {
            ...node,
            width: node.measured?.width ?? 0,
            height: node.measured?.height ?? 0,
        }),
    );

    Dagre.layout(treeGraph);

    const layoutedConnectedNodes = connectedNodes.map<ExpandedNodeData>(
        (node) => {
            const position = treeGraph.node(node.id);
            const x = position.x - (node.measured?.width ?? 0) / 2;
            const y = position.y - (node.measured?.height ?? 0) / 2;

            return {
                ...node,
                type: 'expanded',
                position: { x, y },
            };
        },
    );

    return {
        nodes: [...layoutedConnectedNodes, ...freeNodes],
        edges,
    };
};

/** Convert API edges to ReactFlow edges, filtering out edges where source/target metrics are missing */
export const buildInitialEdges = (
    edges: CatalogMetricsTreeEdge[],
    metrics: CanvasMetric[],
): Edge[] => {
    const filteredEdges = edges.filter(
        (edge) =>
            metrics.some(
                (metric) =>
                    metric.catalogSearchUuid === edge.source.catalogSearchUuid,
            ) &&
            metrics.some(
                (metric) =>
                    metric.catalogSearchUuid === edge.target.catalogSearchUuid,
            ),
    );

    return filteredEdges.map((edge) => ({
        id: getEdgeId(edge),
        source: edge.source.catalogSearchUuid,
        target: edge.target.catalogSearchUuid,
        type: edge.createdFrom,
        markerEnd: {
            type: MarkerType.ArrowClosed,
        },
    }));
};

/** Returns the set of metric IDs that have persisted (non-null) positions */
export const getPersistedPositionIds = (metrics: CanvasMetric[]): Set<string> =>
    new Set(
        metrics
            .filter((m) => m.xPosition != null && m.yPosition != null)
            .map((m) => m.catalogSearchUuid),
    );

/** Build all nodes from metrics, marking which are edge sources/targets */
export const buildAllNodes = (
    metrics: CanvasMetric[],
    initialEdges: Edge[],
): ExpandedNodeData[] => {
    return metrics.map((metric) => {
        const isEdgeTarget = initialEdges.some(
            (edge) => edge.target === metric.catalogSearchUuid,
        );
        const isEdgeSource = initialEdges.some(
            (edge) => edge.source === metric.catalogSearchUuid,
        );
        const savedPosition =
            metric.xPosition != null && metric.yPosition != null
                ? { x: metric.xPosition, y: metric.yPosition }
                : undefined;

        return {
            id: metric.catalogSearchUuid,
            position: savedPosition ?? { x: 0, y: 0 },
            type: 'expanded',
            data: {
                label: metric.name,
                tableName: metric.tableName,
                metricName: metric.name,
                timeFrame: TimeFrames.MONTH, // Default, will be updated by effect
                rollingDays: undefined,
                isEdgeTarget,
                isEdgeSource,
            },
        };
    });
};

/** Filter to only nodes that should appear on canvas initially: connected nodes + nodes with saved positions */
export const buildInitialNodes = (
    allNodes: ExpandedNodeData[],
    initialEdges: Edge[],
    persistedPositionIds: Set<string>,
): ExpandedNodeData[] => {
    const connectedNodeIds = new Set(
        initialEdges.flatMap((edge) => [edge.source, edge.target]),
    );
    return allNodes.filter(
        (node) =>
            connectedNodeIds.has(node.id) || persistedPositionIds.has(node.id),
    );
};
