import { friendlyName } from '@lightdash/common';
import { Group, Paper, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconGripVertical, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type DragEvent, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { type ExpandedNodeData } from './TreeComponents/nodes/ExpandedNode';

type MetricsSidebarProps = {
    nodes: ExpandedNodeData[];
};

type DraggableMetricItemProps = {
    node: ExpandedNodeData;
    onDragStart: (
        event: DragEvent<HTMLDivElement>,
        node: ExpandedNodeData,
    ) => void;
};

const DraggableMetricItem: FC<DraggableMetricItemProps> = ({
    node,
    onDragStart,
}) => {
    const title = useMemo(
        () => friendlyName(node.data.label),
        [node.data.label],
    );

    return (
        <Paper
            p="xs"
            draggable
            onDragStart={(event: DragEvent<HTMLDivElement>) =>
                onDragStart(event, node)
            }
            sx={(theme) => ({
                backgroundColor: theme.colors.background[0],
                borderRadius: theme.radius.md,
                border: `1px dashed ${theme.colors.ldGray[3]}`,
                cursor: 'grab',
                '&:hover': {
                    borderColor: theme.colors.blue[5],
                    backgroundColor: theme.colors.ldGray[0],
                },
                '&:active': {
                    cursor: 'grabbing',
                },
            })}
        >
            <Group spacing="xs" noWrap>
                <MantineIcon
                    icon={IconGripVertical}
                    size={14}
                    color="ldGray.5"
                />
                <Text size="xs" c="ldGray.7" fw={500} truncate sx={{ flex: 1 }}>
                    {title}
                </Text>
                <Tooltip
                    label={
                        <Text size="xs" fw="bold">
                            Table:{' '}
                            <Text span fw="normal">
                                {node.data.tableName}
                            </Text>
                        </Text>
                    }
                >
                    <MantineIcon
                        icon={IconInfoCircle}
                        size={12}
                        color="ldGray.5"
                    />
                </Tooltip>
            </Group>
        </Paper>
    );
};

const MetricsSidebar: FC<MetricsSidebarProps> = ({ nodes }) => {
    const handleDragStart = (
        event: DragEvent<HTMLDivElement>,
        node: ExpandedNodeData,
    ) => {
        event.dataTransfer.setData(
            'application/reactflow',
            JSON.stringify({
                catalogSearchUuid: node.id,
                name: node.data.label,
                tableName: node.data.tableName,
            }),
        );
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <Paper
            w={280}
            h="100%"
            p="md"
            bg="ldGray.0"
            sx={(theme) => ({
                borderRight: `1px solid ${theme.colors.ldGray[2]}`,
                flexShrink: 0,
            })}
        >
            <Stack spacing="sm" h="100%">
                {nodes.length > 0 && (
                    <Text fz="xs" c="ldGray.5">
                        {nodes.length} metric
                        {nodes.length !== 1 ? 's' : ''} available
                    </Text>
                )}

                <ScrollArea sx={{ flex: 1 }} offsetScrollbars>
                    {nodes.length > 0 ? (
                        <Stack spacing="xs">
                            {nodes.map((node) => (
                                <DraggableMetricItem
                                    key={node.id}
                                    node={node}
                                    onDragStart={handleDragStart}
                                />
                            ))}
                        </Stack>
                    ) : (
                        <Text fz="xs" c="ldGray.4" ta="center" mt="md">
                            All metrics are on the canvas
                        </Text>
                    )}
                </ScrollArea>
            </Stack>
        </Paper>
    );
};

export default MetricsSidebar;
