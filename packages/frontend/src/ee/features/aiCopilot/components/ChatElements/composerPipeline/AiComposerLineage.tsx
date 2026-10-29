import { interpolateUiString, type SourceQuery } from '@lightdash/common';
import { Badge, Box, Group, Paper, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    Background,
    Handle,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useNodesInitialized,
    useNodesState,
    useReactFlow,
    type EdgeTypes,
    type NodeProps,
    type NodeTypes,
} from '@xyflow/react';
import { clsx } from 'clsx';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import '@xyflow/react/dist/style.css';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import DefaultEdge from '../../../../../../components/common/ReactFlow/DefaultEdge';
import reactFlowStyles from '../../../../../../components/common/ReactFlow/reactFlow.module.css';
import ResizableSplitter from '../../../../../../components/common/ResizableSplitter';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import {
    useComposerNodeRowsLabel,
    useComposerNodeStatusLabel,
} from '../composerNodeStatus';
import { NodeStatusIndicator } from '../ComposerNodeStatusIndicator';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import styles from './AiComposerLineage.module.css';
import { groupPipeline, type PipelineLayer } from './groupPipeline';
import { nodeTypeIcon } from './nodeTypeIcon';
import {
    PipelineNotebook,
    type PipelineNotebookHandle,
    type PipelineNotebookProps,
} from './notebook/PipelineNotebook';
import {
    layoutPipelineFlow,
    toPipelineFlow,
    type PipelineFlowNode,
} from './pipelineGraph';

type GraphDisplay = {
    onFocusNode: (nodeId: string) => void;
    onHoverNode: (nodeId: string | null) => void;
    nodeStatuses: Readonly<Record<string, ComposerRunNodeStatus>>;
};

const NodeFacts: FC<{
    query: SourceQuery;
    status: ComposerRunNodeStatus | null;
}> = ({ query, status }) => {
    const statusLabel = useComposerNodeStatusLabel();
    const rowsLabel = useComposerNodeRowsLabel();
    if (!status) return null;
    if (status.status !== 'success') {
        return (
            <Group gap={6} wrap="nowrap">
                <NodeStatusIndicator status={status.status} />
                <Text component="span" fz="xs" c="dimmed">
                    {statusLabel(status.status)}
                </Text>
            </Group>
        );
    }
    if (status.totalRowCount === null) return null;
    return (
        <Text component="span" fz="xs" c="dimmed" className={styles.facts}>
            {rowsLabel(query, status.totalRowCount)}
        </Text>
    );
};

const LineageNodeView: FC<NodeProps<PipelineFlowNode>> = ({ data }) => {
    const getUiString = useUiStrings();
    return (
        <Paper
            component="button"
            type="button"
            className={styles.graphNode}
            data-terminal={data.isTerminal}
            data-dimmed={data.isDimmed}
            aria-label={interpolateUiString(
                getUiString('aiAgent.composer.lineage.focusNode'),
                { node: data.title },
            )}
            title={data.title}
        >
            <Handle
                type="target"
                position={Position.Left}
                className={styles.handle}
            />
            <Group gap="xs" wrap="nowrap" className={styles.graphNodeHead}>
                <Box className={styles.graphNodeIcon}>
                    <MantineIcon
                        icon={nodeTypeIcon(data.query)}
                        size={14}
                        stroke={1.5}
                    />
                </Box>
                <Box className={styles.graphNodeText}>
                    <Text
                        component="span"
                        className={styles.graphNodeTitle}
                        truncate
                    >
                        {data.title}
                    </Text>
                    <Text component="span" className={styles.graphNodeType}>
                        {data.typeLabel}
                    </Text>
                </Box>
            </Group>
            {/* Always drawn: nodes are laid out once, so their height must not change. */}
            <Group
                gap="xs"
                wrap="nowrap"
                justify="space-between"
                className={styles.graphNodeFooter}
            >
                <NodeFacts query={data.query} status={data.status} />
                {data.isTerminal && (
                    <Badge size="xs" ml="auto">
                        {getUiString('aiAgent.composer.node.finalResult')}
                    </Badge>
                )}
            </Group>
            <Handle
                type="source"
                position={Position.Right}
                className={styles.handle}
            />
        </Paper>
    );
};

const nodeTypes: NodeTypes = { pipeline: LineageNodeView };
const edgeTypes: EdgeTypes = { pipeline: DefaultEdge };
const FIT_VIEW_OPTIONS = { padding: 0.15, maxZoom: 1 };

const LineageFlow: FC<{ layers: PipelineLayer[] } & GraphDisplay> = ({
    layers,
    onFocusNode,
    onHoverNode,
    nodeStatuses,
}) => {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const flow = useMemo(
        () => toPipelineFlow(layers, { hoveredNodeId, nodeStatuses }),
        [layers, hoveredNodeId, nodeStatuses],
    );
    // State holds what React Flow owns (positions, sizes); data comes from props.
    const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
    const renderedNodes = useMemo(() => {
        const dataById = new Map(
            flow.nodes.map((node) => [node.id, node.data]),
        );
        return nodes.map((node) => ({
            ...node,
            data: dataById.get(node.id) ?? node.data,
        }));
    }, [nodes, flow.nodes]);
    const laidOut = useRef(false);
    const initialized = useNodesInitialized();
    const { fitView } = useReactFlow();
    const { ref, width, height } = useElementSize();

    // Positions need measured sizes, so lay out once React Flow has them.
    useEffect(() => {
        if (!initialized || laidOut.current) return;
        laidOut.current = true;
        setNodes((current) => layoutPipelineFlow(current, flow.edges));
        requestAnimationFrame(() => void fitView(FIT_VIEW_OPTIONS));
    }, [initialized, flow.edges, setNodes, fitView]);

    useEffect(() => {
        if (laidOut.current) void fitView(FIT_VIEW_OPTIONS);
    }, [width, height, fitView]);

    return (
        <Box className={styles.graph} ref={ref}>
            <ReactFlow<PipelineFlowNode>
                className={clsx(
                    reactFlowStyles.reactFlow,
                    !laidOut.current && styles.flowPending,
                )}
                nodes={renderedNodes}
                edges={flow.edges}
                onNodesChange={onNodesChange}
                onNodeClick={(_, node) => onFocusNode(node.id)}
                onNodeMouseEnter={(_, node) => {
                    setHoveredNodeId(node.id);
                    onHoverNode(node.id);
                }}
                onNodeMouseLeave={() => {
                    setHoveredNodeId(null);
                    onHoverNode(null);
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                fitViewOptions={FIT_VIEW_OPTIONS}
                minZoom={0.25}
                maxZoom={1.5}
                attributionPosition="top-right"
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                zoomOnScroll={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
            >
                <Background />
            </ReactFlow>
        </Box>
    );
};

// Remount provider and flow when the pipeline shape changes, so the React Flow
// store does not carry the previous pipeline's measured nodes into the new one.
const pipelineKey = (layers: PipelineLayer[]) =>
    layers
        .flatMap((layer) => layer.nodes)
        .map((node) => `${node.nodeId}<${node.readNodeIds.join(',')}`)
        .join('|');

type Props = Pick<
    PipelineNotebookProps,
    | 'projectUuid'
    | 'nodeStatuses'
    | 'displayableNodeIds'
    | 'renderNodeResult'
    | 'chatNodeIds'
    | 'onAddToChat'
> & {
    queries: SourceQuery[];
    terminalNodeId: string;
};

// The lineage graph on top, one notebook cell per node below; clicking a
// graph node focuses its cell.
export const AiComposerLineage: FC<Props> = ({
    queries,
    terminalNodeId,
    nodeStatuses,
    ...notebookProps
}) => {
    const layers = useMemo(
        () => groupPipeline(queries, terminalNodeId),
        [queries, terminalNodeId],
    );
    const getUiString = useUiStrings();
    const notebookRef = useRef<PipelineNotebookHandle>(null);

    return (
        <ResizableSplitter
            orientation="vertical"
            handleLabel={getUiString('aiAgent.composer.lineage.resize')}
            classNames={{ handle: styles.splitHandle }}
        >
            <ResizableSplitter.Pane id="graph" defaultSize={35} min={15}>
                {layers.length > 0 && (
                    <ReactFlowProvider key={pipelineKey(layers)}>
                        <LineageFlow
                            layers={layers}
                            nodeStatuses={nodeStatuses}
                            onFocusNode={(nodeId) =>
                                notebookRef.current?.focusNode(nodeId)
                            }
                            onHoverNode={(nodeId) =>
                                nodeId
                                    ? notebookRef.current?.showLineage(nodeId)
                                    : notebookRef.current?.hideLineage()
                            }
                        />
                    </ReactFlowProvider>
                )}
            </ResizableSplitter.Pane>
            <ResizableSplitter.Pane id="steps" defaultSize={65} min={20}>
                <Box className={styles.steps}>
                    <PipelineNotebook
                        ref={notebookRef}
                        nodes={layers.flatMap((layer) => layer.nodes)}
                        nodeStatuses={nodeStatuses}
                        {...notebookProps}
                    />
                </Box>
            </ResizableSplitter.Pane>
        </ResizableSplitter>
    );
};
