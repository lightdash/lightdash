import { type CatalogMetricsTreeEdgeSource } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import {
    BaseEdge,
    getSimpleBezierPath,
    type Edge,
    type EdgeProps,
} from '@xyflow/react';
import type { FC } from 'react';

type DefaultEdgeData = Edge<{
    createdFrom?: CatalogMetricsTreeEdgeSource;
}>;

const DefaultEdge: FC<EdgeProps<DefaultEdgeData>> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    selected,
    markerEnd,
    ...props
}) => {
    const theme = useMantineTheme();
    const strokeColor = selected
        ? theme.colors.blue[4]
        : theme.colors.ldGray[3];

    const [edgePath] = getSimpleBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
    });

    return (
        <BaseEdge
            {...props}
            path={edgePath}
            style={{
                stroke: strokeColor,
            }}
            markerEnd={markerEnd}
        />
    );
};

export default DefaultEdge;
