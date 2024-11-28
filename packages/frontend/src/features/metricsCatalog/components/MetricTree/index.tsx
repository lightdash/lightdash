import type { CatalogField, CatalogMetricsTreeEdge } from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    addEdge,
    Background,
    ReactFlow,
    useEdgesState,
    useNodesState,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, type FC } from 'react';
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
    return `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`;
}

const MetricTree: FC<Props> = ({ metrics }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { data: metricsTree } = useMetricsTree(projectUuid);
    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();

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

    const [currentNodes, _setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    // Set the current edges to the initial edges in the case that the request for metrics tree is slow
    useEffect(() => {
        setCurrentEdges(initialEdges);
    }, [initialEdges, setCurrentEdges]);

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
        [setCurrentEdges, createMetricsTreeEdge, projectUuid],
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
            }
        },
        [deleteMetricsTreeEdge, projectUuid],
    );

    return (
        <Box h="100%">
            <ReactFlow
                nodes={currentNodes}
                edges={currentEdges}
                fitView
                attributionPosition="top-right"
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                edgesReconnectable={false}
                onEdgesDelete={handleEdgesDelete}
            >
                <Background />
            </ReactFlow>
        </Box>
    );
};

export default MetricTree;
