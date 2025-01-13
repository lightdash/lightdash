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
> = ({ data, isConnectable, selected }) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    return (
        <Paper
            miw={150}
            fz="xs"
            p="xs"
            bg="white"
            sx={(theme) => ({
                '&[data-with-border]': {
                    borderRadius: theme.radius.md,
                    border: `1px dashed ${
                        selected ? theme.colors.blue[5] : theme.colors.gray[3]
                    }`,
                },
            })}
        >
            <Handle
                type="target"
                position={Position.Top}
                hidden={!isConnectable}
            />

            <Group>
                <Text size="xs" c="gray.7" fw={500} truncate ta="center">
                    {title}
                </Text>
                <Tooltip
                    label={
                        <>
                            <Text size="xs" fw="bold">
                                Table:{' '}
                                <Text span fw="normal">
                                    {data.tableName}
                                </Text>
                            </Text>
                        </>
                    }
                >
                    <MantineIcon
                        icon={IconInfoCircle}
                        size={12}
                        color="dark.3"
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
