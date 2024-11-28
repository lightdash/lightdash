import {
    addEdge,
    Background,
    ReactFlow,
    useEdgesState,
    useNodesState,
    type Edge,
    type Node,
} from '@xyflow/react';
import { useCallback, useMemo, type FC } from 'react';

import type { CatalogField } from '@lightdash/common';
import { Box } from '@mantine/core';
import '@xyflow/react/dist/style.css';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useMetricsTree } from '../../hooks/useMetricsTree';

type Props = {
    metrics: CatalogField[];
};

function getNodeId(metric: Pick<CatalogField, 'tableName' | 'name'>) {
    return `${metric.tableName}_${metric.name}`;
}

const MetricTree: FC<Props> = ({ metrics }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { data: metricsTree } = useMetricsTree(projectUuid);

    const initialNodes = useMemo<Node[]>(() => {
        return metrics.map((metric) => ({
            id: getNodeId(metric),
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
                id: `${edge.source.catalogSearchUuid}_${edge.target.catalogSearchUuid}`,
                source: getNodeId(edge.source),
                target: getNodeId(edge.target),
            }));
        }

        return [];
    }, [metrics, metricsTree]);

    const [currentNodes, _setCurrentNodes, onNodesChange] =
        useNodesState(initialNodes);

    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(initialEdges);

    const onConnect = useCallback(
        (params: any) => setCurrentEdges((els) => addEdge(params, els)),
        [setCurrentEdges],
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
                onConnect={onConnect}
            >
                <Background />
            </ReactFlow>
        </Box>
    );
};

export default MetricTree;
