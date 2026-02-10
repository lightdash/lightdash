import { type MetricsTreeSource } from '@lightdash/common';
import {
    BaseEdge,
    getSimpleBezierPath,
    type Edge,
    type EdgeProps,
} from '@xyflow/react';
import type { FC } from 'react';

type DefaultEdgeData = Edge<{
    createdFrom?: MetricsTreeSource;
}>;

const DefaultEdge: FC<EdgeProps<DefaultEdgeData>> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    markerEnd,
    ...props
}) => {
    const [edgePath] = getSimpleBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
    });

    return <BaseEdge {...props} path={edgePath} markerEnd={markerEnd} />;
};

export default DefaultEdge;
