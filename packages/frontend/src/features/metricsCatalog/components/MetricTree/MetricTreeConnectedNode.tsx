import { friendlyName } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { IconArrowUp, IconNumber } from '@tabler/icons-react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

type MetricTreeConnectedNodeData = Node<{
    label: string;
}>;

const MetricTreeConnectedNode: React.FC<
    NodeProps<MetricTreeConnectedNodeData>
> = ({ data }) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);
    const value = useMemo(() => Math.floor(Math.random() * 1001), []);
    const change = useMemo(() => Math.floor(Math.random() * 101) - 50, []);
    const compareString = useMemo(() => 'Compared to previous month', []);

    return (
        <div
            style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                backgroundColor: '#fff',
            }}
        >
            <Handle type="target" position={Position.Top} />
            <Stack spacing="xxs" key={data.label}>
                <Group>
                    <Text size="sm" c="dimmed">
                        {title}
                    </Text>
                    <MantineIcon icon={IconNumber} size={22} stroke={1.5} />
                </Group>

                <Group align="flex-end" mt="sm">
                    <Text fz="md" fw={700}>
                        {value}
                    </Text>
                    <Group spacing={1} c={change > 0 ? 'teal' : 'red'}>
                        <Text fz="sm" fw={500}>
                            <span>{change}%</span>
                        </Text>
                        <MantineIcon
                            icon={IconArrowUp}
                            size={16}
                            stroke={1.5}
                        />
                    </Group>
                </Group>

                <Text fz="xs" c="dimmed">
                    {compareString}
                </Text>
            </Stack>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
};

export default MetricTreeConnectedNode;
