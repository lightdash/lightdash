import { BaseEdge, getSimpleBezierPath, type EdgeProps } from '@xyflow/react';
import React, { type FC } from 'react';

const DefaultEdge: FC<EdgeProps> = ({
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

export default React.memo(DefaultEdge);
