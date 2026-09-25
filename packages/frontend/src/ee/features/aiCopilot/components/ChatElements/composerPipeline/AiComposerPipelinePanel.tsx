import {
    assertUnreachable,
    formatSql,
    friendlyName,
    metricQueryOfSemanticNode,
    QuerySourceType,
    WarehouseTypes,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    Loader,
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
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import '@xyflow/react/dist/style.css';
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import InlineErrorState from '../../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import DefaultEdge from '../../../../../../components/common/ReactFlow/DefaultEdge';
import reactFlowStyles from '../../../../../../components/common/ReactFlow/reactFlow.module.css';
import ResizableSplitter from '../../../../../../components/common/ResizableSplitter';
import { useCompiledSqlFromMetricQuery } from '../../../../../../hooks/useCompiledSql';
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

const formattedSqlOf = (
    query: Exclude<SourceQuery, SemanticLayerSourceQuery>,
) => {
    switch (query.sourceType) {
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

const SourceType: FC<{ query: SourceQuery }> = ({ query }) => {
    const label = sourceLabelOf(query);
    const icon = sourceIcon(query);
    if (!label || !icon) return null;
    return (
        <Text component="span" className={styles.nodeType}>
            <MantineIcon icon={icon} size={11} />
            {label}
        </Text>
    );
};

// Semantic nodes carry no SQL; the query is compiled once View query opens.
const SemanticQuerySql: FC<{
    query: SemanticLayerSourceQuery;
    projectUuid: string;
}> = ({ query, projectUuid }) => {
    const metricQuery = useMemo(
        () => metricQueryOfSemanticNode(query),
        [query],
    );
    const { data, error, refetch } = useCompiledSqlFromMetricQuery({
        tableName: query.exploreName,
        projectUuid,
        metricQuery,
        pivotConfiguration: query.pivotConfiguration,
    });
    if (data) return <CodeBlock code={formatSql(data.query)} language="sql" />;
    if (error) {
        return (
            <InlineErrorState
                message="Could not compile this query."
                onRetry={() => void refetch()}
            />
        );
    }
    return (
        <Group gap="xs" p="sm">
            <Loader size="xs" color="ldGray.6" />
            <Text fz="xs" c="dimmed">
                Compiling query…
            </Text>
        </Group>
    );
};

const QueryDetails: FC<{ query: SourceQuery; projectUuid: string }> = ({
    query,
    projectUuid,
}) => {
    const [queryOpen, setQueryOpen] = useState(false);
    return (
        <>
            {query.sourceType === QuerySourceType.SEMANTIC_LAYER && (
                <SemanticFields query={query} />
            )}
            {/* Reading or copying the query must not display the node. */}
            <Box
                className={styles.details}
                onClick={(event) => event.stopPropagation()}
            >
                <UnstyledButton
                    className={styles.queryToggle}
                    onClick={() => setQueryOpen((value) => !value)}
                    aria-expanded={queryOpen}
                >
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={clsx(
                            styles.chevron,
                            queryOpen && styles.chevronOpen,
                        )}
                    />
                    {queryOpen ? 'Hide query' : 'View query'}
                </UnstyledButton>
                <Collapse
                    expanded={queryOpen}
                    transitionDuration={240}
                    transitionTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
                >
                    <Box className={styles.code}>
                        {query.sourceType === QuerySourceType.SEMANTIC_LAYER ? (
                            queryOpen && (
                                <SemanticQuerySql
                                    query={query}
                                    projectUuid={projectUuid}
                                />
                            )
                        ) : (
                            <CodeBlock
                                code={formattedSqlOf(query)}
                                language="sql"
                            />
                        )}
                    </Box>
                </Collapse>
            </Box>
        </>
    );
};

type NodeDisplay = {
    displayedNodeId: string;
    /** Nodes with a stored result; the rest are inert. */
    displayableNodeIds: ReadonlySet<string>;
    onDisplayNode: (nodeId: string) => void;
};

const PipelineNodeRow: FC<
    { node: PipelineNode; projectUuid: string } & NodeDisplay
> = ({
    node,
    projectUuid,
    displayedNodeId,
    displayableNodeIds,
    onDisplayNode,
}) => {
    const displayed = node.nodeId === displayedNodeId;
    const displayable = displayableNodeIds.has(node.nodeId);
    const head = (
        <>
            <Box className={styles.dot} />
            <Text component="span" className={styles.nodeTitle}>
                {node.title}
            </Text>
            {node.kind === 'query' && <SourceType query={node.query} />}
        </>
    );
    // The whole card is the click target; it holds other controls, so it is
    // a div with a button role rather than a native button.
    const clickable = displayable
        ? {
              role: 'button',
              tabIndex: 0,
              onClick: () => onDisplayNode(node.nodeId),
              onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onDisplayNode(node.nodeId);
                  }
              },
              'aria-pressed': displayed,
              'aria-label': `Display ${node.title}`,
          }
        : {};
    return (
        <Box
            className={clsx(
                styles.node,
                displayable && styles.clickable,
                displayed && styles.displayed,
            )}
            id={pipelineNodeRowId(node.nodeId)}
            data-node-id={node.nodeId}
            data-displayed={displayed}
            {...clickable}
        >
            <Box className={styles.nodeHead}>{head}</Box>
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
            {node.kind === 'query' && (
                <QueryDetails query={node.query} projectUuid={projectUuid} />
            )}
        </Box>
    );
};

const PipelineList: FC<
    { layers: PipelineLayer[]; projectUuid: string } & NodeDisplay
> = ({ layers, projectUuid, ...display }) => (
    <Box className={styles.body}>
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
                                <MantineIcon icon={IconHelpCircle} size={12} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                {layer.nodes.map((node) => (
                    <PipelineNodeRow
                        projectUuid={projectUuid}
                        key={node.nodeId}
                        node={node}
                        {...display}
                    />
                ))}
            </Box>
        ))}
    </Box>
);

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

type Props = NodeDisplay & {
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
// collapsed, a draggable splitter when expanded. Clicking a node displays it.
export const AiComposerPipelinePanel: FC<Props> = ({
    projectUuid,
    queries,
    terminalNodeId,
    displayedNodeId,
    displayableNodeIds,
    onDisplayNode,
    children,
    defaultExpanded = false,
    expanded: controlledExpanded,
    onExpandedChange,
    defaultMode = 'list',
}) => {
    const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
    const expanded = controlledExpanded ?? ownExpanded;
    const [mode, setMode] = useState<PipelineMode>(defaultMode);
    const display: NodeDisplay = {
        displayedNodeId,
        displayableNodeIds,
        onDisplayNode,
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
                        <PipelineList
                            layers={layers}
                            projectUuid={projectUuid}
                            {...display}
                        />
                    )}
                </Box>
            </ResizableSplitter.Pane>
        </ResizableSplitter>
    );
};
