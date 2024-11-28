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

type Props = {
    metrics: CatalogField[];
    nodes?: Node[];
    edges?: Edge[];
};

const MetricTree: FC<Props> = ({ metrics, nodes = [], edges = [] }) => {
    const metricNodes = useMemo(() => {
        // TODO: Logic for saved nodes
        // If there are saved nodes, use them
        // Otherwise, use the metrics to create the nodes
        // If there are new metrics that don't exist in the saved nodes, add them
        if (nodes.length > 0) {
            return nodes;
        }

        return metrics.map((metric) => ({
            id: `${metric.tableName}_${metric.name}`,
            position: { x: 0, y: 0 },
            data: { label: metric.name },
        }));
    }, [metrics, nodes]);

    const metricEdges = useMemo(() => {
        // TODO: Logic for saved edges
        // If there are saved edges, use them
        if (edges.length > 0) {
            return edges;
        }

        return [];
    }, [edges]);

    const [currentNodes, _setCurrentNodes, onNodesChange] =
        useNodesState(metricNodes);
    const [currentEdges, setCurrentEdges, onEdgesChange] =
        useEdgesState(metricEdges);

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
