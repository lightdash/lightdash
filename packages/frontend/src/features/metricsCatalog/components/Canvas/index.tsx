import type { CatalogMetricsTreeEdge } from '@lightdash/common';
import { Box, Button, Group, Text, useMantineTheme } from '@mantine/core';
import { IconLayoutGridRemove } from '@tabler/icons-react';
import {
    Background,
    ReactFlow,
    Panel as ReactFlowPanel,
    type Connection,
    type Edge,
    type EdgeTypes,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, type FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import {
    useCreateMetricsTreeEdge,
    useDeleteMetricsTreeEdge,
} from '../../hooks/useMetricsTree';
import { CanvasTimeFramePicker } from '../visualization/CanvasTimeFramePicker';
import styles from './Canvas.module.css';
import { type CanvasMetric } from './canvasLayoutUtils';
import MetricsSidebar from './MetricsSidebar';
import DefaultEdge from './TreeComponents/edges/DefaultEdge';
import ExpandedNode from './TreeComponents/nodes/ExpandedNode';
import { useCanvasFlow } from './useCanvasFlow';

const edgeTypes: EdgeTypes = { yaml: DefaultEdge, ui: DefaultEdge };
const nodeTypes: NodeTypes = { expanded: ExpandedNode };

type Props = {
    metrics: CanvasMetric[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly?: boolean;
};

const Canvas: FC<Props> = ({ metrics, edges, viewOnly = false }) => {
    const { track } = useTracking();
    const theme = useMantineTheme();
    const [userUuid, projectUuid, organizationUuid] = useAppSelector(
        ({ metricsCatalog }) => [
            metricsCatalog.user?.userUuid,
            metricsCatalog.projectUuid,
            metricsCatalog.organizationUuid,
        ],
    );
    const { mutateAsync: createMetricsTreeEdge } = useCreateMetricsTreeEdge();
    const { mutateAsync: deleteMetricsTreeEdge } = useDeleteMetricsTreeEdge();

    const handleEdgeCreated = useCallback(
        async (params: Connection) => {
            if (projectUuid) {
                await createMetricsTreeEdge({
                    projectUuid,
                    sourceCatalogSearchUuid: params.source,
                    targetCatalogSearchUuid: params.target,
                });

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
        [projectUuid, createMetricsTreeEdge, track, userUuid, organizationUuid],
    );

    const handleEdgesDeleted = useCallback(
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
        [projectUuid, deleteMetricsTreeEdge, track, userUuid, organizationUuid],
    );

    const flow = useCanvasFlow({
        metrics,
        edges,
        viewOnly,
        onEdgeCreated: handleEdgeCreated,
        onEdgesDeleted: handleEdgesDeleted,
    });

    return (
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
            {!viewOnly && <MetricsSidebar nodes={flow.sidebarNodes} />}
            <Panel id="metrics-canvas" order={2}>
                <Box h="100%">
                    <ReactFlow
                        className={styles.reactFlow}
                        nodes={flow.currentNodes}
                        edges={flow.currentEdges}
                        fitView
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
                        <ReactFlowPanel
                            position="top-left"
                            style={{ margin: '14px 27px' }}
                        >
                            <Group spacing="xs">
                                <Text fz={14} fw={500} c="ldGray.6">
                                    Canvas mode:
                                </Text>
                                <CanvasTimeFramePicker
                                    value={flow.canvasTimeOption}
                                    onChange={flow.setCanvasTimeOption}
                                />
                            </Group>
                        </ReactFlowPanel>
                        {!viewOnly && (
                            <ReactFlowPanel position="bottom-left">
                                <Button
                                    variant="default"
                                    radius="md"
                                    onClick={() =>
                                        flow.applyLayout({
                                            removeUnconnected: true,
                                        })
                                    }
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
                            </ReactFlowPanel>
                        )}
                        {!viewOnly && <Background />}
                    </ReactFlow>
                </Box>
            </Panel>
        </PanelGroup>
    );
};

export default Canvas;
