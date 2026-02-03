import { type CatalogMetricsTreeEdgeSource } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import {
    BaseEdge,
    getSimpleBezierPath,
    type Edge,
    type EdgeProps,
} from '@xyflow/react';
import type { FC } from 'react';

const ARROW_SIZE = 8;

type DefaultEdgeData = Edge<{
    createdFrom?: CatalogMetricsTreeEdgeSource;
}>;

const DefaultEdge: FC<EdgeProps<DefaultEdgeData>> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    selected,
    id,
    ...props
}) => {
    const theme = useMantineTheme();
    const strokeColor = selected
        ? theme.colors.blue[4]
        : theme.colors.ldGray[3];

    const markerId = `arrow-${id}`;

    const [edgePath] = getSimpleBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
    });

    return (
        <>
            <defs>
                <marker
                    id={markerId}
                    markerWidth={ARROW_SIZE}
                    markerHeight={ARROW_SIZE}
                    refX={ARROW_SIZE}
                    refY={ARROW_SIZE / 2}
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <path
                        d={`M0,0 L0,${ARROW_SIZE} L${ARROW_SIZE},${
                            ARROW_SIZE / 2
                        } z`}
                        fill={strokeColor}
                    />
                </marker>
            </defs>
            <BaseEdge
                {...props}
                id={id}
                path={edgePath}
                style={{
                    stroke: strokeColor,
                }}
                markerEnd={`url(#${markerId})`}
            />
        </>
    );
};

export default DefaultEdge;
