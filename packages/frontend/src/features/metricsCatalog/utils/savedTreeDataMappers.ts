import { type ApiCreateMetricsTreePayload } from '@lightdash/common';
import type { Edge } from '@xyflow/react';
import type { ExpandedNodeData } from '../components/Canvas/TreeComponents/nodes/ExpandedNode';

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
