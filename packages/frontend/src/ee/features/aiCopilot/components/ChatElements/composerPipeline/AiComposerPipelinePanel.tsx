import { type SourceQuery } from '@lightdash/common';
import {
    Box,
    Paper,
    SegmentedControl,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronRight } from '@tabler/icons-react';
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
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import '@xyflow/react/dist/style.css';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import DefaultEdge from '../../../../../../components/common/ReactFlow/DefaultEdge';
import reactFlowStyles from '../../../../../../components/common/ReactFlow/reactFlow.module.css';
import ResizableSplitter from '../../../../../../components/common/ResizableSplitter';
import { type ComposerRunNodeStatus } from '../useComposerRunNodeStatuses';
import styles from './AiComposerPipelinePanel.module.css';
import { groupPipeline, type PipelineLayer } from './groupPipeline';
import {
    PipelineNotebook,
    type PipelineNotebookProps,
} from './notebook/PipelineNotebook';
import {
    layoutPipelineFlow,
    toPipelineFlow,
    type PipelineFlowNode,
} from './pipelineGraph';

export type PipelineMode = 'list' | 'graph';

type NodeDisplay = {
    displayedNodeId: string;
    /** Nodes with a result in the current run; the rest are inert. */
    displayableNodeIds: ReadonlySet<string>;
    onDisplayNode: (nodeId: string) => void;
    /** By node id; a node without an entry shows no status. */
    nodeStatuses: Readonly<Record<string, ComposerRunNodeStatus>>;
};

const PipelineFlowNodeView: FC<NodeProps<PipelineFlowNode>> = ({ data }) => (
    <Paper
        component="button"
        type="button"
        className={styles.graphNode}
        data-terminal={data.isTerminal}
        data-displayed={data.isDisplayed}
        aria-disabled={!data.isDisplayable}
        aria-pressed={data.isDisplayed}
        aria-label={`Display ${data.title}`}
        title={data.title}
    >
        <Handle
            type="target"
            position={Position.Left}
            className={styles.handle}
        />
        <Box className={styles.dot} />
        <Box className={styles.graphNodeText}>
            <Text component="span" className={styles.graphNodeTitle} truncate>
                {data.title}
            </Text>
            <Text component="span" className={styles.graphNodeType}>
                {data.typeLabel}
            </Text>
        </Box>
        <Handle
            type="source"
            position={Position.Right}
            className={styles.handle}
        />
    </Paper>
);

const nodeTypes: NodeTypes = { pipeline: PipelineFlowNodeView };
const edgeTypes: EdgeTypes = { pipeline: DefaultEdge };
const FIT_VIEW_OPTIONS = { padding: 0.1, maxZoom: 1 };

const PipelineFlow: FC<{ layers: PipelineLayer[] } & NodeDisplay> = ({
    layers,
    displayedNodeId,
    displayableNodeIds,
    onDisplayNode,
}) => {
    const flow = useMemo(
        () => toPipelineFlow(layers, { displayedNodeId, displayableNodeIds }),
        [layers, displayedNodeId, displayableNodeIds],
    );
    const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);

    // Node data is copied into React Flow's store; keep the marks current.
    useEffect(() => {
        const dataById = new Map(
            flow.nodes.map((node) => [node.id, node.data]),
        );
        setNodes((current) =>
            current.map((node) => ({
                ...node,
                data: dataById.get(node.id) ?? node.data,
            })),
        );
    }, [flow.nodes, setNodes]);
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
                nodes={nodes}
                edges={flow.edges}
                onNodesChange={onNodesChange}
                onNodeClick={(_, node) => {
                    if (displayableNodeIds.has(node.id)) onDisplayNode(node.id);
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

/** Nodes as boxes, reads as edges, laid out left to right. */
const PipelineGraph: FC<{ layers: PipelineLayer[] } & NodeDisplay> = ({
    layers,
    ...display
}) =>
    layers.length === 0 ? null : (
        <ReactFlowProvider key={pipelineKey(layers)}>
            <PipelineFlow layers={layers} {...display} />
        </ReactFlowProvider>
    );

const PipelineBar: FC<{
    nodeCount: number;
    expanded: boolean;
    onToggle: () => void;
    mode: PipelineMode;
    onModeChange: (mode: PipelineMode) => void;
}> = ({ nodeCount, expanded, onToggle, mode, onModeChange }) => (
    <Box className={styles.bar}>
        <UnstyledButton
            className={styles.barToggle}
            onClick={onToggle}
            aria-expanded={expanded}
        >
            <MantineIcon
                icon={IconChevronRight}
                size={11}
                stroke={1.6}
                className={clsx(styles.chevron, expanded && styles.chevronOpen)}
            />
            <Text component="span" className={styles.heading}>
                Queries
            </Text>
        </UnstyledButton>
        {expanded && (
            <SegmentedControl
                size="xs"
                value={mode}
                onChange={(value) =>
                    onModeChange(value === 'graph' ? 'graph' : 'list')
                }
                data={[
                    { label: 'List', value: 'list' },
                    { label: 'Graph', value: 'graph' },
                ]}
            />
        )}
        <Text component="span" className={styles.meta}>
            {nodeCount} step{nodeCount === 1 ? '' : 's'}
        </Text>
    </Box>
);

type Props = NodeDisplay &
    Pick<
        PipelineNotebookProps,
        'renderNodeResult' | 'chatNodeIds' | 'onAddToChat'
    > & {
        projectUuid: string;
        queries: SourceQuery[];
        terminalNodeId: string;
        /** The displayed node result shown above the panel. */
        children: ReactNode;
        defaultExpanded?: boolean;
        /** Controlled open state; the panel keeps its own when omitted. */
        expanded?: boolean;
        onExpandedChange?: (expanded: boolean) => void;
        defaultMode?: PipelineMode;
    };

// The displayed node result on top, the pipeline underneath: a bar when
// collapsed, a draggable splitter when expanded. Clicking a graph node displays it;
// the list shows every node's own rows.
export const AiComposerPipelinePanel: FC<Props> = ({
    projectUuid,
    queries,
    terminalNodeId,
    displayedNodeId,
    displayableNodeIds,
    onDisplayNode,
    nodeStatuses,
    renderNodeResult,
    chatNodeIds,
    onAddToChat,
    children,
    defaultExpanded = false,
    expanded: controlledExpanded,
    onExpandedChange,
    defaultMode,
}) => {
    const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
    const expanded = controlledExpanded ?? ownExpanded;
    const [mode, setMode] = useState<PipelineMode>(defaultMode ?? 'list');
    const display: NodeDisplay = {
        displayedNodeId,
        displayableNodeIds,
        onDisplayNode,
        nodeStatuses,
    };
    const layers = useMemo(
        () => groupPipeline(queries, terminalNodeId),
        [queries, terminalNodeId],
    );
    const bar = (
        <PipelineBar
            nodeCount={queries.length}
            expanded={expanded}
            onToggle={() => {
                setOwnExpanded(!expanded);
                onExpandedChange?.(!expanded);
            }}
            mode={mode}
            onModeChange={setMode}
        />
    );
    if (!expanded) {
        return (
            <Box className={styles.root}>
                <Box className={styles.results}>{children}</Box>
                {bar}
            </Box>
        );
    }

    return (
        <ResizableSplitter
            orientation="vertical"
            handleLabel="Resize results and pipeline"
            classNames={{ handle: styles.splitHandle }}
        >
            <ResizableSplitter.Pane id="results" defaultSize={55} min={15}>
                <Box className={styles.results}>{children}</Box>
            </ResizableSplitter.Pane>
            <ResizableSplitter.Pane id="pipeline" defaultSize={45} min={10}>
                <Box className={styles.root}>
                    {bar}
                    {mode === 'graph' ? (
                        <PipelineGraph layers={layers} {...display} />
                    ) : (
                        <PipelineNotebook
                            nodes={layers.flatMap((layer) => layer.nodes)}
                            projectUuid={projectUuid}
                            nodeStatuses={nodeStatuses}
                            displayableNodeIds={displayableNodeIds}
                            renderNodeResult={renderNodeResult}
                            chatNodeIds={chatNodeIds}
                            onAddToChat={onAddToChat}
                        />
                    )}
                </Box>
            </ResizableSplitter.Pane>
        </ResizableSplitter>
    );
};
