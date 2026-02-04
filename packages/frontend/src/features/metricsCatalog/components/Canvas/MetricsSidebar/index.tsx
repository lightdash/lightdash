import { friendlyName } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconGripVertical, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type DragEvent, type FC } from 'react';
import { Panel, PanelResizeHandle } from 'react-resizable-panels';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { type ExpandedNodeData } from '../TreeComponents/nodes/ExpandedNode';
import classes from './MetricsSidebar.module.css';

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

    const { ref, isTruncated } = useIsTruncated();
    return (
        <Paper
            p="xs"
            draggable
            onDragStart={(event) => onDragStart(event, node)}
            className={classes.draggableItem}
        >
            <Group gap="xs" wrap="nowrap">
                <MantineIcon
                    icon={IconGripVertical}
                    size={14}
                    color="ldGray.5"
                />
                <Tooltip label={title} disabled={!isTruncated} openDelay={500}>
                    <Text
                        size="xs"
                        c="ldGray.7"
                        fw={500}
                        truncate
                        style={{ flex: 1 }}
                        ref={ref}
                    >
                        {title}
                    </Text>
                </Tooltip>
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
                        color="ldGray.4"
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
        <>
            <Panel
                id="metrics-sidebar"
                order={1}
                defaultSize={20}
                minSize={15}
                maxSize={40}
            >
                <Paper
                    h="100%"
                    p="xs"
                    className={classes.sidebar}
                    radius={0}
                    pr={0}
                >
                    <Stack gap="sm" h="100%">
                        {nodes.length > 0 && (
                            <Text fz="xs" c="dimmed" px="xxs">
                                {nodes.length} metric
                                {nodes.length !== 1 ? 's' : ''} not on canvas
                            </Text>
                        )}

                        <ScrollArea style={{ flex: 1 }} offsetScrollbars>
                            {nodes.length > 0 ? (
                                <Stack gap="xs">
                                    {nodes.map((node) => (
                                        <DraggableMetricItem
                                            key={node.id}
                                            node={node}
                                            onDragStart={handleDragStart}
                                        />
                                    ))}
                                </Stack>
                            ) : (
                                <Text fz="xs" c="dimmed" ta="center" mt="md">
                                    All metrics are on the canvas
                                </Text>
                            )}
                        </ScrollArea>
                    </Stack>
                </Paper>
            </Panel>
            <Box component={PanelResizeHandle} className={classes.resizeHandle}>
                <MantineIcon
                    icon={IconGripVertical}
                    size={12}
                    color="ldGray.5"
                />
            </Box>
        </>
    );
};

export default MetricsSidebar;
