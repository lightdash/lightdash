import { friendlyName } from '@lightdash/common';
import { Paper, Text } from '@mantine/core';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';

export type MetricTreeUnconnectedNodeData = Node<{
    label: string;
}>;

const MetricTreeUnconnectedNode: React.FC<
    NodeProps<MetricTreeUnconnectedNodeData>
> = ({ data, isConnectable }) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    return (
        <Paper
            miw={150}
            fz="xs"
            p="xs"
            sx={(theme) => ({
                '&[data-with-border]': {
                    border: `none`,
                    borderRadius: theme.radius.sm,
                    background: `linear-gradient(90deg, ${theme.colors.gray[5]} 50%, ${theme.colors.gray[0]} 50%), 
                                linear-gradient(90deg, ${theme.colors.gray[5]} 50%, ${theme.colors.gray[0]} 50%), 
                                linear-gradient(0deg, ${theme.colors.gray[5]} 50%, ${theme.colors.gray[0]} 50%), 
                                linear-gradient(0deg, ${theme.colors.gray[5]} 50%, ${theme.colors.gray[0]} 50%)`,
                    backgroundColor: theme.colors.gray[0],
                    backgroundRepeat: 'repeat-x, repeat-x, repeat-y, repeat-y',
                    backgroundSize: '6px 1px, 6px 1px, 1px 6px, 1px 6px',
                    backgroundPosition: '0% 0%, 100% 100%, 0% 100%, 100% 0px',
                    animation: 'dash 15s linear infinite',
                },
                '@keyframes dash': {
                    to: {
                        backgroundPosition:
                            '100% 0%, 0% 100%, 0% 0%, 100% 100%',
                    },
                },
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable}
            />

            <Text size="xs" c="dark.3" fw={500} truncate ta="center">
                {title}
            </Text>

            <Handle
                type="source"
                position={Position.Bottom}
                hidden={!isConnectable}
            />
        </Paper>
    );
};

export default MetricTreeUnconnectedNode;
