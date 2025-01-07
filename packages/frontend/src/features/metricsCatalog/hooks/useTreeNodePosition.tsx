import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';

export const useTreeNodePosition = (nodeId: string) => {
    const { getNode } = useReactFlow();
    const node = getNode(nodeId);

    const containsNode = useCallback(
        (intersectingNodeId: string) => {
            const intersectingNode = getNode(intersectingNodeId);
            if (!intersectingNode || !node) return false;

            const { position: intersectingNodePosition } = intersectingNode;
            const { position: nodePosition, measured: nodeMeasured } = node;
            const { width: nodeWidth, height: nodeHeight } = nodeMeasured ?? {};

            return !(
                (
                    intersectingNodePosition.x + 100 <= nodePosition.x || // intersecting node is to the left, here we don't use the node width because node expands to the rigth, so we use a fixed value
                    intersectingNodePosition.x >=
                        nodePosition.x + (nodeWidth ?? 0) || // intersecting node is to the right
                    intersectingNodePosition.y + 20 <= nodePosition.y || // intersecting node is above, here we don't use height because node expands to the bottom, so we use a fixed value
                    intersectingNodePosition.y >=
                        nodePosition.y + (nodeHeight ?? 0)
                ) // intersecting node is below
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
