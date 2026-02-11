import {
    CatalogType,
    FieldType,
    MetricType,
    type ApiCreateMetricsTreePayload,
    type CatalogField,
    type MetricsTreeNode,
} from '@lightdash/common';
import type { Edge } from '@xyflow/react';
import type { ExpandedNodeData } from '../components/Canvas/TreeComponents/nodes/ExpandedNode';

/**
 * Maps MetricsTreeNode[] to CatalogField-compatible objects for the Canvas `metrics` prop.
 * Only fills the fields actually used by Canvas/ExpandedNode; the rest get safe defaults.
 */
export const mapTreeNodesToCatalogFields = (
    nodes: MetricsTreeNode[],
): CatalogField[] =>
    nodes.map((node) => ({
        catalogSearchUuid: node.catalogSearchUuid,
        name: node.name,
        tableName: node.tableName,
        label: node.name,
        tableLabel: node.tableName,
        fieldType: FieldType.METRIC,
        type: CatalogType.Field,
        basicType: 'number' as const,
        fieldValueType: MetricType.COUNT,
        categories: [],
        chartUsage: undefined,
        icon: null,
        aiHints: null,
        owner: null,
        requiredAttributes: undefined,
    }));

/**
 * Extracts non-null positions from tree nodes into a lookup map keyed by catalogSearchUuid.
 */
export const extractNodePositions = (
    nodes: MetricsTreeNode[],
): Record<string, { x: number; y: number }> => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) {
        if (node.xPosition !== null && node.yPosition !== null) {
            positions[node.catalogSearchUuid] = {
                x: node.xPosition,
                y: node.yPosition,
            };
        }
    }
    return positions;
};

/**
 * Converts ReactFlow canvas state into the API create payload shape.
 */
export const mapCanvasStateToCreatePayload = (
    name: string,
    description: string,
    nodes: ExpandedNodeData[],
    edges: Edge[],
): ApiCreateMetricsTreePayload => ({
    name,
    description: description || undefined,
    source: 'ui',
    nodes: nodes.map((node) => ({
        catalogSearchUuid: node.id,
        xPosition: Math.round(node.position.x),
        yPosition: Math.round(node.position.y),
    })),
    edges: edges.map((edge) => ({
        sourceCatalogSearchUuid: edge.source,
        targetCatalogSearchUuid: edge.target,
    })),
});
