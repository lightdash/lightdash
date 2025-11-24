import { Paper, Text } from '@mantine/core';
import type { Node, NodeProps } from '@xyflow/react';
import { useRef, type FC } from 'react';

export type FreeGroupNodeData = Node;

const FreeGroupNode: FC<NodeProps<FreeGroupNodeData>> = ({ height, width }) => {
    const ref = useRef<HTMLDivElement>(null);

    return (
        <Paper p="xs" h={height} w={width} bg="ldGray.0" padding="sm">
            <Text fz="xs" fw={500} c="ldGray.6" ref={ref}>
                Drag tiles from this area into the workspace to curate your
                canvas. Use the nodes to connect metrics and create metric
                trees.
            </Text>
        </Paper>
    );
};

export default FreeGroupNode;
