import {
    formatSql,
    friendlyName,
    QuerySourceType,
    WarehouseTypes,
} from '@lightdash/common';
import {
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
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import CodeBlock from '../../../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../../../components/common/MantineIcon';
import ResizableSplitter from '../../../../../components/common/ResizableSplitter';
import { LD_FIELD_COLORS } from '../../../../../theme/fieldColors';
import styles from './AiComposerPipelineFooter.module.css';
import {
    getNodeReads,
    layoutPipeline,
    type PipelineLayer,
    type PipelineNode,
} from './composerPipelineDag';
import { type ComposerQueryNodeStatus } from './ToolCalls/descriptions/ComposerQueriesToolCallDescription';

// PROTOTYPE ONLY. The pipeline lives at the bottom of the artifact as a
// collapsible, resizable panel. Type is shown by icon and label, not colour.

type NodeStatuses = Record<string, ComposerQueryNodeStatus>;

/** Source engines get a label; transformations are explained once at the heading. */
const nodeType = (node: PipelineNode) => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return { label: 'Semantic layer', icon: IconSitemap };
        case QuerySourceType.SQL:
            return { label: 'Warehouse SQL', icon: IconDatabase };
        case QuerySourceType.EXTERNAL:
            return { label: 'External data', icon: IconFileSpreadsheet };
        case QuerySourceType.DUCKDB:
            return null;
        default:
            return { label: 'Query', icon: IconDatabase };
    }
};

/** Explore plus its fields, in the same colours the explorer and chat use. */
const SemanticFields: FC<{
    exploreName: string;
    dimensions: string[];
    metrics: string[];
}> = ({ exploreName, dimensions, metrics }) => (
    <Group gap={4} className={styles.fields}>
        <Text component="span" className={styles.exploreName}>
            {friendlyName(exploreName)}
        </Text>
        {dimensions.map((fieldId) => (
            <Box
                key={fieldId}
                component="span"
                className={styles.fieldChip}
                bg={LD_FIELD_COLORS.dimension.bg}
                c={LD_FIELD_COLORS.dimension.color}
            >
                {friendlyName(fieldId.replace(`${exploreName}_`, ''))}
            </Box>
        ))}
        {metrics.map((fieldId) => (
            <Box
                key={fieldId}
                component="span"
                className={styles.fieldChip}
                bg={LD_FIELD_COLORS.metric.bg}
                c={LD_FIELD_COLORS.metric.color}
            >
                {friendlyName(fieldId.replace(`${exploreName}_`, ''))}
            </Box>
        ))}
    </Group>
);

const NODE_W = 160;
const NODE_H = 40;
const COL_GAP = 56;
const ROW_GAP = 12;

/** Layers as columns, nodes as boxes, reads as curved edges. Click a node to jump to its step. */
const PipelineGraph: FC<{
    layers: PipelineLayer[];
    terminalNodeId: string;
    nodeStatuses?: NodeStatuses;
    onSelect: (nodeId: string) => void;
}> = ({ layers, terminalNodeId, nodeStatuses, onSelect }) => {
    const tallest = Math.max(...layers.map((layer) => layer.nodes.length));
    const height = tallest * NODE_H + (tallest - 1) * ROW_GAP + 16;
    const width = layers.length * NODE_W + (layers.length - 1) * COL_GAP + 16;
    const positions = new Map<string, { x: number; y: number }>();
    layers.forEach((layer, column) => {
        const layerHeight =
            layer.nodes.length * NODE_H + (layer.nodes.length - 1) * ROW_GAP;
        const offset = (height - 16 - layerHeight) / 2;
        layer.nodes.forEach((node, row) => {
            positions.set(node.nodeId, {
                x: 8 + column * (NODE_W + COL_GAP),
                y: 8 + offset + row * (NODE_H + ROW_GAP),
            });
        });
    });
    const nodeIds = new Set(positions.keys());
    const byId = new Map(
        layers.flatMap((layer) =>
            layer.nodes.map((node) => [node.nodeId, node]),
        ),
    );
    return (
        <Box className={styles.graphScroll}>
            <svg
                className={styles.graph}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label="Pipeline graph"
            >
                {[...nodeIds].flatMap((nodeId) =>
                    getNodeReads(byId.get(nodeId)!, nodeIds).map((read) => {
                        const from = positions.get(read)!;
                        const to = positions.get(nodeId)!;
                        const x1 = from.x + NODE_W;
                        const y1 = from.y + NODE_H / 2;
                        const x2 = to.x;
                        const y2 = to.y + NODE_H / 2;
                        const mid = (x1 + x2) / 2;
                        return (
                            <path
                                key={`${read}->${nodeId}`}
                                className={styles.graphEdge}
                                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                            />
                        );
                    }),
                )}
                {[...positions.entries()].map(([nodeId, { x, y }]) => {
                    const node = byId.get(nodeId)!;
                    const type = nodeType(node);
                    return (
                        <g
                            key={nodeId}
                            className={styles.graphNode}
                            data-terminal={nodeId === terminalNodeId}
                            transform={`translate(${x} ${y})`}
                            onClick={() => onSelect(nodeId)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Go to ${node.title ?? nodeId}`}
                        >
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
                                data-status={nodeStatuses?.[nodeId]?.status}
                            />
                            <text
                                className={styles.graphNodeTitle}
                                x={22}
                                y={17}
                            >
                                {node.title ?? nodeId}
                            </text>
                            {type && (
                                <text
                                    className={styles.graphNodeType}
                                    x={22}
                                    y={31}
                                >
                                    {type.label.toUpperCase()}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </Box>
    );
};

const layerLabel = (layer: PipelineLayer, layerCount: number) => {
    if (layer.depth === 0)
        return layer.nodes.length === 1 ? 'Source' : 'Sources';
    if (layer.depth === layerCount - 1) return 'Result';
    return layer.nodes.length === 1 ? 'Transformation' : 'Transformations';
};

const PipelineNodeRow: FC<{
    node: PipelineNode;
    nodeIds: Set<string>;
    isTerminal: boolean;
    status?: ComposerQueryNodeStatus;
    selected: boolean;
    titleOf: (nodeId: string) => string;
}> = ({ node, nodeIds, isTerminal, status, selected, titleOf }) => {
    const type = nodeType(node);
    const reads = getNodeReads(node, nodeIds);
    const sql =
        'sql' in node
            ? formatSql(
                  node.sql,
                  node.sourceType === QuerySourceType.DUCKDB ||
                      node.sourceType === QuerySourceType.EXTERNAL
                      ? WarehouseTypes.DUCKDB
                      : undefined,
              )
            : null;
    return (
        <Box
            className={styles.node}
            id={`composer-pipeline-node-${node.nodeId}`}
            data-selected={selected}
        >
            <Box className={styles.nodeHead}>
                <Box className={styles.dot} data-status={status?.status} />
                <Text component="span" className={styles.nodeTitle}>
                    {node.title ?? node.nodeId}
                    {isTerminal ? ' · result' : ''}
                </Text>
                {type && (
                    <Text component="span" className={styles.nodeType}>
                        <MantineIcon icon={type.icon} size={11} />
                        {type.label}
                    </Text>
                )}
            </Box>
            {node.description && (
                <Text className={styles.nodeDescription}>
                    {node.description}
                </Text>
            )}
            {reads.length > 0 && (
                <Text className={styles.nodeReads}>
                    Reads {reads.map((read) => titleOf(read)).join(', ')}
                </Text>
            )}
            {node.sourceType === QuerySourceType.SEMANTIC_LAYER && (
                <SemanticFields
                    exploreName={node.exploreName}
                    dimensions={node.dimensions}
                    metrics={node.metrics}
                />
            )}
            {sql && (
                <Box className={styles.code}>
                    <CodeBlock code={sql} language="sql" />
                </Box>
            )}
            {status?.status === 'error' && status.errorMessage && (
                <Text className={styles.error}>{status.errorMessage}</Text>
            )}
        </Box>
    );
};

type PipelineProps = {
    nodes: PipelineNode[];
    terminalNodeId: string;
    nodeStatuses?: NodeStatuses;
    durationLabel: string | null;
};

type PipelineTab = 'steps' | 'graph';

const PipelineBar: FC<
    PipelineProps & {
        expanded: boolean;
        onToggle: () => void;
        tab: PipelineTab;
        onTabChange: (tab: PipelineTab) => void;
    }
> = ({ nodes, durationLabel, expanded, onToggle, tab, onTabChange }) => {
    return (
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
                    className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
                />
                <Text component="span" className={styles.heading}>
                    Queries
                </Text>
            </UnstyledButton>
            {expanded && (
                <SegmentedControl
                    size="xs"
                    value={tab}
                    onChange={(value) =>
                        onTabChange(value === 'graph' ? 'graph' : 'steps')
                    }
                    data={[
                        { label: 'List', value: 'steps' },
                        { label: 'Graph', value: 'graph' },
                    ]}
                />
            )}
            <Text component="span" className={styles.meta}>
                {nodes.length} step{nodes.length === 1 ? '' : 's'}
                {durationLabel ? ` · ${durationLabel}` : ''}
            </Text>
        </Box>
    );
};

const PipelineBody: FC<
    PipelineProps & {
        tab: PipelineTab;
        selectedNodeId: string | null;
        onSelect: (nodeId: string) => void;
    }
> = ({
    nodes,
    terminalNodeId,
    nodeStatuses,
    tab,
    selectedNodeId,
    onSelect,
}) => {
    const layers = useMemo(() => layoutPipeline(nodes), [nodes]);
    const nodeIds = useMemo(
        () => new Set(nodes.map((node) => node.nodeId)),
        [nodes],
    );
    const titleOf = (nodeId: string) =>
        nodes.find((node) => node.nodeId === nodeId)?.title ?? nodeId;
    const bodyRef = useRef<HTMLDivElement>(null);
    // Scroll the chosen step into view after the graph hands off to Steps.
    useEffect(() => {
        if (tab !== 'steps' || !selectedNodeId) return;
        bodyRef.current
            ?.querySelector(`#composer-pipeline-node-${selectedNodeId}`)
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [tab, selectedNodeId]);

    if (tab === 'graph') {
        return (
            <Box className={styles.body}>
                <PipelineGraph
                    layers={layers}
                    terminalNodeId={terminalNodeId}
                    nodeStatuses={nodeStatuses}
                    onSelect={onSelect}
                />
            </Box>
        );
    }
    return (
        <Box className={styles.body} ref={bodyRef}>
            {layers.map((layer) => (
                <Box key={layer.depth} className={styles.layer}>
                    <Group gap={4} className={styles.layerHeading}>
                        <Text component="span" inherit>
                            {layerLabel(layer, layers.length)}
                        </Text>
                        {layer.depth > 0 && layer.depth < layers.length - 1 && (
                            <Tooltip
                                label="Transformations run in DuckDB on top of the source results. They never touch the warehouse."
                                multiline
                                w={260}
                                position="top-start"
                            >
                                <Box className={styles.helpIcon}>
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size={12}
                                    />
                                </Box>
                            </Tooltip>
                        )}
                    </Group>
                    {layer.nodes.map((node) => (
                        <PipelineNodeRow
                            key={node.nodeId}
                            node={node}
                            nodeIds={nodeIds}
                            isTerminal={node.nodeId === terminalNodeId}
                            status={nodeStatuses?.[node.nodeId]}
                            selected={node.nodeId === selectedNodeId}
                            titleOf={titleOf}
                        />
                    ))}
                </Box>
            ))}
        </Box>
    );
};

/**
 * Results on top, pipeline underneath. Collapsed: results fill the panel and
 * the pipeline is a 34px bar. Expanded: a vertical splitter the user drags.
 */
export const AiComposerPipelinePanel: FC<
    PipelineProps & { children: ReactNode; defaultExpanded?: boolean }
> = ({ children, defaultExpanded = false, ...pipeline }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [tab, setTab] = useState<PipelineTab>('steps');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const bar = (
        <PipelineBar
            {...pipeline}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            tab={tab}
            onTabChange={setTab}
        />
    );

    if (!expanded) {
        return (
            <Box className={styles.root}>
                <Box flex={1} mih={0}>
                    {children}
                </Box>
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
                <Box h="100%" mih={0}>
                    {children}
                </Box>
            </ResizableSplitter.Pane>
            <ResizableSplitter.Pane id="pipeline" defaultSize={45} min={10}>
                <Box className={styles.root}>
                    {bar}
                    <PipelineBody
                        {...pipeline}
                        tab={tab}
                        selectedNodeId={selectedNodeId}
                        onSelect={(nodeId) => {
                            setSelectedNodeId(nodeId);
                            setTab('steps');
                        }}
                    />
                </Box>
            </ResizableSplitter.Pane>
        </ResizableSplitter>
    );
};
