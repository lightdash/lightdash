import { useMantineTheme } from '@mantine/core';
import { BaseEdge, getSimpleBezierPath, type EdgeProps } from '@xyflow/react';
import type { FC } from 'react';

const DefaultEdge: FC<EdgeProps> = ({
    sourceX,
    sourceY,
    targetX,
    targetY,
    selected,
    ...props
}) => {
    const theme = useMantineTheme();
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
                stroke: selected
                    ? theme.colors.blue[4]
                    : theme.colors.ldGray[3],
            }}
        />
    );
};

export default DefaultEdge;
