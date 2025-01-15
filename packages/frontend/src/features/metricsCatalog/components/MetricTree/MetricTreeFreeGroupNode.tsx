import { Paper, Text, useMantineTheme } from '@mantine/core';
import type { Node, NodeProps } from '@xyflow/react';
import { useRef, type FC } from 'react';

export type MetricTreeFreeGroupNodeData = Node;

const MetricTreeFreeGroupNode: FC<NodeProps<MetricTreeFreeGroupNodeData>> = ({
    height,
    width,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const theme = useMantineTheme();

    return (
        <Paper
            fz="xs"
            p="xs"
            h={height}
            w={width}
            bg="gray.0"
            padding="sm"
            sx={{
                border: `1px solid ${theme.colors.gray[2]}`,
                boxShadow: theme.shadows.subtle,
                borderRadius: theme.radius.md,
            }}
        >
            <Text fz={12} fw={500} c="gray.6" ref={ref}>
                Drag tiles from this area into the workspace to curate your
                canvas. Use the nodes to connect metrics and create metric
                trees.
            </Text>
        </Paper>
    );
};

export default MetricTreeFreeGroupNode;
