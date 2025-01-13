import { friendlyName } from '@lightdash/common';
import { Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

export type MetricTreeCollapsedNodeData = Node<{
    label: string;
    tableName?: string;
}>;

const MetricTreeCollapsedNode: React.FC<
    NodeProps<MetricTreeCollapsedNodeData>
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

            <Group>
                <Text size="xs" c="dark.3" fw={500} truncate ta="center">
                    {title}
                </Text>
                <Tooltip label={data.tableName}>
                    <MantineIcon
                        icon={IconInfoCircle}
                        size={12}
                        color="gray.7"
                    />
                </Tooltip>
            </Group>

            <Handle
                type="source"
                position={Position.Bottom}
                hidden={!isConnectable}
            />
        </Paper>
    );
};

export default MetricTreeCollapsedNode;
