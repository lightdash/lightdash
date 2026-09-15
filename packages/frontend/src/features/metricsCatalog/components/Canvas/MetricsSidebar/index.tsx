import {
    ActionIcon,
    Button,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconBook,
    IconGripVertical,
    IconHierarchy3,
    IconInfoCircle,
    IconPlus,
} from '@tabler/icons-react';
import React, {
    useCallback,
    useMemo,
    useState,
    type DragEvent,
    type FC,
} from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../ee/providers/Embed/useUiStrings';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { CanvasSidebar } from '../CanvasSidebar';
import { type YamlDriverInfo } from '../CanvasYamlDriversContext';
import { type ExpandedNodeData } from '../TreeComponents/nodes/ExpandedNode';
import classes from './MetricsSidebar.module.css';

type MetricsSidebarProps = {
    opened: boolean;
    onClose: () => void;
    nodes: ExpandedNodeData[];
    onAddMetric: (node: ExpandedNodeData) => void;
    yamlDriversByTarget: Map<string, YamlDriverInfo[]>;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
};

type DraggableMetricItemProps = {
    node: ExpandedNodeData;
    hasYamlDrivers: boolean;
    onAddMetric: (node: ExpandedNodeData) => void;
    onDragStart: (
        event: DragEvent<HTMLDivElement>,
        node: ExpandedNodeData,
    ) => void;
};

const DraggableMetricItem: FC<DraggableMetricItemProps> = React.memo(
    ({ node, hasYamlDrivers, onDragStart, onAddMetric }) => {
        const title = node.data.label;

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
                    <Tooltip
                        label={title}
                        disabled={!isTruncated}
                        openDelay={500}
                    >
                        <Text
                            size="xs"
                            c="ldGray.7"
                            fw={500}
                            truncate
                            flex={1}
                            ref={ref}
                        >
                            {title}
                        </Text>
                    </Tooltip>
                    <Tooltip label={`Add ${title} to canvas`}>
                        <ActionIcon
                            aria-label={`Add ${title} to canvas`}
                            size="sm"
                            variant="subtle"
                            onClick={() => onAddMetric(node)}
                            data-tour-anchor="tree-add-metric"
                            data-tour-hint="Add {value} to canvas"
                            data-tour-docs="explore/metrics-catalog/build-saved-trees.mdx#creating-a-saved-tree:li3"
                            data-tour-value={title}
                        >
                            <MantineIcon icon={IconPlus} size={14} />
                        </ActionIcon>
                    </Tooltip>
                    {hasYamlDrivers && (
                        <Tooltip
                            label="Drivers defined in YAML"
                            openDelay={300}
                        >
                            <MantineIcon
                                icon={IconHierarchy3}
                                size={10}
                                color="ldGray.4"
                            />
                        </Tooltip>
                    )}
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
    },
);

const MetricsSidebar: FC<MetricsSidebarProps> = React.memo(
    ({
        nodes,
        opened,
        onClose,
        yamlDriversByTarget,
        hasMore,
        isLoadingMore,
        onLoadMore,
        onAddMetric,
    }) => {
        const getUiString = useUiStrings();
        const [search, setSearch] = useState('');
        const visibleNodes = useMemo(() => {
            const query = search.trim().toLowerCase();
            return nodes.filter((node) =>
                `${node.data.label} ${node.data.tableName}`
                    .toLowerCase()
                    .includes(query),
            );
        }, [nodes, search]);
        const handleDragStart = useCallback(
            (event: DragEvent<HTMLDivElement>, node: ExpandedNodeData) => {
                event.dataTransfer.setData('application/reactflow', node.id);
                event.dataTransfer.effectAllowed = 'move';
            },
            [],
        );

        return (
            <CanvasSidebar
                title={getUiString('metrics.addMetrics')}
                opened={opened}
                onClose={onClose}
            >
                <Paper
                    h="100%"
                    p="xs"
                    className={classes.sidebar}
                    radius={0}
                    pr={0}
                >
                    <Stack gap="sm" h="100%">
                        <Group
                            gap="sm"
                            justify="space-between"
                            px="xs"
                            wrap="nowrap"
                        >
                            {nodes.length > 0 && (
                                <Text fz="xs" c="dimmed">
                                    {nodes.length} metric
                                    {nodes.length !== 1 ? 's' : ''} not on
                                    canvas
                                </Text>
                            )}
                            <ActionIcon
                                title="Documentation"
                                aria-label="Documentation"
                                component="a"
                                href="https://docs.lightdash.com/guides/metrics-catalog/canvas"
                                target="_blank"
                                variant="transparent"
                                size="xs"
                            >
                                <MantineIcon icon={IconBook} color="ldGray.5" />
                            </ActionIcon>
                        </Group>

                        <TextInput
                            type="search"
                            aria-label={getUiString('metrics.searchMetrics')}
                            placeholder={getUiString('metrics.searchMetrics')}
                            value={search}
                            onChange={(event) =>
                                setSearch(event.currentTarget.value)
                            }
                            mx="xs"
                        />
                        <ScrollArea flex={1} offsetScrollbars>
                            <Stack gap="xs">
                                {visibleNodes.length > 0
                                    ? visibleNodes.map((node) => (
                                          <DraggableMetricItem
                                              key={node.id}
                                              node={node}
                                              hasYamlDrivers={yamlDriversByTarget.has(
                                                  node.id,
                                              )}
                                              onDragStart={handleDragStart}
                                              onAddMetric={(node) => {
                                                  onAddMetric(node);
                                                  onClose();
                                              }}
                                          />
                                      ))
                                    : !hasMore && (
                                          <Text
                                              fz="xs"
                                              c="dimmed"
                                              ta="center"
                                              mt="md"
                                          >
                                              {search
                                                  ? getUiString(
                                                        'metrics.noMatchingMetrics',
                                                    )
                                                  : 'All metrics are on the canvas'}
                                          </Text>
                                      )}
                                {hasMore && (
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={onLoadMore}
                                        loading={isLoadingMore}
                                    >
                                        Load more
                                    </Button>
                                )}
                            </Stack>
                        </ScrollArea>
                    </Stack>
                </Paper>
            </CanvasSidebar>
        );
    },
);

export default MetricsSidebar;
