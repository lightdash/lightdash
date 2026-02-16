import type { CatalogMetricsTreeEdge } from '@lightdash/common';
import { Box, Button, Group, Text, useMantineTheme } from '@mantine/core';
import { IconLayoutGridRemove } from '@tabler/icons-react';
import {
    Background,
    ReactFlow,
    Panel as ReactFlowPanel,
    type Edge,
    type EdgeTypes,
    type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FC } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import MantineIcon from '../../../../components/common/MantineIcon';
import { CanvasTimeFramePicker } from '../visualization/CanvasTimeFramePicker';
import styles from './Canvas.module.css';
import MetricsSidebar from './MetricsSidebar';
import DefaultEdge from './TreeComponents/edges/DefaultEdge';
import ExpandedNode, {
    type ExpandedNodeData,
} from './TreeComponents/nodes/ExpandedNode';
import { type CanvasMetric } from './canvasLayoutUtils';
import { useCanvasFlow } from './useCanvasFlow';

const edgeTypes: EdgeTypes = { yaml: DefaultEdge, ui: DefaultEdge };
const nodeTypes: NodeTypes = { expanded: ExpandedNode };

type Props = {
    metrics: CanvasMetric[];
    edges: CatalogMetricsTreeEdge[];
    viewOnly: boolean;
    /** Called when canvas nodes/edges change so parent can capture state for save */
    onCanvasStateChange?: (nodes: ExpandedNodeData[], edges: Edge[]) => void;
    /** Optional filter applied only to the sidebar list (not the canvas) */
    sidebarFilter?: (node: ExpandedNodeData) => boolean;
    /** All YAML edges for the project — used to inject YAML edges reactively in edit mode */
    allProjectYamlEdges?: CatalogMetricsTreeEdge[];
};

const SavedTreeCanvasFlow: FC<Props> = ({
    metrics,
    edges,
    viewOnly,
    onCanvasStateChange,
    sidebarFilter,
    allProjectYamlEdges,
}) => {
    const theme = useMantineTheme();

    const flow = useCanvasFlow({
        metrics,
        edges,
        viewOnly,
        preventResetAfterInit: !viewOnly, // In edit mode, prevent background refetch resets
        onCanvasStateChange,
        sidebarFilter,
        allProjectYamlEdges,
        // No onEdgeCreated/onEdgesDeleted -- edges stay local until explicit save
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

export default SavedTreeCanvasFlow;
