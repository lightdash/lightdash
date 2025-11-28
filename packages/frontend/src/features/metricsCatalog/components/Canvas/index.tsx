import Dagre from '@dagrejs/dagre';
import {
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
    type EdgeTypes,
    type NodeAddChange,
    type NodeChange,
    type NodePositionChange,
    type NodeRemoveChange,
    type NodeReplaceChange,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
} from '../../hooks/useMetricsTree';
import { useTreeNodePosition } from '../../hooks/useTreeNodePosition';
import DefaultEdge from './TreeComponents/edges/DefaultEdge';
import CollapsedNode, {
    type CollapsedNodeData,
} from './TreeComponents/nodes/CollapsedNode';
import ExpandedNode, {
    type ExpandedNodeData,
} from './TreeComponents/nodes/ExpandedNode';
import FreeGroupNode, {
    type FreeGroupNodeData,
} from './TreeComponents/nodes/FreeGroupNode';

enum MetricTreeEdgeType {
    DEFAULT = 'default',
}

const metricTreeEdgeTypes: EdgeTypes = {
    [MetricTreeEdgeType.DEFAULT]: DefaultEdge,
};

enum MetricTreeNodeType {
    EXPANDED = 'expanded',
    COLLAPSED = 'collapsed',
    FREE_GROUP = 'free_group',
}

const metricTreeNodeTypes: NodeTypes = {
    [MetricTreeNodeType.EXPANDED]: ExpandedNode,
    [MetricTreeNodeType.COLLAPSED]: CollapsedNode,
    [MetricTreeNodeType.FREE_GROUP]: FreeGroupNode,
};

type Props = {
    metrics: CatalogField[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly?: boolean;
};

enum STATIC_NODE_TYPES {
    UNCONNECTED = 'UNCONNECTED',
}

const DEFAULT_TIME_FRAME = TimeFrames.MONTH; // TODO: this should be dynamic

type MetricTreeNode = ExpandedNodeData | CollapsedNodeData | FreeGroupNodeData;

function getEdgeId(edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>) {
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
}

const getNodeGroups = (nodes: MetricTreeNode[], edges: Edge[]) => {
    const connectedNodeIds = new Set();

    edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    const connectedNodes = nodes.filter((node): node is ExpandedNodeData =>
        connectedNodeIds.has(node.id),
    );

    const freeNodes = nodes.filter(
        (node): node is CollapsedNodeData =>
            !connectedNodeIds.has(node.id) &&
            node.id !== STATIC_NODE_TYPES.UNCONNECTED,
    );

    return {
        connectedNodes,
        freeNodes,
    };
};

const getNodeLayout = (
    nodes: MetricTreeNode[],
    edges: Edge[],
): {
    nodes: MetricTreeNode[];
    edges: Edge[];
} => {
    const { connectedNodes, freeNodes } = getNodeGroups(nodes, edges);
    const treeGraph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(
        () => ({}),
    );
    treeGraph.setGraph({ rankdir: 'TB' });

    // Main padding
    const mainPadding = 8;
    const freeGroupTextHeight = 50;

    // Organize nodes into a 2D grid array first
    const GRID_COLUMNS = 2;
    const freeNodesGridArray: CollapsedNodeData[][] = [];

    freeNodes.forEach((node, index) => {
        const row = Math.floor(index / GRID_COLUMNS);
        if (!freeNodesGridArray[row]) {
            freeNodesGridArray[row] = [];
        }
        freeNodesGridArray[row].push(node);
    });

    // Draw the unconnected grid
    const free = freeNodesGridArray.flatMap((row, rowIndex) =>
        row.map<CollapsedNodeData>((node, colIndex) => {
            // Calculate x position based on widths of nodes in same row
            const allPrevNodesInRowWidths = row
                .slice(0, colIndex)
                .map((n) => n.measured?.width ?? 0)
                .reduce((acc, width) => acc + width + mainPadding, 0);

            const x = 1 * colIndex + allPrevNodesInRowWidths;

            // Calculate y position based on sum of previous rows' max height
            const allPrevRowsMaxHeights = freeNodesGridArray
                .slice(0, rowIndex)
                .map((r) => Math.max(...r.map((n) => n.measured?.height ?? 0)))
                .reduce((acc, height) => acc + height + mainPadding, 0);

            const y =
                1 * rowIndex +
                allPrevRowsMaxHeights +
                freeGroupTextHeight +
                mainPadding;

            return {
                ...node,
                type: MetricTreeNodeType.COLLAPSED,
                position: { x, y },
            } satisfies CollapsedNodeData;
        }),
    );

    let unconnectedGroup: FreeGroupNodeData | undefined;
    let unconnectedGroupWidth = 0;
    let unconnectedGroupHeight = 0;

    if (free.length) {
        // Group bounds
        unconnectedGroupWidth = Math.max(
            Math.max(
                ...free.map(
                    (node) => node.position.x + (node.measured?.width ?? 0),
                ),
            ) +
                mainPadding * 2,
            300, // Don't allow the free group to be too small, otherwise it will make the text overflow too much
        );

        unconnectedGroupHeight =
            Math.max(
                ...free.map(
                    (node) => node.position.y + (node.measured?.height ?? 0),
                ),
            ) +
            mainPadding * 2;

        unconnectedGroup = free.length
            ? ({
                  id: STATIC_NODE_TYPES.UNCONNECTED,
                  position: { x: -mainPadding, y: -mainPadding },
                  data: {},
                  style: {
                      height: unconnectedGroupHeight,
                      width: unconnectedGroupWidth,
                  },
                  type: MetricTreeNodeType.FREE_GROUP,
                  selectable: false,
              } satisfies FreeGroupNodeData)
            : undefined;
    }

    const groups = unconnectedGroup ? [unconnectedGroup] : [];

    // Draw the connected tree
    edges.forEach((edge) => treeGraph.setEdge(edge.source, edge.target));

    connectedNodes.forEach((node) =>
        treeGraph.setNode(node.id, {
            ...node,
            width: node.measured?.width ?? 0,
            height: node.measured?.height ?? 0,
        }),
    );

    Dagre.layout(treeGraph);

    // Draw the connected tree
    const tree = connectedNodes.map<MetricTreeNode>((node) => {
        const position = treeGraph.node(node.id);
        const x = position.x - (node.measured?.width ?? 0) / 2;
        const y = position.y - (node.measured?.height ?? 0) / 2;
        const xFromUnconnectedGroup =
            unconnectedGroupWidth + x + freeGroupTextHeight;
        const yFromUnconnectedGroup = -mainPadding + y;

        return {
            ...node,
            type: MetricTreeNodeType.EXPANDED,
            position: {
                x: xFromUnconnectedGroup,
                y: yFromUnconnectedGroup,
            },
        };
    });

    return {
        nodes: [...groups, ...tree, ...free],
        edges,
    };
};

const Canvas: FC<Props> = ({ metrics, edges, viewOnly }) => {
    const { track } = useTracking();
    const theme = useMantineTheme();
    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );

    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();
    const { fitView, getNode } = useReactFlow<MetricTreeNode, Edge>();
    const nodesInitialized = useNodesInitialized();
    const [isLayoutReady, setIsLayoutReady] = useState(false);

    const { containsNode: unconnectGroupContainsNode } = useTreeNodePosition(
        STATIC_NODE_TYPES.UNCONNECTED,
    );

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
                type: MetricTreeEdgeType.DEFAULT,
            }));
        }

        return [];
    }, [edges, metrics]);

    const initialNodes = useMemo<MetricTreeNode[]>(() => {
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
                type:
                    isEdgeTarget || isEdgeSource
                        ? MetricTreeNodeType.EXPANDED
                        : MetricTreeNodeType.COLLAPSED,
                data: {
                    label: metric.name,
                    tableName: metric.tableName,
                    metricName: metric.name,
                    timeFrame: DEFAULT_TIME_FRAME,
                    isEdgeTarget,
                    isEdgeSource,
                },
            };
        });
    }, [metrics, initialEdges]);

    const [currentNodes, setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    const getNodeEdges = useCallback(
        (id: string) => {
            return currentEdges.filter(
                (e) => e.source === id || e.target === id,
            );
        },
        [currentEdges],
    );

    const applyLayout = useCallback(
        ({ renderTwice = true }: { renderTwice?: boolean } = {}) => {
            const layout = getNodeLayout(currentNodes, currentEdges);

            setCurrentNodes(layout.nodes);
            setCurrentEdges(layout.edges);
            setIsLayoutReady(true); // Prevent layout from being applied again - relevant to be set before renderTwice because of setTimeout otherwise it goes into an infinite loop

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
            const changesToApply = changes
                .filter((c) => c.id !== STATIC_NODE_TYPES.UNCONNECTED)
                .map((c) => {
                    const node = getNode(c.id);

                    if (!node) {
                        return c;
                    }

                    const nodeEdges = getNodeEdges(c.id);

                    if (unconnectGroupContainsNode(c.id) && !nodeEdges.length) {
                        return {
                            id: c.id,
                            type: 'replace',
                            item: {
                                ...node,
                                type: MetricTreeNodeType.COLLAPSED,
                                position: c.position ?? node.position,
                            },
                        } satisfies NodeReplaceChange<MetricTreeNode>;
                    }

                    return {
                        id: c.id,
                        type: 'replace',
                        item: {
                            ...node,
                            type: MetricTreeNodeType.EXPANDED,
                            position: c.position ?? node.position,
                        },
                    } satisfies NodeReplaceChange<MetricTreeNode>;
                });

            return changesToApply;
        },
        [getNode, getNodeEdges, unconnectGroupContainsNode],
    );

    const handleNodeChange = useCallback(
        (changes: NodeChange<MetricTreeNode>[]) => {
            const preventedChangeTypes: NodeChange<MetricTreeNode>['type'][] = [
                'replace',
                'remove',
            ];

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
                const promises = edgesToDelete.map(async (edge) => {
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

    // Reset layout when initial edges or nodes change
    useEffect(() => {
        setCurrentEdges(initialEdges);
        setIsLayoutReady(false);
    }, [initialEdges, setCurrentEdges]);

    // Only apply layout when nodes are initialized and the initial layout is not ready
    useEffect(() => {
        if (nodesInitialized && !isLayoutReady) {
            applyLayout();
        }
    }, [applyLayout, nodesInitialized, isLayoutReady]);

    const addNodeChanges = useMemo<NodeAddChange<MetricTreeNode>[]>(() => {
        return initialNodes
            .filter((node) => !currentNodes.some((n) => n.id === node.id))
            .map((node) => ({
                id: node.id,
                type: 'add',
                item: node,
            }));
    }, [initialNodes, currentNodes]);

    const removeNodeChanges = useMemo<NodeRemoveChange[]>(() => {
        return currentNodes
            .filter(
                (node) =>
                    node.id !== STATIC_NODE_TYPES.UNCONNECTED &&
                    !initialNodes.some((n) => n.id === node.id),
            )
            .map((node) => ({
                id: node.id,
                type: 'remove',
            }));
    }, [currentNodes, initialNodes]);

    useEffect(() => {
        if (addNodeChanges.length > 0 || removeNodeChanges.length > 0) {
            onNodesChange([...addNodeChanges, ...removeNodeChanges]);
        }
    }, [addNodeChanges, removeNodeChanges, onNodesChange]);

    return (
        <Box h="100%">
            <ReactFlow
                nodes={currentNodes}
                edges={currentEdges}
                fitView
                attributionPosition="top-right"
                onNodesChange={handleNodeChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                edgesReconnectable={false}
                onEdgesDelete={handleEdgesDelete}
                nodeTypes={metricTreeNodeTypes}
                edgeTypes={metricTreeEdgeTypes}
                nodesConnectable={!viewOnly}
                nodesDraggable={!viewOnly}
                elementsSelectable={!viewOnly}
            >
                <Panel position="top-left" style={{ margin: '14px 27px' }}>
                    <Group spacing="xs">
                        <Text fz={14} fw={600} c="ldGray.7">
                            <Text span fw={500} c="ldGray.6">
                                Canvas mode:
                            </Text>{' '}
                            Current month to date
                        </Text>
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
    );
};

export default Canvas;
