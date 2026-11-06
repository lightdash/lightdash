import { interpolateUiString, type SourceQuery } from '@lightdash/common';
import { Badge, Box, Button, Group, Paper, Text } from '@mantine/core';
import {
    useElementSize,
    useWindowEvent,
    type SplitterPaneSize,
} from '@mantine/hooks';
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
import { ComposerNodeIcon } from './ComposerNodeIcon';
import {
    groupPipeline,
    type NodeLineage,
    type PipelineLayer,
} from './groupPipeline';
import {
    PipelineNotebook,
    type PipelineNotebookHandle,
    type PipelineNotebookProps,
} from './notebook/PipelineNotebook';
import {
    getFittedGraphShare,
    getPipelineFlowHeight,
    GRAPH_FIT_PADDING,
    layoutPipelineFlow,
    toPipelineFlow,
    type PipelineFlowNode,
} from './pipelineGraph';

type GraphDisplay = {
    selectedNodeId: string | null;
    notebookLineage: NodeLineage | null;
    onFocusNode: (nodeId: string) => void;
    onHoverNode: (nodeId: string | null) => void;
    onClearSelection: () => void;
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

const LineageNodeView: FC<NodeProps<PipelineFlowNode>> = ({
    data,
    selected,
}) => {
    const getUiString = useUiStrings();
    return (
        <Paper
            component="button"
            type="button"
            className={styles.graphNode}
            data-terminal={data.isTerminal}
            data-dimmed={data.isDimmed}
            data-lineage-role={data.lineageRole ?? undefined}
            data-selected={selected}
            aria-pressed={selected}
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
            <Group
                gap="xs"
                wrap="nowrap"
                align="flex-start"
                className={styles.graphNodeHead}
            >
                <Box className={styles.graphNodeIcon}>
                    <ComposerNodeIcon query={data.query} size={14} />
                </Box>
                <Box className={styles.graphNodeText}>
                    <Text
                        component="span"
                        className={styles.graphNodeTitle}
                        lineClamp={2}
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
// Never enlarge past 100%, so node labels keep their CSS size.
const FIT_VIEW_OPTIONS = { padding: GRAPH_FIT_PADDING, maxZoom: 1 };
const GRAPH_SHARE_BOUNDS = { min: 15, max: 35 };
const DEFAULT_SIZES: SplitterPaneSize[] = [
    GRAPH_SHARE_BOUNDS.max,
    100 - GRAPH_SHARE_BOUNDS.max,
];

const LineageFlow: FC<
    {
        layers: PipelineLayer[];
        onLayout: (contentHeight: number) => void;
    } & GraphDisplay
> = ({
    layers,
    onLayout,
    selectedNodeId,
    notebookLineage,
    onFocusNode,
    onHoverNode,
    onClearSelection,
    nodeStatuses,
}) => {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const focusedNodeId = hoveredNodeId ?? selectedNodeId;
    const flow = useMemo(
        () =>
            toPipelineFlow(layers, {
                focusedNodeId,
                notebookLineage,
                nodeStatuses,
            }),
        [layers, focusedNodeId, notebookLineage, nodeStatuses],
    );
    // State holds what React Flow owns (positions, sizes); data comes from props.
    const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
    const renderedNodes = useMemo(() => {
        const dataById = new Map(
            flow.nodes.map((node) => [node.id, node.data]),
        );
        return nodes.map((node) => ({
            ...node,
            selected: node.id === selectedNodeId,
            data: dataById.get(node.id) ?? node.data,
        }));
    }, [nodes, flow.nodes, selectedNodeId]);
    const laidOut = useRef(false);
    const initialized = useNodesInitialized();
    const { fitView, getNodes } = useReactFlow<PipelineFlowNode>();
    const { ref, width, height } = useElementSize();
    const getUiString = useUiStrings();
    const focusedTitle =
        focusedNodeId !== null && flow.nodes.some((node) => node.data.isDimmed)
            ? (flow.nodes.find((node) => node.id === focusedNodeId)?.data
                  .title ?? null)
            : null;

    // Positions need measured sizes, so lay out once React Flow has them.
    useEffect(() => {
        if (!initialized || laidOut.current) return;
        laidOut.current = true;
        const laidOutNodes = layoutPipelineFlow(getNodes(), flow.edges);
        setNodes(laidOutNodes);
        onLayout(getPipelineFlowHeight(laidOutNodes));
        requestAnimationFrame(() => void fitView(FIT_VIEW_OPTIONS));
    }, [initialized, flow.edges, setNodes, getNodes, fitView, onLayout]);

    // Wait a frame so React Flow has measured the resized viewport first.
    useEffect(() => {
        if (!laidOut.current) return;
        const frame = requestAnimationFrame(
            () => void fitView(FIT_VIEW_OPTIONS),
        );
        return () => cancelAnimationFrame(frame);
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
                onPaneClick={onClearSelection}
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
                attributionPosition="bottom-right"
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
            {focusedTitle !== null && (
                <Paper className={styles.focusHint}>
                    <Text component="span" fz="xs" c="dimmed" truncate>
                        {interpolateUiString(
                            getUiString('aiAgent.composer.lineage.focusHint'),
                            { node: focusedTitle },
                        )}
                    </Text>
                    {selectedNodeId !== null && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={onClearSelection}
                        >
                            {getUiString('aiAgent.composer.lineage.clearFocus')}
                        </Button>
                    )}
                </Paper>
            )}
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

// The lineage graph on top, one notebook cell per node below; selecting a node
// in either highlights it in both.
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
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [notebookLineage, setNotebookLineage] = useState<NodeLineage | null>(
        null,
    );
    const clearSelection = () => setSelectedNodeId(null);
    // Default graph height fits its nodes, capped at the default share.
    const { ref: splitRef, height: splitHeight } = useElementSize();
    const [graphContentHeight, setGraphContentHeight] = useState(0);
    const fittedShare = getFittedGraphShare(
        graphContentHeight,
        splitHeight,
        GRAPH_SHARE_BOUNDS,
    );
    const fittedSizes: SplitterPaneSize[] = [fittedShare, 100 - fittedShare];
    // null follows the fitted default until the user resizes.
    const [userSizes, setUserSizes] = useState<SplitterPaneSize[] | null>(null);
    const sizes = userSizes ?? fittedSizes;
    useWindowEvent('keydown', (event) => {
        if (event.key === 'Escape' && selectedNodeId !== null) {
            // Claims the key so the panel stays expanded.
            event.preventDefault();
            clearSelection();
        }
    });

    return (
        <Box ref={splitRef} className={styles.split}>
            <ResizableSplitter
                orientation="vertical"
                handleLabel={getUiString('aiAgent.composer.lineage.resize')}
                classNames={{ handle: styles.splitHandle }}
                sizes={sizes}
                onSizeChange={setUserSizes}
            >
                <ResizableSplitter.Pane
                    id="graph"
                    defaultSize={DEFAULT_SIZES[0]}
                    min={15}
                    className={styles.graphPane}
                >
                    {layers.length > 0 && (
                        <ReactFlowProvider key={pipelineKey(layers)}>
                            <LineageFlow
                                layers={layers}
                                onLayout={setGraphContentHeight}
                                nodeStatuses={nodeStatuses}
                                selectedNodeId={selectedNodeId}
                                notebookLineage={notebookLineage}
                                onFocusNode={(nodeId) =>
                                    notebookRef.current?.focusNode(nodeId)
                                }
                                onHoverNode={(nodeId) =>
                                    nodeId
                                        ? notebookRef.current?.showLineage(
                                              nodeId,
                                          )
                                        : notebookRef.current?.hideLineage()
                                }
                                onClearSelection={clearSelection}
                            />
                        </ReactFlowProvider>
                    )}
                </ResizableSplitter.Pane>
                <ResizableSplitter.Pane
                    id="steps"
                    defaultSize={DEFAULT_SIZES[1]}
                    min={20}
                >
                    <Box className={styles.steps}>
                        <PipelineNotebook
                            ref={notebookRef}
                            nodes={layers.flatMap((layer) => layer.nodes)}
                            nodeStatuses={nodeStatuses}
                            onSelectNode={setSelectedNodeId}
                            onLineageChange={setNotebookLineage}
                            {...notebookProps}
                        />
                    </Box>
                </ResizableSplitter.Pane>
            </ResizableSplitter>
        </Box>
    );
};
