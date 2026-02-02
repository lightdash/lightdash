import { friendlyName } from '@lightdash/common';
import { Group, Paper, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';

export type CollapsedNodeData = Node<{
    label: string;
    tableName?: string;
}>;

const CollapsedNode: React.FC<NodeProps<CollapsedNodeData>> = ({
    data,
    selected,
}) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    return (
        <Paper
            miw={150}
            fz="xs"
            p="xs"
            sx={(theme) => ({
                backgroundColor: theme.colors.background[0],
                borderRadius: theme.radius.md,
                border: `1px dashed ${
                    selected ? theme.colors.blue[5] : theme.colors.ldGray[3]
                }`,
            })}
        >
            <Group position="apart">
                <Text size="xs" c="ldGray.7" fw={500} truncate ta="center">
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
                        color="ldGray.7"
                    />
                </Tooltip>
            </Group>
        </Paper>
    );
};

export default CollapsedNode;
