import Dagre from '@dagrejs/dagre';
import {
    type CatalogField,
    type CatalogMetricsTreeEdge,
} from '@lightdash/common';
import { Box } from '@mantine/core';
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
    type Node,
    type NodeChange,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
} from '../../hooks/useMetricsTree';
import MetricTreeConnectedNode from './MetricTreeConnectedNode';
import MetricTreeUnconnectedNode from './MetricTreeUnconnectedNode';

const nodeTypes: NodeTypes = {
    connected: MetricTreeConnectedNode,
    free: MetricTreeUnconnectedNode,
};

type Props = {
    metrics: CatalogField[];
    metricsTree: {
        edges: CatalogMetricsTreeEdge[];
    };
};

enum STATIC_NODE_TYPES {
    UNCONNECTED = 'UNCONNECTED',
}

function getEdgeId(edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>) {
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
}

const getNodeGroups = (nodes: Node[], edges: Edge[]) => {
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

const getNodeLayout = (nodes: Node[], edges: Edge[], _options?: {}) => {
    const { connectedNodes, freeNodes } = getNodeGroups(nodes, edges);

    const treeGraph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(
        () => ({}),
    );
    treeGraph.setGraph({ rankdir: 'TB' });

    edges.forEach((edge) => treeGraph.setEdge(edge.source, edge.target));
    connectedNodes.forEach((node) =>
        treeGraph.setNode(node.id, {
            ...node,
            // TODO: node sizes are hardcoded. We need to do more to have them be dynamic
            width: 200,
            height: 110,
        }),
    );

    Dagre.layout(treeGraph);

    // Draw the connected tree
    const tree = connectedNodes.map((node) => {
        const position = treeGraph.node(node.id);
        const x = position.x - (node.measured?.width ?? 0) / 2;
        const y = position.y - (node.measured?.height ?? 0) / 2;
        return { ...node, type: 'connected', position: { x, y } };
    });

    // Main padding
    const mainPadding = 15;

    // Bounds of grid
    let top = Infinity;
    let left = Infinity;
    let bottom = -Infinity;
    let right = -Infinity;

    // Draw the unconnected grid
    const free = freeNodes.map((node, index) => {
        // TODO: node sizes are hardcoded. We need to do more to have them be dynamic
        const nodeWidth = 170;
        const nodeHeight = 38;

        // TODO: this is an arbitrary offset that looks ok with the
        // basic setup. Placement of the grid will probably need to be
        // more robust and include the tree size
        const leftOffset = -1 * nodeWidth - 70;

        // 3 column grid
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = leftOffset - column * (nodeWidth + mainPadding);
        const y = row * (nodeHeight + mainPadding);

        // Update bounds
        top = Math.min(top, y);
        left = Math.min(left, x);
        bottom = Math.max(bottom, y + nodeHeight);
        right = Math.max(right, x + nodeWidth);

        return {
            ...node,
            type: 'free',
            position: { x, y },
            id: `${node.id}`,
        };
    });

    const groups = [
        {
            id: STATIC_NODE_TYPES.UNCONNECTED,
            data: { label: 'Unconnected nodes' },
            position: { x: left - mainPadding, y: top - mainPadding },
            style: {
                backgroundColor: '#d8c2fa',
                opacity: 0.75,
                height: bottom - top + mainPadding * 2,
                width: right - left + mainPadding * 2,
                pointerEvents: 'none' as const,
                border: '1px solid #ccc',
            },
            type: 'group',
        },
    ];

    return {
        nodes: [...groups, ...tree, ...free],
        edges,
    };
};

const MetricTree: FC<Props> = ({ metrics, metricsTree }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();
    const { fitView } = useReactFlow();
    const nodesInitialized = useNodesInitialized();
    const [layoutReady, setLayoutReady] = useState(false);
    const [edgesChangedInReactFlow, setEdgesChangedInReactFlow] =
        useState(false);

    const initialNodes = useMemo<Node[]>(() => {
        return metrics.map((metric) => ({
            id: metric.catalogSearchUuid,
            position: { x: 0, y: 0 },
            data: { label: metric.name },
        }));
    }, [metrics]);

    const initialEdges = useMemo<Edge[]>(() => {
        // If there are saved edges, use them
        // Only use edges where both source and target are in the metrics array
        if (metricsTree) {
            const edges = metricsTree.edges.filter(
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

            return edges.map((edge) => ({
                id: getEdgeId(edge),
                source: edge.source.catalogSearchUuid,
                target: edge.target.catalogSearchUuid,
            }));
        }

        return [];
    }, [metrics, metricsTree]);

    const [currentNodes, setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    const handleNodeChange = useCallback(
        (changes: NodeChange<Node>[]) => {
            const preventedChangeTypes: NodeChange<Node>['type'][] = [
                'replace',
                'remove',
            ];
            const changesToApply = changes.filter(
                (c) => !preventedChangeTypes.includes(c.type),
            );
            onNodesChange(changesToApply);
        },
        [onNodesChange],
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
                setEdgesChangedInReactFlow(true);
            }
        },
        [projectUuid, createMetricsTreeEdge, setCurrentEdges],
    );

    const handleEdgesDelete = useCallback(
        async (edges: Edge[]) => {
            if (projectUuid) {
                const promises = edges.map((edge) => {
                    return deleteMetricsTreeEdge({
                        projectUuid,
                        sourceCatalogSearchUuid: edge.source,
                        targetCatalogSearchUuid: edge.target,
                    });
                });

                await Promise.all(promises);
                setEdgesChangedInReactFlow(true);
            }
        },
        [deleteMetricsTreeEdge, projectUuid],
    );

    const onLayout = useCallback(() => {
        const layout = getNodeLayout(currentNodes, currentEdges);

        setCurrentNodes([...layout.nodes]);
        setCurrentEdges([...layout.edges]);

        setLayoutReady(true);
    }, [currentNodes, currentEdges, setCurrentNodes, setCurrentEdges]);

    // Runs layout when the nodes are initialized
    useEffect(() => {
        if (!nodesInitialized || layoutReady) {
            return;
        }

        onLayout();
    }, [onLayout, layoutReady, nodesInitialized, fitView]);

    // Fits the view when the layout is ready
    useEffect(() => {
        if (layoutReady) {
            window.requestAnimationFrame(async () => {
                await fitView();
            });
        }
    }, [layoutReady, fitView]);

    useEffect(() => {
        const addNodeChanges: NodeChange<Node>[] = initialNodes
            .filter((node) => !currentNodes.some((n) => n.id === node.id))
            .map((node) => ({
                id: node.id,
                type: 'add',
                item: node,
            }));

        const removeNodeChanges: NodeChange<Node>[] = currentNodes
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
            setLayoutReady(false);
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

        if (
            (addEdgeChanges.length > 0 || removeEdgeChanges.length > 0) &&
            !edgesChangedInReactFlow
        ) {
            onEdgesChange([...addEdgeChanges, ...removeEdgeChanges]);
            setLayoutReady(false);
        }
    }, [initialEdges, currentEdges, onEdgesChange, edgesChangedInReactFlow]);

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
                nodeTypes={nodeTypes}
            >
                <Panel position="bottom-left">
                    <button onClick={() => onLayout()}>Clean up</button>
                </Panel>
                <Background />
            </ReactFlow>
        </Box>
    );
};

export default MetricTree;
