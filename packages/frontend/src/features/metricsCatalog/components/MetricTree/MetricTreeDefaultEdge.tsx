import { useMantineTheme } from '@mantine/core';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { FC } from 'react';

const MetricTreeDefaultEdge: FC<EdgeProps> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    selected,
    ...props
}) => {
    const theme = useMantineTheme();
    const [edgePath] = getBezierPath({
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
                stroke: selected ? theme.colors.blue[4] : theme.colors.gray[3],
            }}
        />
    );
};

export default MetricTreeDefaultEdge;
