import Dagre from '@dagrejs/dagre';
import {
    DEFAULT_METRICS_EXPLORER_TIME_INTERVAL,
    type CatalogField,
    type CatalogMetricsTreeEdge,
} from '@lightdash/common';
import { Box, Button, useMantineTheme, type MantineTheme } from '@mantine/core';
import { IconLayoutGridRemove } from '@tabler/icons-react';
import {
    addEdge,
    Background,
    Panel,
    ReactFlow,
    useEdgesState,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
    type Connection,
    type Edge,
    type EdgeChange,
    type NodeChange,
    type NodePositionChange,
    type NodeReplaceChange,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
} from '../../hooks/useMetricsTree';
import { useTreeNodePosition } from '../../hooks/useTreeNodePosition';
import MetricTreeExpandedNode, {
    type MetricTreeExpandedNodeData,
} from './MetricTreeExpandedNode';
import MetricTreeCollapsedNode, {
    type MetricTreeCollapsedNodeData,
} from './MetricTreeCollapsedNode';

enum MetricTreeNodeType {
    EXPANDED = 'expanded',
    COLLAPSED = 'collapsed',
}

const metricTreeNodeTypes: NodeTypes = {
    [MetricTreeNodeType.EXPANDED]: MetricTreeExpandedNode,
    [MetricTreeNodeType.COLLAPSED]: MetricTreeCollapsedNode,
};

type Props = {
    metrics: CatalogField[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly?: boolean;
};

enum STATIC_NODE_TYPES {
    UNCONNECTED = 'UNCONNECTED',
}

const DEFAULT_TIME_FRAME = DEFAULT_METRICS_EXPLORER_TIME_INTERVAL; // TODO: this should be dynamic

type MetricTreeNode = MetricTreeExpandedNodeData | MetricTreeCollapsedNodeData;

function getEdgeId(edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>) {
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
}

const getNodeGroups = (nodes: MetricTreeNode[], edges: Edge[]) => {
    const connectedNodeIds = new Set();

    edges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    const connectedNodes = nodes.filter((node) =>
        connectedNodeIds.has(node.id),
    );
    const freeNodes = nodes.filter(
        (node) => !connectedNodeIds.has(node.id) && node.type !== 'group',
    );

    return {
        connectedNodes,
        freeNodes,
    };
};

const getNodeLayout = (
    nodes: MetricTreeNode[],
    edges: Edge[],
    theme: MantineTheme,
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
    const mainPadding = 15;

    // Organize nodes into a 2D grid array first
    const GRID_COLUMNS = 3;
    const gridArray: MetricTreeNode[][] = [];

    freeNodes.forEach((node, index) => {
        const row = Math.floor(index / GRID_COLUMNS);
        if (!gridArray[row]) {
            gridArray[row] = [];
        }
        gridArray[row].push(node);
    });

    // Draw the unconnected grid
    const free = gridArray.flatMap((row, rowIndex) =>
        row.map<MetricTreeCollapsedNodeData>((node, colIndex) => {
            // Calculate x position based on widths of nodes in same column
            const prevNodeInRow = gridArray[rowIndex][colIndex - 1];
            const x = prevNodeInRow
                ? prevNodeInRow.position.x +
                  (prevNodeInRow.measured?.width ?? 0) +
                  mainPadding
                : 0;

            // Calculate y position based on sum of previous rows' max heights
            const prevRow = gridArray[rowIndex - 1];
            const y = prevRow
                ? Math.max(
                      ...prevRow.map(
                          (n) =>
                              n.position.y +
                              (n.measured?.height ?? 0) +
                              mainPadding,
                      ),
                  )
                : 0;

            return {
                ...node,
                type: MetricTreeNodeType.COLLAPSED,
                position: { x, y },
                id: `${node.id}`,
            };
        }),
    );

    let unconnectedGroup: MetricTreeNode | undefined;
    let unconnectedGroupWidth = 0;
    let unconnectedGroupHeight = 0;

    if (free.length) {
        // Group bounds
        unconnectedGroupWidth =
            Math.max(
                ...free.map(
                    (node) => node.position.x + (node.measured?.width ?? 0),
                ),
            ) +
            mainPadding * 2;

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
                  data: { label: 'Unconnected nodes' },
                  position: { x: -mainPadding, y: -mainPadding },
                  style: {
                      backgroundColor: theme.fn.lighten(
                          theme.colors.gray[0],
                          0.7,
                      ),
                      border: `1px solid ${theme.colors.gray[3]}`,
                      boxShadow: theme.shadows.subtle,
                      height: unconnectedGroupHeight,
                      width: unconnectedGroupWidth,
                      pointerEvents: 'none' as const,
                      borderRadius: theme.radius.md,
                      padding: theme.spacing.md,
                  },
                  type: 'group',
              } satisfies MetricTreeNode)
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
            unconnectedGroupWidth + x + 3 * mainPadding;
        const yFromUnconnectedGroup = unconnectedGroup?.position.y ?? 0 + y;

        return {
            ...node,
            type: MetricTreeNodeType.EXPANDED,
            position: { x: xFromUnconnectedGroup, y: yFromUnconnectedGroup },
        };
    });

    return {
        nodes: [...groups, ...tree, ...free],
        edges,
    };
};

const MetricTree: FC<Props> = ({ metrics, edges, viewOnly }) => {
    const theme = useMantineTheme();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();
    const { fitView, getNode } = useReactFlow<MetricTreeNode, Edge>();
    const nodesInitialized = useNodesInitialized();
    const [layoutState, setLayoutState] = useState({
        isReady: false,
        shouldFitView: true,
    });
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

    const handleNodePositionChange = useCallback(
        (changes: NodePositionChange[]) => {
            const changesToApply = changes.map((c) => {
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

                setCurrentEdges((els) => addEdge(params, els));
            }
        },
        [projectUuid, createMetricsTreeEdge, setCurrentEdges],
    );

    const handleEdgesDelete = useCallback(
        async (edgesToDelete: Edge[]) => {
            if (projectUuid) {
                const promises = edgesToDelete.map((edge) => {
                    return deleteMetricsTreeEdge({
                        projectUuid,
                        sourceCatalogSearchUuid: edge.source,
                        targetCatalogSearchUuid: edge.target,
                    });
                });

                await Promise.all(promises);
            }
        },
        [projectUuid, deleteMetricsTreeEdge],
    );

    const onLayout = useCallback(() => {
        const layout = getNodeLayout(currentNodes, currentEdges, theme);

        setCurrentNodes(layout.nodes);
        setCurrentEdges(layout.edges);

        setLayoutState((prev) => ({
            ...prev,
            isReady: true,
        }));
    }, [currentNodes, currentEdges, setCurrentNodes, setCurrentEdges, theme]);

    // Runs layout when the nodes are initialized
    useEffect(() => {
        if (!nodesInitialized || layoutState.isReady) {
            return;
        }

        onLayout();
    }, [onLayout, layoutState.isReady, nodesInitialized, fitView]);

    // Fits the view when the layout is ready
    useEffect(() => {
        if (layoutState.isReady && layoutState.shouldFitView) {
            window.requestAnimationFrame(async () => {
                await fitView();
            });

            setLayoutState((prev) => ({
                ...prev,
                shouldFitView: false,
            }));
        }
    }, [layoutState, fitView]);

    useEffect(() => {
        const addNodeChanges: NodeChange<MetricTreeNode>[] = initialNodes
            .filter((node) => !currentNodes.some((n) => n.id === node.id))
            .map((node) => ({
                id: node.id,
                type: 'add',
                item: node,
            }));

        const removeNodeChanges: NodeChange<MetricTreeNode>[] = currentNodes
            .filter(
                (node) =>
                    node.id !== STATIC_NODE_TYPES.UNCONNECTED &&
                    !initialNodes.some((n) => n.id === node.id),
            )
            .map((node) => ({
                id: node.id,
                type: 'remove',
            }));

        if (addNodeChanges.length > 0 || removeNodeChanges.length > 0) {
            onNodesChange([...addNodeChanges, ...removeNodeChanges]);
            setLayoutState({
                isReady: false,
                shouldFitView: true,
            });
        }
    }, [initialNodes, currentNodes, onNodesChange]);

    useEffect(() => {
        const addEdgeChanges: EdgeChange<Edge>[] = initialEdges
            .filter((edge) => !currentEdges.some((e) => e.id === edge.id))
            .map((edge) => ({
                id: edge.id,
                type: 'add',
                item: edge,
            }));

        const removeEdgeChanges: EdgeChange<Edge>[] = currentEdges
            .filter((edge) => !initialEdges.some((e) => e.id === edge.id))
            .map((edge) => ({
                id: edge.id,
                type: 'remove',
            }));

        if (addEdgeChanges.length > 0 || removeEdgeChanges.length > 0) {
            onEdgesChange([...addEdgeChanges, ...removeEdgeChanges]);
            setLayoutState({
                isReady: false,
                shouldFitView: false,
            });
        }
    }, [currentEdges, initialEdges, onEdgesChange]);

    const cleanUpLayout = useCallback(() => {
        setLayoutState({
            isReady: false,
            shouldFitView: true,
        });
    }, [setLayoutState]);

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
                nodesConnectable={!viewOnly}
                nodesDraggable={!viewOnly}
                elementsSelectable={!viewOnly}
            >
                {!viewOnly && (
                    <Panel position="bottom-left">
                        <Button
                            variant="default"
                            radius="md"
                            onClick={cleanUpLayout}
                            size="xs"
                            sx={{
                                boxShadow: theme.shadows.subtle,
                            }}
                            leftIcon={
                                <MantineIcon
                                    color="gray.5"
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

export default MetricTree;
