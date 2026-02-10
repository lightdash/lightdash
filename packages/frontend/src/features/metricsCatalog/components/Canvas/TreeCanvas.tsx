import Dagre from '@dagrejs/dagre';
import { TimeFrames, type CatalogMetricsTreeEdge } from '@lightdash/common';
import { Box, Button, Center, Group, Loader, Text } from '@mantine-8/core';
import { IconLayoutGridRemove } from '@tabler/icons-react';
import {
    Background,
    MarkerType,
    ReactFlow,
    Panel as ReactFlowPanel,
    ReactFlowProvider,
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
import { PanelGroup } from 'react-resizable-panels';
import MantineIcon from '../../../../components/common/MantineIcon';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import useToaster from '../../../../hooks/toaster/useToaster';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
} from '../../hooks/useMetricsTree';
import { useMetricsTreeDetails } from '../../hooks/useMetricsTrees';
import styles from './Canvas.module.css';
import MetricsSidebar from './MetricsSidebar';
import DefaultEdge from './TreeComponents/edges/DefaultEdge';
import ExpandedNode, {
    type ExpandedNodeData,
} from './TreeComponents/nodes/ExpandedNode';

const edgeTypes: EdgeTypes = { yaml: DefaultEdge, ui: DefaultEdge };
const nodeTypes: NodeTypes = { expanded: ExpandedNode };

function getEdgeId(edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>) {
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
}

const getNodeLayout = (
    nodes: ExpandedNodeData[],
    edges: Edge[],
): {
    nodes: ExpandedNodeData[];
    edges: Edge[];
} => {
    const connectedNodeIds = new Set<string>();
    edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    const connectedNodes = nodes.filter((node) =>
        connectedNodeIds.has(node.id),
    );
    const freeNodes = nodes.filter((node) => !connectedNodeIds.has(node.id));

    const treeGraph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(
        () => ({}),
    );
    treeGraph.setGraph({ rankdir: 'TB', ranksep: 100 });

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

    return {
        nodes: [...layoutedConnectedNodes, ...freeNodes],
        edges,
    };
};

type TreeCanvasInnerProps = {
    metricsTreeUuid: string;
    viewOnly: boolean;
};

const TreeCanvasInner: FC<TreeCanvasInnerProps> = ({
    metricsTreeUuid,
    viewOnly,
}) => {
    const { track } = useTracking();
    const [userUuid, projectUuid, organizationUuid] = useAppSelector(
        ({ metricsCatalog }) => [
            metricsCatalog.user?.userUuid,
            metricsCatalog.projectUuid,
            metricsCatalog.organizationUuid,
        ],
    );

    const { data: treeDetails, isLoading } = useMetricsTreeDetails(
        projectUuid,
        metricsTreeUuid,
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

    const initialEdges = useMemo<Edge[]>(() => {
        if (!treeDetails?.edges) return [];
        return treeDetails.edges.map((edge) => ({
            id: getEdgeId(edge),
            source: edge.source.catalogSearchUuid,
            target: edge.target.catalogSearchUuid,
            type: edge.createdFrom,
            markerEnd: { type: MarkerType.ArrowClosed },
        }));
    }, [treeDetails?.edges]);

    const allNodes = useMemo<ExpandedNodeData[]>(() => {
        if (!treeDetails?.nodes) return [];
        return treeDetails.nodes.map((node) => {
            const isEdgeTarget = initialEdges.some(
                (edge) => edge.target === node.catalogSearchUuid,
            );
            const isEdgeSource = initialEdges.some(
                (edge) => edge.source === node.catalogSearchUuid,
            );

            // Use saved positions if available
            const hasSavedPosition =
                node.xPosition !== null && node.yPosition !== null;

            return {
                id: node.catalogSearchUuid,
                position: hasSavedPosition
                    ? { x: node.xPosition!, y: node.yPosition! }
                    : { x: 0, y: 0 },
                type: 'expanded',
                data: {
                    label: node.name,
                    tableName: node.tableName,
                    metricName: node.name,
                    timeFrame: TimeFrames.MONTH,
                    rollingDays: undefined,
                    isEdgeTarget,
                    isEdgeSource,
                },
            };
        });
    }, [treeDetails?.nodes, initialEdges]);

    // For tree canvas, show all nodes on canvas (not just connected)
    const initialNodes = useMemo<ExpandedNodeData[]>(
        () => allNodes,
        [allNodes],
    );

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

    // Check if any nodes have saved positions
    const hasSavedPositions = useMemo(
        () =>
            treeDetails?.nodes.some(
                (n) => n.xPosition !== null && n.yPosition !== null,
            ) ?? false,
        [treeDetails?.nodes],
    );

    const applyLayout = useCallback(
        ({
            renderTwice = true,
            removeUnconnected = false,
        }: { renderTwice?: boolean; removeUnconnected?: boolean } = {}) => {
            const nodesToLayout = removeUnconnected
                ? currentNodes.filter((node) =>
                      currentEdges.some(
                          (edge) =>
                              edge.source === node.id ||
                              edge.target === node.id,
                      ),
                  )
                : currentNodes;

            const allNodesMeasured = nodesToLayout.every(
                (node) => node.measured?.width && node.measured?.height,
            );
            if (!allNodesMeasured && renderTwice) {
                setTimeout(() => {
                    applyLayout({ renderTwice: true, removeUnconnected });
                }, 50);
                return;
            }

            const layout = getNodeLayout(nodesToLayout, currentEdges);
            setCurrentNodes(layout.nodes);
            setCurrentEdges(layout.edges);
            setIsLayoutReady(true);

            if (renderTwice) {
                setTimeout(() => {
                    applyLayout({ renderTwice: false, removeUnconnected });
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
                if (!node) return c;
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
            const preventedChangeTypes: NodeChange<ExpandedNodeData>['type'][] =
                ['replace'];
            const changesWithoutPreventedTypes = changes.filter(
                (c) => !preventedChangeTypes.includes(c.type),
            );
            const positionChanges = changesWithoutPreventedTypes.filter(
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
                setCurrentEdges((edg) =>
                    addEdge(
                        {
                            ...params,
                            markerEnd: { type: MarkerType.ArrowClosed },
                        },
                        edg,
                    ),
                );
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

            let parsed: { catalogSearchUuid: string };
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }

            const nodeData = allNodes.find(
                (n) => n.id === parsed.catalogSearchUuid,
            );
            if (!nodeData) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            setCurrentNodes((nodes) => {
                if (nodes.some((n) => n.id === parsed.catalogSearchUuid))
                    return nodes;
                const newNode: ExpandedNodeData = {
                    ...nodeData,
                    position,
                };
                return [...nodes, newNode];
            });
        },
        [allNodes, screenToFlowPosition, setCurrentNodes],
    );

    // Reset layout when tree data changes
    useEffect(() => {
        setCurrentNodes(initialNodes);
        setCurrentEdges(initialEdges);
        setIsLayoutReady(false);
    }, [initialNodes, initialEdges, setCurrentNodes, setCurrentEdges]);

    // Apply Dagre layout only when nodes don't have saved positions
    useEffect(() => {
        if (
            nodesInitialized &&
            !isLayoutReady &&
            currentNodes.length > 0 &&
            !hasSavedPositions
        ) {
            applyLayout();
        } else if (
            nodesInitialized &&
            !isLayoutReady &&
            currentNodes.length > 0 &&
            hasSavedPositions
        ) {
            setIsLayoutReady(true);
            window.requestAnimationFrame(() => {
                void fitView({ maxZoom: 1.2 });
            });
        }
    }, [
        applyLayout,
        nodesInitialized,
        isLayoutReady,
        currentNodes.length,
        hasSavedPositions,
        fitView,
    ]);

    // Remove nodes from canvas if they no longer exist
    const removeNodeChanges = useMemo<NodeRemoveChange[]>(() => {
        return currentNodes
            .filter((node) => !allNodes.some((n) => n.id === node.id))
            .map((node) => ({ id: node.id, type: 'remove' }));
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

    if (isLoading) {
        return (
            <Center h="100%">
                <Loader />
            </Center>
        );
    }

    if (!treeDetails) {
        return (
            <SuboptimalState
                title="Tree not found"
                description="The selected tree could not be loaded"
            />
        );
    }

    if (treeDetails.nodes.length === 0) {
        return (
            <SuboptimalState
                title="Empty tree"
                description="This tree has no metrics yet. Switch to edit mode to add metrics."
            />
        );
    }

    return (
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
            {!viewOnly && <MetricsSidebar nodes={sidebarNodes} />}
            <Box style={{ flex: 1 }}>
                <ReactFlow
                    className={styles.reactFlow}
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
                    <ReactFlowPanel
                        position="top-left"
                        style={{ margin: '14px 27px' }}
                    >
                        <Group gap="xs">
                            <Text fz={14} fw={500} c="ldGray.6">
                                Current month to date
                            </Text>
                        </Group>
                    </ReactFlowPanel>
                    {!viewOnly && (
                        <ReactFlowPanel position="bottom-left">
                            <Button
                                variant="default"
                                radius="md"
                                onClick={() =>
                                    applyLayout({ removeUnconnected: true })
                                }
                                size="xs"
                                leftSection={
                                    <MantineIcon
                                        color="ldGray.5"
                                        icon={IconLayoutGridRemove}
                                    />
                                }
                            >
                                Clean up
                            </Button>
                        </ReactFlowPanel>
                    )}
                    {!viewOnly && <Background />}
                </ReactFlow>
            </Box>
        </PanelGroup>
    );
};

type TreeCanvasProps = {
    metricsTreeUuid: string;
    viewOnly: boolean;
};

const TreeCanvas: FC<TreeCanvasProps> = ({ metricsTreeUuid, viewOnly }) => {
    return (
        <Box w="100%" h="calc(100dvh - 350px)" mih={600}>
            <ReactFlowProvider>
                <TreeCanvasInner
                    metricsTreeUuid={metricsTreeUuid}
                    viewOnly={viewOnly}
                />
            </ReactFlowProvider>
        </Box>
    );
};

export default TreeCanvas;
