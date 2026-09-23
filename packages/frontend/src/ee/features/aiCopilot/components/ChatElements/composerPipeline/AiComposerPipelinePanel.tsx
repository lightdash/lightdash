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
    SegmentedControl,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChevronRight,
    IconDatabase,
    IconFileSpreadsheet,
    IconHelpCircle,
    IconSitemap,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import CodeBlock from '../../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../../../components/common/ResizableSplitter';
import { LD_FIELD_COLORS } from '../../../../../../theme/fieldColors';
import styles from './AiComposerPipelinePanel.module.css';
import {
    groupPipeline,
    type PipelineLayer,
    type PipelineNode,
} from './groupPipeline';

const TRANSFORMATIONS_HELP =
    'Transformations run in DuckDB on top of the source results. They never touch the warehouse.';

const pipelineNodeRowId = (nodeId: string) =>
    `composer-pipeline-node-${nodeId}`;

export type PipelineMode = 'list' | 'graph';

const NODE_W = 160;
const NODE_H = 40;
const COL_GAP = 56;
const ROW_GAP = 12;
const GRAPH_PAD = 8;
const TEXT_X = 22;
const TEXT_W = NODE_W - TEXT_X - 8;

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

const sourceLabel = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return { label: 'Semantic layer', icon: IconSitemap };
        case QuerySourceType.SQL:
            return { label: 'Warehouse SQL', icon: IconDatabase };
        case QuerySourceType.EXTERNAL:
            return { label: 'External data', icon: IconFileSpreadsheet };
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
    const source = sourceLabel(node.query);
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
                {source && (
                    <Text component="span" className={styles.nodeType}>
                        <MantineIcon icon={source.icon} size={11} />
                        {source.label}
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

/**
 * Columns by depth, with the terminal alone in the last column wherever it
 * sits; columns left empty by a multi-sink pipeline are compacted away.
 */
const layoutGraph = (nodes: PipelineNode[]) => {
    const others = nodes.filter((node) => !node.isTerminal);
    const lastColumn =
        others.length === 0
            ? 0
            : Math.max(...others.map((node) => node.depth)) + 1;
    const columns = new Map<number, PipelineNode[]>();
    nodes.forEach((node) => {
        const column = node.isTerminal ? lastColumn : node.depth;
        columns.set(column, [...(columns.get(column) ?? []), node]);
    });
    const ordered = [...columns.keys()]
        .sort((a, b) => a - b)
        .map((column) => columns.get(column)!);
    const tallest = Math.max(0, ...ordered.map((column) => column.length));
    const height = tallest * NODE_H + (tallest - 1) * ROW_GAP + GRAPH_PAD * 2;
    const width =
        ordered.length * NODE_W +
        (ordered.length - 1) * COL_GAP +
        GRAPH_PAD * 2;
    const positions = new Map<string, { x: number; y: number }>();
    ordered.forEach((columnNodes, column) => {
        const columnHeight =
            columnNodes.length * NODE_H + (columnNodes.length - 1) * ROW_GAP;
        const offset = (height - GRAPH_PAD * 2 - columnHeight) / 2;
        columnNodes.forEach((node, row) => {
            positions.set(node.nodeId, {
                x: GRAPH_PAD + column * (NODE_W + COL_GAP),
                y: GRAPH_PAD + offset + row * (NODE_H + ROW_GAP),
            });
        });
    });
    return { width, height, positions };
};

const GraphNode: FC<{
    node: PipelineNode;
    x: number;
    y: number;
    idPrefix: string;
    onSelect: (nodeId: string) => void;
}> = ({ node, x, y, idPrefix, onSelect }) => {
    const source = sourceLabel(node.query);
    const clipId = `${idPrefix}-clip-${node.nodeId}`;
    const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect(node.nodeId);
    };
    return (
        <g
            className={styles.graphNode}
            data-terminal={node.isTerminal}
            transform={`translate(${x} ${y})`}
            onClick={() => onSelect(node.nodeId)}
            onKeyDown={onKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Go to ${node.title}`}
        >
            <title>{node.title}</title>
            <clipPath id={clipId}>
                <rect x={TEXT_X} y={0} width={TEXT_W} height={NODE_H} />
            </clipPath>
            <rect
                className={styles.graphNodeBox}
                width={NODE_W}
                height={NODE_H}
                rx={6}
            />
            <circle
                className={styles.graphNodeDot}
                cx={12}
                cy={NODE_H / 2}
                r={3}
            />
            <g clipPath={`url(#${clipId})`}>
                <text
                    className={styles.graphNodeTitle}
                    x={TEXT_X}
                    y={source ? 17 : NODE_H / 2 + 4}
                >
                    {node.title}
                </text>
                {source && (
                    <text className={styles.graphNodeType} x={TEXT_X} y={31}>
                        {source.label.toUpperCase()}
                    </text>
                )}
            </g>
        </g>
    );
};

/** Layers as columns, nodes as boxes, reads as curved edges. */
const PipelineGraph: FC<{
    layers: PipelineLayer[];
    onSelect: (nodeId: string) => void;
}> = ({ layers, onSelect }) => {
    // useId separators are not valid in url(#...) references
    const idPrefix = `composer-pipeline-${useId().replace(/\W/g, '')}`;
    const nodes = useMemo(
        () => layers.flatMap((layer) => layer.nodes),
        [layers],
    );
    const { width, height, positions } = useMemo(
        () => layoutGraph(nodes),
        [nodes],
    );
    if (nodes.length === 0) return null;
    return (
        <Box className={styles.graphScroll}>
            <svg
                className={styles.graph}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                aria-label="Pipeline graph"
            >
                {nodes.flatMap((node) =>
                    node.readNodeIds.map((readId) => {
                        const from = positions.get(readId)!;
                        const to = positions.get(node.nodeId)!;
                        const x1 = from.x + NODE_W;
                        const y1 = from.y + NODE_H / 2;
                        const x2 = to.x;
                        const y2 = to.y + NODE_H / 2;
                        const mid = (x1 + x2) / 2;
                        return (
                            <path
                                key={`${readId}->${node.nodeId}`}
                                className={styles.graphEdge}
                                data-testid="composer-pipeline-edge"
                                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                            />
                        );
                    }),
                )}
                {nodes.map((node) => {
                    const { x, y } = positions.get(node.nodeId)!;
                    return (
                        <GraphNode
                            key={node.nodeId}
                            node={node}
                            x={x}
                            y={y}
                            idPrefix={idPrefix}
                            onSelect={onSelect}
                        />
                    );
                })}
            </svg>
        </Box>
    );
};

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
