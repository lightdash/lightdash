import Dagre from '@dagrejs/dagre';
import {
    FeatureFlags,
    TimeFrames,
    type CatalogField,
    type CatalogMetricsTreeEdge,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconInfoCircle, IconLayoutGridRemove } from '@tabler/icons-react';
import {
    Background,
    Panel,
    ReactFlow,
    addEdge,
    useEdgesState,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
    type Connection,
    type Edge,
    type EdgeChange,
    type EdgeTypes,
    type NodeChange,
    type NodePositionChange,
    type NodeRemoveChange,
    type NodeReplaceChange,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import partition from 'lodash/partition';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useClientFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
} from '../../hooks/useMetricsTree';
import { TimeFramePicker } from '../visualization/TimeFramePicker';
import MetricsSidebar from './MetricsSidebar';
import DefaultEdge from './TreeComponents/edges/DefaultEdge';
import ExpandedNode, {
    type ExpandedNodeData,
} from './TreeComponents/nodes/ExpandedNode';

const edgeTypes: EdgeTypes = { yaml: DefaultEdge, ui: DefaultEdge };
const nodeTypes: NodeTypes = { expanded: ExpandedNode };

type Props = {
    metrics: CatalogField[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly?: boolean;
};

const DEFAULT_TIME_FRAME = TimeFrames.MONTH; // TODO: this should be dynamic

function getEdgeId(edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>) {
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
}

const getNodeGroups = (nodes: ExpandedNodeData[], edges: Edge[]) => {
    const connectedNodeIds = new Set();

    edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    const connectedNodes = nodes.filter((node) =>
        connectedNodeIds.has(node.id),
    );

    const freeNodes = nodes.filter((node) => !connectedNodeIds.has(node.id));

    return {
        connectedNodes,
        freeNodes,
    };
};

const getNodeLayout = (
    nodes: ExpandedNodeData[],
    edges: Edge[],
): {
    nodes: ExpandedNodeData[];
    edges: Edge[];
} => {
    const { connectedNodes, freeNodes } = getNodeGroups(nodes, edges);
    const treeGraph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(
        () => ({}),
    );
    treeGraph.setGraph({ rankdir: 'TB', ranksep: 100 });

    // Layout connected nodes with Dagre
    edges.forEach((edge) => treeGraph.setEdge(edge.source, edge.target));

    connectedNodes.forEach((node) =>
        treeGraph.setNode(node.id, {
            ...node,
            width: node.measured?.width ?? 0,
            height: node.measured?.height ?? 0,
        }),
    );

    Dagre.layout(treeGraph);

    const layoutedConnectedNodes = connectedNodes.map<ExpandedNodeData>(
        (node) => {
            const position = treeGraph.node(node.id);
            const x = position.x - (node.measured?.width ?? 0) / 2;
            const y = position.y - (node.measured?.height ?? 0) / 2;

            return {
                ...node,
                type: 'expanded',
                position: { x, y },
            };
        },
    );

    // Return both connected (laid out) and free nodes (keep their positions)
    return {
        nodes: [...layoutedConnectedNodes, ...freeNodes],
        edges,
    };
};

const Canvas: FC<Props> = ({ metrics, edges, viewOnly }) => {
    const { track } = useTracking();
    const theme = useMantineTheme();
    const isTreeModeSwitcherEnabled = useClientFeatureFlag(
        FeatureFlags.MetricsCatalogTreeModeSwitcher,
    );
    const [userUuid, projectUuid, organizationUuid] = useAppSelector(
        ({ metricsCatalog }) => [
            metricsCatalog.user?.userUuid,
            metricsCatalog.projectUuid,
            metricsCatalog.organizationUuid,
        ],
    );
    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();
    const { fitView, getNode, getEdge, screenToFlowPosition } = useReactFlow<
        ExpandedNodeData,
        Edge
    >();
    const nodesInitialized = useNodesInitialized();
    const [isLayoutReady, setIsLayoutReady] = useState(false);
    const { showToastInfo } = useToaster();
    const [timeFrame, setTimeFrame] = useState<TimeFrames>(DEFAULT_TIME_FRAME);

    const initialEdges = useMemo<Edge[]>(() => {
        // If there are saved edges, use them
        // Only use edges where both source and target are in the metrics array
        if (edges) {
            const filteredEdges = edges.filter(
                (edge) =>
                    metrics.some(
                        (metric) =>
                            metric.catalogSearchUuid ===
                            edge.source.catalogSearchUuid,
                    ) &&
                    metrics.some(
                        (metric) =>
                            metric.catalogSearchUuid ===
                            edge.target.catalogSearchUuid,
                    ),
            );

            return filteredEdges.map((edge) => ({
                id: getEdgeId(edge),
                source: edge.source.catalogSearchUuid,
                target: edge.target.catalogSearchUuid,
                type: edge.createdFrom,
            }));
        }

        return [];
    }, [edges, metrics]);

    // All metrics as nodes (for sidebar and drag-drop)
    const allNodes = useMemo<ExpandedNodeData[]>(() => {
        return metrics.map((metric) => {
            const isEdgeTarget = initialEdges.some(
                (edge) => edge.target === metric.catalogSearchUuid,
            );
            const isEdgeSource = initialEdges.some(
                (edge) => edge.source === metric.catalogSearchUuid,
            );

            return {
                id: metric.catalogSearchUuid,
                position: { x: 0, y: 0 },
                type: 'expanded',
                data: {
                    label: metric.name,
                    tableName: metric.tableName,
                    metricName: metric.name,
                    timeFrame,
                    isEdgeTarget,
                    isEdgeSource,
                },
            };
        });
    }, [metrics, initialEdges, timeFrame]);

    // Only connected nodes for initial canvas render
    const initialNodes = useMemo<ExpandedNodeData[]>(() => {
        const connectedNodeIds = new Set(
            initialEdges.flatMap((edge) => [edge.source, edge.target]),
        );
        return allNodes.filter((node) => connectedNodeIds.has(node.id));
    }, [allNodes, initialEdges]);

    const [currentNodes, setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    const handleEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            const [blockedYamlChanges, allowedChanges] = partition(
                changes,
                (change) => {
                    if (change.type !== 'remove') return false;
                    return getEdge(change.id)?.type === 'yaml';
                },
            );
            if (blockedYamlChanges.length > 0) {
                showToastInfo({
                    title: 'Cannot delete YAML-defined edge',
                    subtitle:
                        'This connection is defined in your dbt YAML files. Update your YAML to remove it.',
                });
            }

            onEdgesChange(allowedChanges);
        },
        [getEdge, onEdgesChange, showToastInfo],
    );

    const applyLayout = useCallback(
        ({ renderTwice = true }: { renderTwice?: boolean } = {}) => {
            // Skip layout if nodes aren't measured yet
            const allNodesMeasured = currentNodes.every(
                (node) => node.measured?.width && node.measured?.height,
            );
            if (!allNodesMeasured && renderTwice) {
                // Wait for nodes to be measured
                setTimeout(() => {
                    applyLayout({ renderTwice: true });
                }, 50);
                return;
            }

            const layout = getNodeLayout(currentNodes, currentEdges);

            setCurrentNodes(layout.nodes);
            setCurrentEdges(layout.edges);
            setIsLayoutReady(true);

            if (renderTwice) {
                setTimeout(() => {
                    applyLayout({ renderTwice: false });
                }, 10);

                return;
            }

            window.requestAnimationFrame(() => {
                void fitView({ maxZoom: 1.2 });
            });
        },
        [currentNodes, currentEdges, setCurrentNodes, setCurrentEdges, fitView],
    );

    const handleNodePositionChange = useCallback(
        (changes: NodePositionChange[]) => {
            return changes.map((c) => {
                const node = getNode(c.id);

                if (!node) {
                    return c;
                }

                return {
                    id: c.id,
                    type: 'replace',
                    item: {
                        ...node,
                        position: c.position ?? node.position,
                    },
                } satisfies NodeReplaceChange<ExpandedNodeData>;
            });
        },
        [getNode],
    );

    const handleNodeChange = useCallback(
        (changes: NodeChange<ExpandedNodeData>[]) => {
            // Only prevent 'replace' changes, allow 'remove' so users can delete nodes
            const preventedChangeTypes: NodeChange<ExpandedNodeData>['type'][] =
                ['replace'];

            const changesWithoutPreventedTypes = changes.filter(
                (c) => !preventedChangeTypes.includes(c.type),
            );

            const positionChanges = changesWithoutPreventedTypes.filter(
                // Position change infer in vscode was correct but not in build, fixed by type assertion
                (c): c is NodePositionChange => c.type === 'position',
            );

            const otherChanges = changesWithoutPreventedTypes.filter(
                (c) => c.type !== 'position',
            );

            const positionChangesToApply =
                handleNodePositionChange(positionChanges);

            onNodesChange([...positionChangesToApply, ...otherChanges]);
        },
        [handleNodePositionChange, onNodesChange],
    );

    const handleConnect = useCallback(
        async (params: Connection) => {
            if (projectUuid) {
                await createMetricsTreeEdge({
                    projectUuid,
                    sourceCatalogSearchUuid: params.source,
                    targetCatalogSearchUuid: params.target,
                });

                setCurrentEdges((edg) => addEdge(params, edg));
                track({
                    name: EventName.METRICS_CATALOG_TREES_EDGE_CREATED,
                    properties: {
                        userId: userUuid,
                        organizationId: organizationUuid,
                        projectId: projectUuid,
                    },
                });
            }
        },
        [
            projectUuid,
            createMetricsTreeEdge,
            track,
            userUuid,
            organizationUuid,
            setCurrentEdges,
        ],
    );

    const handleEdgesDelete = useCallback(
        async (edgesToDelete: Edge[]) => {
            if (projectUuid) {
                const deletableEdges = edgesToDelete.filter(
                    (edge) => edge.type !== 'yaml',
                );
                const promises = deletableEdges.map(async (edge) => {
                    await deleteMetricsTreeEdge({
                        projectUuid,
                        sourceCatalogSearchUuid: edge.source,
                        targetCatalogSearchUuid: edge.target,
                    });

                    track({
                        name: EventName.METRICS_CATALOG_TREES_EDGE_REMOVED,
                        properties: {
                            userId: userUuid,
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                        },
                    });
                });

                await Promise.all(promises);
            }
        },
        [projectUuid, deleteMetricsTreeEdge, track, organizationUuid, userUuid],
    );

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const data = event.dataTransfer.getData('application/reactflow');
            if (!data) return;

            const { catalogSearchUuid } = JSON.parse(data);

            const nodeData = allNodes.find((n) => n.id === catalogSearchUuid);
            if (!nodeData) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            setCurrentNodes((nodes) => {
                if (nodes.some((n) => n.id === catalogSearchUuid)) return nodes;

                const newNode: ExpandedNodeData = {
                    ...nodeData,
                    position,
                };
                return [...nodes, newNode];
            });
        },
        [allNodes, screenToFlowPosition, setCurrentNodes],
    );

    // Reset layout when initial edges or nodes change
    useEffect(() => {
        setCurrentNodes(initialNodes);
        setCurrentEdges(initialEdges);
        setIsLayoutReady(false);
    }, [initialNodes, initialEdges, setCurrentNodes, setCurrentEdges]);

    // Only apply layout when nodes are initialized and the initial layout is not ready
    useEffect(() => {
        if (nodesInitialized && !isLayoutReady && currentNodes.length > 0) {
            applyLayout();
        }
    }, [applyLayout, nodesInitialized, isLayoutReady, currentNodes.length]);

    useEffect(() => {
        setCurrentNodes((nodes) =>
            nodes.map((node) => ({
                ...node,
                data:
                    'timeFrame' in node.data
                        ? { ...node.data, timeFrame }
                        : node.data,
            })),
        );
    }, [timeFrame, setCurrentNodes]);

    // Remove nodes from canvas if they no longer exist in metrics
    const removeNodeChanges = useMemo<NodeRemoveChange[]>(() => {
        return currentNodes
            .filter((node) => !allNodes.some((n) => n.id === node.id))
            .map((node) => ({
                id: node.id,
                type: 'remove',
            }));
    }, [currentNodes, allNodes]);

    useEffect(() => {
        if (removeNodeChanges.length > 0) {
            onNodesChange(removeNodeChanges);
        }
    }, [removeNodeChanges, onNodesChange]);

    const sidebarNodes = useMemo(() => {
        return allNodes.filter(
            (node) => !currentNodes.some((n) => n.id === node.id),
        );
    }, [currentNodes, allNodes]);

    return (
        <Group h="100%" spacing={0} noWrap align="stretch">
            {!viewOnly && <MetricsSidebar nodes={sidebarNodes} />}
            <Box h="100%" sx={{ flex: 1 }}>
                <ReactFlow
                    nodes={currentNodes}
                    edges={currentEdges}
                    fitView
                    attributionPosition="top-right"
                    onNodesChange={handleNodeChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={handleConnect}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    edgesReconnectable={false}
                    onEdgesDelete={handleEdgesDelete}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    nodesConnectable={!viewOnly}
                    nodesDraggable={!viewOnly}
                    elementsSelectable={!viewOnly}
                >
                    <Panel position="top-left" style={{ margin: '14px 27px' }}>
                        <Group spacing="xs">
                            <Text fz={14} fw={500} c="ldGray.6">
                                Canvas mode:
                            </Text>
                            {isTreeModeSwitcherEnabled ? (
                                <TimeFramePicker
                                    value={timeFrame}
                                    onChange={setTimeFrame}
                                />
                            ) : (
                                <Text span fw={500} c="ldGray.7">
                                    Current month to date
                                </Text>
                            )}

                            <ActionIcon
                                component="a"
                                href="https://docs.lightdash.com/guides/metrics-catalog/" // TODO: add link to canvas docs
                                target="_blank"
                                variant="transparent"
                                size="xs"
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="ldGray.6"
                                />
                            </ActionIcon>
                        </Group>
                    </Panel>
                    {!viewOnly && (
                        <Panel position="bottom-left">
                            <Button
                                variant="default"
                                radius="md"
                                onClick={applyLayout}
                                size="xs"
                                sx={{
                                    boxShadow: theme.shadows.subtle,
                                }}
                                leftIcon={
                                    <MantineIcon
                                        color="ldGray.5"
                                        icon={IconLayoutGridRemove}
                                    />
                                }
                            >
                                Clean up
                            </Button>
                        </Panel>
                    )}
                    {!viewOnly && <Background />}
                </ReactFlow>
            </Box>
        </Group>
    );
};

export default Canvas;
