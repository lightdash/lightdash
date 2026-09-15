import type { CatalogMetricsTreeEdge } from '@lightdash/common';
import {
    Box,
    Group,
    Stack,
    Button,
    useMantineTheme,
    useMatches,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconLayoutGridRemove } from '@tabler/icons-react';
import {
    Background,
    Controls,
    ReactFlow,
    useReactFlow,
    type Edge,
    type EdgeTypes,
    type NodeTypes,
} from '@xyflow/react';
import { useMemo, type FC } from 'react';
import '@xyflow/react/dist/style.css';
import MantineIcon from '../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../components/common/ResizableSplitter';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import { CanvasTimeFramePicker } from '../visualization/CanvasTimeFramePicker';
import styles from './Canvas.module.css';
import { CanvasConnectionModal } from './CanvasConnectionModal';
import { type CanvasMetric } from './canvasLayoutUtils';
import sidebarStyles from './CanvasSidebar.module.css';
import {
    CanvasYamlDriversContext,
    type CanvasYamlDriversContextValue,
    type YamlDriverInfo,
} from './CanvasYamlDriversContext';
import MetricsSidebar from './MetricsSidebar';
import DefaultEdge from './TreeComponents/edges/DefaultEdge';
import ExpandedNode, {
    type ExpandedNodeData,
} from './TreeComponents/nodes/ExpandedNode';
import { useCanvasFlow } from './useCanvasFlow';

const edgeTypes: EdgeTypes = { yaml: DefaultEdge, ui: DefaultEdge };
const nodeTypes: NodeTypes = { expanded: ExpandedNode };

type Props = {
    metrics: CanvasMetric[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly: boolean;
    /** Called when canvas nodes/edges change so parent can capture state for save */
    onCanvasStateChange?: (nodes: ExpandedNodeData[], edges: Edge[]) => void;
    /** Optional filter applied only to the sidebar list (not the canvas) */
    sidebarFilter?: (node: ExpandedNodeData) => boolean;
    /** All YAML edges for the project — used to inject YAML edges reactively in edit mode */
    allProjectYamlEdges?: CatalogMetricsTreeEdge[];
    hasMoreMetrics?: boolean;
    isLoadingMoreMetrics?: boolean;
    onLoadMoreMetrics?: () => void;
};

const SavedTreeCanvasFlow: FC<Props> = ({
    metrics,
    edges,
    viewOnly,
    onCanvasStateChange,
    sidebarFilter,
    allProjectYamlEdges,
    hasMoreMetrics,
    isLoadingMoreMetrics,
    onLoadMoreMetrics,
}) => {
    const theme = useMantineTheme();
    const getUiString = useUiStrings();
    const compact = useMatches(
        { base: true, md: false },
        { getInitialValueInEffect: false },
    );
    const { deleteElements } = useReactFlow();
    const [metricsOpened, { open: openMetrics, close: closeMetrics }] =
        useDisclosure(false);

    const flow = useCanvasFlow({
        metrics,
        edges,
        viewOnly,
        preventResetAfterInit: !viewOnly, // In edit mode, prevent background refetch resets
        onCanvasStateChange,
        sidebarFilter,
        allProjectYamlEdges,
        // No onEdgeCreated/onEdgesDeleted -- edges stay local until explicit save
    });

    const yamlDriversByTarget = useMemo(() => {
        const map = new Map<string, YamlDriverInfo[]>();
        if (!allProjectYamlEdges) return map;
        allProjectYamlEdges.forEach((edge) => {
            const targetUuid = edge.target.catalogSearchUuid;
            const driver: YamlDriverInfo = edge.source;
            const arr = map.get(targetUuid);
            if (arr) arr.push(driver);
            else map.set(targetUuid, [driver]);
        });
        return map;
    }, [allProjectYamlEdges]);

    const onCanvasMetricUuids = useMemo(
        () => new Set(flow.currentNodes.map((n) => n.id)),
        [flow.currentNodes],
    );

    const yamlDriversContextValue =
        useMemo<CanvasYamlDriversContextValue | null>(
            () =>
                viewOnly
                    ? null
                    : {
                          yamlDriversByTarget,
                          onCanvasMetricUuids,
                          addMetricsToCanvas: flow.addMetricsToCanvas,
                      },
            [
                viewOnly,
                yamlDriversByTarget,
                onCanvasMetricUuids,
                flow.addMetricsToCanvas,
            ],
        );

    return (
        <CanvasYamlDriversContext.Provider value={yamlDriversContextValue}>
            <Stack h="100%" gap={0}>
                <Group
                    className={styles.toolbar}
                    gap="xs"
                    justify="space-between"
                >
                    <CanvasTimeFramePicker
                        value={flow.canvasTimeOption}
                        onChange={flow.setCanvasTimeOption}
                    />
                    {!viewOnly && (
                        <Group gap="xs">
                            <Button
                                hiddenFrom="md"
                                variant="default"
                                h={44}
                                onClick={openMetrics}
                            >
                                {getUiString('metrics.addMetrics')}
                            </Button>
                            <CanvasConnectionModal
                                nodes={flow.currentNodes}
                                edges={flow.currentEdges}
                                onConnect={flow.handleConnect}
                            />
                        </Group>
                    )}
                </Group>
                <ResizableSplitter
                    orientation="horizontal"
                    withHandle
                    lineSize={compact ? 0 : 2}
                    resizable={!compact}
                    sizes={compact && !viewOnly ? [0, 100] : undefined}
                    classNames={{ handle: sidebarStyles.resizeHandle }}
                    style={{ flex: 1, minHeight: 0 }}
                >
                    {!viewOnly && (
                        <ResizableSplitter.Pane
                            id="metrics-sidebar"
                            defaultSize={20}
                            min={compact ? 0 : 15}
                            max={40}
                        >
                            <MetricsSidebar
                                opened={metricsOpened}
                                onClose={closeMetrics}
                                nodes={flow.sidebarNodes}
                                onAddMetric={(node) =>
                                    flow.addMetricsToCanvas([
                                        {
                                            catalogSearchUuid: node.id,
                                            name: node.data.metricName,
                                            label: node.data.label,
                                            tableName: node.data.tableName,
                                        },
                                    ])
                                }
                                yamlDriversByTarget={yamlDriversByTarget}
                                hasMore={hasMoreMetrics}
                                isLoadingMore={isLoadingMoreMetrics}
                                onLoadMore={onLoadMoreMetrics}
                            />
                        </ResizableSplitter.Pane>
                    )}
                    <ResizableSplitter.Pane
                        id="metrics-canvas"
                        defaultSize={80}
                    >
                        <Stack h="100%" gap={0}>
                            <Box style={{ flex: 1, minHeight: 0 }}>
                                <ReactFlow
                                    className={styles.reactFlow}
                                    nodes={flow.currentNodes}
                                    edges={flow.currentEdges}
                                    fitView
                                    minZoom={0.1}
                                    fitViewOptions={{ maxZoom: 1.2 }}
                                    attributionPosition="top-right"
                                    onNodesChange={flow.handleNodeChange}
                                    onEdgesChange={flow.handleEdgesChange}
                                    onConnect={flow.handleConnect}
                                    onDragOver={flow.handleDragOver}
                                    onDrop={flow.handleDrop}
                                    edgesReconnectable={false}
                                    onEdgesDelete={flow.handleEdgesDelete}
                                    nodeTypes={nodeTypes}
                                    edgeTypes={edgeTypes}
                                    nodesConnectable={!viewOnly}
                                    nodesDraggable={!viewOnly}
                                    elementsSelectable={!viewOnly}
                                >
                                    {!viewOnly && <Background />}
                                </ReactFlow>
                            </Box>
                            <Group
                                className={styles.footer}
                                gap="xs"
                                justify="space-between"
                            >
                                <Group gap="xs">
                                    {!viewOnly && (
                                        <>
                                            <Button
                                                variant="default"
                                                onClick={() =>
                                                    flow.applyLayout({
                                                        removeUnconnected: true,
                                                    })
                                                }
                                                size="xs"
                                                style={{
                                                    boxShadow:
                                                        theme.shadows.subtle,
                                                }}
                                                leftSection={
                                                    <MantineIcon
                                                        color="ldGray.5"
                                                        icon={
                                                            IconLayoutGridRemove
                                                        }
                                                    />
                                                }
                                            >
                                                Clean up
                                            </Button>
                                            {(flow.currentNodes.some(
                                                (node) => node.selected,
                                            ) ||
                                                flow.currentEdges.some(
                                                    (edge) => edge.selected,
                                                )) && (
                                                <Button
                                                    variant="default"
                                                    color="red"
                                                    size="xs"
                                                    onClick={() =>
                                                        void deleteElements({
                                                            nodes: flow.currentNodes.filter(
                                                                (node) =>
                                                                    node.selected,
                                                            ),
                                                            edges: flow.currentEdges.filter(
                                                                (edge) =>
                                                                    edge.selected,
                                                            ),
                                                        })
                                                    }
                                                >
                                                    {getUiString(
                                                        'metrics.removeSelected',
                                                    )}
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </Group>
                                <Controls
                                    showInteractive={false}
                                    fitViewOptions={{ maxZoom: 1.2 }}
                                    orientation="horizontal"
                                    className={styles.controls}
                                />
                            </Group>
                        </Stack>
                    </ResizableSplitter.Pane>
                </ResizableSplitter>
            </Stack>
        </CanvasYamlDriversContext.Provider>
    );
};

export default SavedTreeCanvasFlow;
