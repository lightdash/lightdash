import {
    assertUnreachable,
    formatSql,
    friendlyName,
    QuerySourceType,
    WarehouseTypes,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Paper,
    SegmentedControl,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconHelpCircle,
    IconSitemap,
} from '@tabler/icons-react';
import {
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
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import DefaultEdge from '../../../../../../components/common/ReactFlow/DefaultEdge';
import reactFlowStyles from '../../../../../../components/common/ReactFlow/reactFlow.module.css';
import ResizableSplitter from '../../../../../../components/common/ResizableSplitter';
import { LD_FIELD_COLORS } from '../../../../../../theme/fieldColors';
import styles from './AiComposerPipelinePanel.module.css';
import {
    groupPipeline,
    sourceLabelOf,
    type PipelineLayer,
    type PipelineNode,
} from './groupPipeline';
import {
    layoutPipelineFlow,
    toPipelineFlow,
    type PipelineFlowNode,
} from './pipelineGraph';

const TRANSFORMATIONS_HELP =
    'Transformations run in DuckDB on top of the source results. They never touch the warehouse.';

const pipelineNodeRowId = (nodeId: string) =>
    `composer-pipeline-node-${nodeId}`;

export type PipelineMode = 'list' | 'graph';

const layerLabel = (layer: PipelineLayer) => {
    const single = layer.nodes.length === 1;
    switch (layer.kind) {
        case 'sources':
            return single ? 'Source' : 'Sources';
        case 'transformations':
            return single ? 'Transformation' : 'Transformations';
        case 'result':
            return 'Result';
        default:
            return assertUnreachable(layer.kind, 'Unknown pipeline layer');
    }
};

const sourceIcon = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return IconSitemap;
        case QuerySourceType.SQL:
            return IconDatabase;
        case QuerySourceType.EXTERNAL:
            return IconFileSpreadsheet;
        case QuerySourceType.DUCKDB:
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

const formattedSqlOf = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return null;
        case QuerySourceType.SQL:
            return formatSql(query.sql);
        case QuerySourceType.DUCKDB:
        case QuerySourceType.EXTERNAL:
            return formatSql(query.sql, WarehouseTypes.DUCKDB);
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

const SemanticFields: FC<{ query: SemanticLayerSourceQuery }> = ({ query }) => {
    const fieldLabel = (fieldId: string) =>
        friendlyName(fieldId.replace(`${query.exploreName}_`, ''));
    return (
        <Group gap={4} className={styles.fields}>
            <Text component="span" className={styles.exploreName}>
                {friendlyName(query.exploreName)}
            </Text>
            {query.dimensions.map((fieldId) => (
                <Box
                    key={fieldId}
                    component="span"
                    className={styles.fieldChip}
                    bg={LD_FIELD_COLORS.dimension.bg}
                    c={LD_FIELD_COLORS.dimension.color}
                >
                    {fieldLabel(fieldId)}
                </Box>
            ))}
            {query.metrics.map((fieldId) => (
                <Box
                    key={fieldId}
                    component="span"
                    className={styles.fieldChip}
                    bg={LD_FIELD_COLORS.metric.bg}
                    c={LD_FIELD_COLORS.metric.color}
                >
                    {fieldLabel(fieldId)}
                </Box>
            ))}
        </Group>
    );
};

const PipelineNodeRow: FC<{ node: PipelineNode; selected: boolean }> = ({
    node,
    selected,
}) => {
    const label = sourceLabelOf(node.query);
    const icon = sourceIcon(node.query);
    const sql = useMemo(() => formattedSqlOf(node.query), [node.query]);
    return (
        <Box
            className={clsx(styles.node, selected && styles.selected)}
            id={pipelineNodeRowId(node.nodeId)}
            data-node-id={node.nodeId}
            data-selected={selected}
        >
            <Box className={styles.nodeHead}>
                <Box className={styles.dot} />
                <Text component="span" className={styles.nodeTitle}>
                    {node.title}
                    {node.isTerminal ? ' · result' : ''}
                </Text>
                {label && icon && (
                    <Text component="span" className={styles.nodeType}>
                        <MantineIcon icon={icon} size={11} />
                        {label}
                    </Text>
                )}
            </Box>
            {node.description && (
                <Text className={styles.nodeDescription}>
                    {node.description}
                </Text>
            )}
            {node.reads.length > 0 && (
                <Text className={styles.nodeReads}>
                    Reads {node.reads.join(', ')}
                </Text>
            )}
            {node.query.sourceType === QuerySourceType.SEMANTIC_LAYER && (
                <SemanticFields query={node.query} />
            )}
            {sql && (
                <Box className={styles.code}>
                    <CodeBlock code={sql} language="sql" />
                </Box>
            )}
        </Box>
    );
};

const PipelineList: FC<{
    layers: PipelineLayer[];
    selectedNodeId: string | null;
}> = ({ layers, selectedNodeId }) => {
    const bodyRef = useRef<HTMLDivElement>(null);
    // Centre the row chosen in the graph once the list has mounted.
    useEffect(() => {
        if (!selectedNodeId) return;
        const row = bodyRef.current?.querySelector<HTMLElement>(
            `#${pipelineNodeRowId(selectedNodeId)}`,
        );
        row?.scrollIntoView?.({ block: 'center' });
    }, [selectedNodeId]);
    return (
        <Box className={styles.body} ref={bodyRef}>
            {layers.map((layer) => (
                <Box key={layer.depth} className={styles.layer}>
                    <Group gap={4} className={styles.layerHeading}>
                        <Text component="span" inherit>
                            {layerLabel(layer)}
                        </Text>
                        {layer.kind === 'transformations' && (
                            <Tooltip
                                label={TRANSFORMATIONS_HELP}
                                multiline
                                w={260}
                                position="top-start"
                            >
                                <ActionIcon
                                    variant="subtle"
                                    size="xs"
                                    className={styles.helpIcon}
                                    aria-label="About transformations"
                                >
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size={12}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                    {layer.nodes.map((node) => (
                        <PipelineNodeRow
                            key={node.nodeId}
                            node={node}
                            selected={node.nodeId === selectedNodeId}
                        />
                    ))}
                </Box>
            ))}
        </Box>
    );
};

const PipelineFlowNodeView: FC<NodeProps<PipelineFlowNode>> = ({ data }) => (
    <Paper
        component="button"
        type="button"
        className={styles.graphNode}
        data-terminal={data.isTerminal}
        aria-label={`Go to ${data.title}`}
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
            {data.sourceLabel && (
                <Text component="span" className={styles.graphNodeType}>
                    {data.sourceLabel}
                </Text>
            )}
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

const PipelineFlow: FC<{
    layers: PipelineLayer[];
    onSelect: (nodeId: string) => void;
}> = ({ layers, onSelect }) => {
    const flow = useMemo(() => toPipelineFlow(layers), [layers]);
    const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
    const [laidOut, setLaidOut] = useState(false);
    const initialized = useNodesInitialized();
    const { fitView } = useReactFlow();
    const { ref, width, height } = useElementSize();

    // Positions need measured sizes, so lay out once React Flow has them.
    useEffect(() => {
        if (!initialized || laidOut) return;
        setNodes((current) => layoutPipelineFlow(current, flow.edges));
        setLaidOut(true);
    }, [initialized, laidOut, flow.edges, setNodes]);

    useEffect(() => {
        if (laidOut) void fitView(FIT_VIEW_OPTIONS);
    }, [laidOut, width, height, fitView]);

    return (
        <Box className={styles.graph} ref={ref}>
            <ReactFlow<PipelineFlowNode>
                className={clsx(
                    reactFlowStyles.reactFlow,
                    !laidOut && styles.flowPending,
                )}
                nodes={nodes}
                edges={flow.edges}
                onNodesChange={onNodesChange}
                onNodeClick={(_, node) => onSelect(node.id)}
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
            />
        </Box>
    );
};

// Remount the flow when the pipeline shape changes so node state re-initialises.
const pipelineKey = (layers: PipelineLayer[]) =>
    layers
        .flatMap((layer) => layer.nodes)
        .map((node) => `${node.nodeId}<${node.readNodeIds.join(',')}`)
        .join('|');

/** Nodes as boxes, reads as edges, laid out left to right. */
const PipelineGraph: FC<{
    layers: PipelineLayer[];
    onSelect: (nodeId: string) => void;
}> = ({ layers, onSelect }) =>
    layers.length === 0 ? null : (
        <ReactFlowProvider>
            <PipelineFlow
                key={pipelineKey(layers)}
                layers={layers}
                onSelect={onSelect}
            />
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

type Props = {
    queries: SourceQuery[];
    terminalNodeId: string;
    /** The results shown above the panel. */
    children: ReactNode;
    defaultExpanded?: boolean;
    defaultMode?: PipelineMode;
};

/**
 * Pipeline panel: results on top, the pipeline underneath. Collapsed it is a
 * single bar; expanded it becomes a vertical splitter the user can drag.
 */
export const AiComposerPipelinePanel: FC<Props> = ({
    queries,
    terminalNodeId,
    children,
    defaultExpanded = false,
    defaultMode = 'list',
}) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [mode, setMode] = useState<PipelineMode>(defaultMode);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const layers = useMemo(
        () => groupPipeline(queries, terminalNodeId),
        [queries, terminalNodeId],
    );
    const bar = (
        <PipelineBar
            nodeCount={queries.length}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            mode={mode}
            onModeChange={setMode}
        />
    );
    const selectNode = (nodeId: string) => {
        setSelectedNodeId(nodeId);
        setMode('list');
    };

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
                        <PipelineGraph layers={layers} onSelect={selectNode} />
                    ) : (
                        <PipelineList
                            layers={layers}
                            selectedNodeId={selectedNodeId}
                        />
                    )}
                </Box>
            </ResizableSplitter.Pane>
        </ResizableSplitter>
    );
};
