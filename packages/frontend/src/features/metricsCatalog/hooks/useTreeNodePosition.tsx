import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';

export const useTreeNodePosition = (nodeId: string) => {
    const { getNode } = useReactFlow();
    const node = getNode(nodeId);

    const containsNode = useCallback(
        (intersectingNodeId: string) => {
            const intersectingNode = getNode(intersectingNodeId);
            if (!intersectingNode || !node) return false;

            const {
                position: intersectingNodePosition,
                measured: intersectingNodeMeasured,
            } = intersectingNode;

            const {
                width: intersectingNodeWidth,
                height: intersectingNodeHeight,
            } = intersectingNodeMeasured ?? {};

            const { position: nodePosition, measured: nodeMeasured } = node;
            const { width: nodeWidth, height: nodeHeight } = nodeMeasured ?? {};

            return (
                intersectingNodePosition.x >= nodePosition.x &&
                intersectingNodePosition.x + (intersectingNodeWidth ?? 0) <=
                    nodePosition.x + (nodeWidth ?? 0) &&
                intersectingNodePosition.y >= nodePosition.y &&
                intersectingNodePosition.y + (intersectingNodeHeight ?? 0) <=
                    nodePosition.y + (nodeHeight ?? 0)
            );
        },
        [getNode, node],
    );

    return {
        containsNode,
        position: node?.position,
        width: node?.width,
        height: node?.height,
    };
};
