import { friendlyName } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import React, { useMemo } from 'react';

type MetricTreeUnconnectedNodeData = Node<{
    label: string;
}>;

const MetricTreeUnconnectedNode: React.FC<
    NodeProps<MetricTreeUnconnectedNodeData>
> = ({ data }) => {
    //TODO: fetch real data for these
    const title = useMemo(() => friendlyName(data.label), [data.label]);

    return (
        <div
            style={{
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                backgroundColor: '#fff',
                width: '170px',
                height: '38px',
            }}
        >
            <Handle type="target" position={Position.Top} />
            <Stack key={data.label}>
                <Group>
                    <Text size="xs" c="dimmed" truncate>
                        {title}
                    </Text>
                </Group>
            </Stack>
            <Handle type="source" position={Position.Bottom} />
        </div>
    );
};

export default MetricTreeUnconnectedNode;
