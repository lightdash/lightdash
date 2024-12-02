import Dagre from '@dagrejs/dagre';
import {
    getMetricsTreeNodeId,
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
    useNodesState,
    useReactFlow,
    type Connection,
    type Edge,
    type Node,
    type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
    useMetricsTree,
} from '../../hooks/useMetricsTree';

type Props = {
    metrics: CatalogField[];
};

function getEdgeId(edge: Pick<CatalogMetricsTreeEdge, 'source' | 'target'>) {
    const sourceId = getMetricsTreeNodeId(edge.source);
    const targetId = getMetricsTreeNodeId(edge.target);
    return `${sourceId}_${targetId}`;
}

const getNodeLayout = (
    connectedNodes: Node[],
    freeNodes: Node[],
    edges: Edge[],
    _options?: {},
) => {
    const treeGraph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(
        () => ({}),
    );
    treeGraph.setGraph({ rankdir: 'TB' });

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
    const tree = connectedNodes.map((node) => {
        const position = treeGraph.node(node.id);
        const x = position.x - (node.measured?.width ?? 0) / 2;
        const y = position.y - (node.measured?.height ?? 0) / 2;
        return { ...node, position: { x, y } };
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
        const nodeWidth = node?.measured?.width ?? 0;
        const nodeHeight = node?.measured?.height ?? 0;

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

        return { ...node, position: { x, y }, id: `${node.id}` };
    });

    console.log({ top, left, bottom, right });

    const groups = [
        {
            id: 'unconnected',
            data: { label: 'Unconnected nodes' },
            position: { x: left - mainPadding, y: top - mainPadding },
            style: {
                backgroundColor: 'rgba(255, 0, 255, 0.2)',
                height: bottom - top + mainPadding * 2,
                width: right - left + mainPadding * 2,
                pointerEvents: 'none' as const,
            },
            type: 'group',
        },
    ];

    return {
        nodes: [...groups, ...tree, ...free],
        edges,
    };
};

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

    console.log({ connectedNodes, freeNodes, nodes });

    return {
        connectedNodes,
        freeNodes,
    };
};

const MetricTree: FC<Props> = ({ metrics }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { data: metricsTree } = useMetricsTree(projectUuid);
    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();
    const { fitView } = useReactFlow();

    const initialNodes = useMemo<Node[]>(() => {
        return metrics.map((metric) => ({
            id: getMetricsTreeNodeId(metric),
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
                            getMetricsTreeNodeId(metric) ===
                            getMetricsTreeNodeId(edge.source),
                    ) &&
                    metrics.some(
                        (metric) =>
                            getMetricsTreeNodeId(metric) ===
                            getMetricsTreeNodeId(edge.target),
                    ),
            );

            return edges.map((edge) => ({
                id: getEdgeId(edge),
                source: getMetricsTreeNodeId(edge.source),
                target: getMetricsTreeNodeId(edge.target),
            }));
        }

        return [];
    }, [metrics, metricsTree]);

    const [currentNodes, setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    const { connectedNodes, freeNodes } = useMemo(() => {
        return getNodeGroups(currentNodes, currentEdges);
    }, [currentNodes, currentEdges]);

    // Set the current edges to the initial edges in the case that the request for metrics tree is slow
    useEffect(() => {
        setCurrentEdges(initialEdges);
    }, [initialEdges, setCurrentEdges]);

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
                    sourceMetricId: params.source,
                    targetMetricId: params.target,
                });

                setCurrentEdges((els) => addEdge(params, els));
            }
        },
        [setCurrentEdges, createMetricsTreeEdge, projectUuid],
    );

    const handleEdgesDelete = useCallback(
        async (edges: Edge[]) => {
            if (projectUuid) {
                const promises = edges.map((edge) => {
                    return deleteMetricsTreeEdge({
                        projectUuid,
                        sourceMetricId: edge.source,
                        targetMetricId: edge.target,
                    });
                });

                await Promise.all(promises);
            }
        },
        [deleteMetricsTreeEdge, projectUuid],
    );

    const [hasLayout, setHasLayout] = useState(false);
    const onLayout = useCallback(() => {
        const layout = getNodeLayout(connectedNodes, freeNodes, currentEdges);

        setCurrentNodes([...layout.nodes]);
        setCurrentEdges([...layout.edges]);

        window.requestAnimationFrame(async () => {
            await fitView();
        });
    }, [
        connectedNodes,
        freeNodes,
        currentEdges,
        setCurrentNodes,
        setCurrentEdges,
        fitView,
    ]);

    useEffect(() => {
        if (!metricsTree || hasLayout) return;

        // TODO: The graph doesn't fully layout without this delay.
        // There maybe be a better way to await layout completion. The layout
        // engine doesn't return a promise, but maybe we can come up with something.
        const timeoutId = setTimeout(() => {
            onLayout();
            setHasLayout(true);
        }, 80);

        return () => clearTimeout(timeoutId);
    }, [onLayout, metricsTree, hasLayout]);

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
            >
                <Panel position="top-right">
                    <button onClick={() => onLayout()}>Clean up</button>
                </Panel>
                <Background />
            </ReactFlow>
        </Box>
    );
};

export default MetricTree;
