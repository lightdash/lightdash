import Dagre from '@dagrejs/dagre';
import {
    Box,
    Divider,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { type MetricLineage } from '../../api/MetricFlowAPI';

const MODEL_VIEW_NODE_TYPES = new Set([
    'relation',
    'dbt_model',
    'semantic_model',
    'model',
    'metric',
    'metric_output_column',
]);

type LineageNode = MetricLineage['lineage']['nodes'][number];

type LineageEdge = {
    source: string;
    target: string;
    points?: Array<{ x: number; y: number }>;
};

type LayoutNode = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    metaLines: string[];
    isMetric: boolean;
};

const getNodeTitle = (node: LineageNode) => {
    const candidate =
        node.label || node.name || node.alias || node.identifier || node.id;
    const suffix = candidate.split('::').pop() || candidate;
    if (node.type === 'relation' || node.type === 'dbt_model') {
        return suffix.split('.').pop() || suffix;
    }
    return suffix;
};

const isMetricNode = (node: LineageNode) =>
    node.type === 'metric' || node.type === 'metric_output_column';

const truncateText = (value: string, maxLength: number) => {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
};

const buildNodeLines = (node: LineageNode) => {
    const title = getNodeTitle(node);
    const metaLines: string[] = [];

    if (isMetricNode(node)) {
        if (node.formulaDisplay) {
            metaLines.push(`公式: ${truncateText(node.formulaDisplay, 60)}`);
        } else if (node.agg && node.expr) {
            metaLines.push(
                `公式: ${truncateText(
                    `${node.agg.toUpperCase()}(${node.expr})`,
                    60,
                )}`,
            );
        }
        if (node.filterRaw) {
            metaLines.push(`过滤: ${truncateText(node.filterRaw, 60)}`);
        }
    }

    return { title, metaLines };
};

const estimateTextWidth = (text: string) => {
    return Array.from(text).reduce(
        (sum, char) => sum + (char.charCodeAt(0) > 255 ? 12 : 7),
        0,
    );
};

const measureNode = (title: string, metaLines: string[], isMetric: boolean) => {
    const lines = [title, ...metaLines];
    const maxLineWidth = Math.max(...lines.map(estimateTextWidth));
    const minWidth = isMetric ? 220 : 180;
    const width = Math.min(Math.max(minWidth, maxLineWidth + 32), 360);
    const lineHeight = 16;
    const height = Math.max(52, 28 + lineHeight * lines.length);
    return { width, height };
};

const buildModelLineage = (lineage: MetricLineage['lineage']) => {
    const viewNodes = lineage.nodes.filter((node) =>
        MODEL_VIEW_NODE_TYPES.has(node.type),
    );
    const viewNodeIds = new Set(viewNodes.map((node) => node.id));

    if (viewNodes.length === 0) {
        return { nodes: [], edges: [] } as {
            nodes: LineageNode[];
            edges: LineageEdge[];
        };
    }

    const adjacency = new Map<string, Set<string>>();
    lineage.edges.forEach((edge) => {
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
        adjacency.get(edge.from)!.add(edge.to);
    });

    const edgeMap = new Map<string, LineageEdge>();

    viewNodes.forEach((sourceNode) => {
        const visited = new Set<string>([sourceNode.id]);
        const queue: string[] = [sourceNode.id];

        while (queue.length > 0) {
            const current = queue.shift()!;
            const neighbors = adjacency.get(current);
            if (!neighbors) continue;

            neighbors.forEach((neighbor) => {
                if (visited.has(neighbor)) return;
                if (viewNodeIds.has(neighbor) && neighbor !== sourceNode.id) {
                    const key = `${sourceNode.id}::${neighbor}`;
                    edgeMap.set(key, {
                        source: sourceNode.id,
                        target: neighbor,
                    });
                    return;
                }
                visited.add(neighbor);
                queue.push(neighbor);
            });
        }
    });

    return {
        nodes: viewNodes,
        edges: Array.from(edgeMap.values()),
    };
};

const NODE_TYPE_PRIORITY: Record<string, number> = {
    relation: 1,
    dbt_model: 2,
    semantic_model: 3,
    model: 4,
    metric_output_column: 5,
    metric: 6,
    measure: 7,
    dimension: 8,
    column: 9,
};

const sortNodesForLayout = (nodes: LineageNode[]) =>
    [...nodes].sort((a, b) => {
        const priorityA = NODE_TYPE_PRIORITY[a.type] ?? 99;
        const priorityB = NODE_TYPE_PRIORITY[b.type] ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return getNodeTitle(a).localeCompare(getNodeTitle(b));
    });

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        const midX = (start.x + end.x) / 2;
        d += ` C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
    }
    return d;
};

const layoutWithDagre = (nodes: LineageNode[], edges: LineageEdge[]) => {
    const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({
        rankdir: 'LR',
        nodesep: 72,
        ranksep: 180,
        marginx: 40,
        marginy: 40,
        ranker: 'tight-tree',
        align: 'UL',
    });

    const nodeMap = new Map<string, LayoutNode>();

    sortNodesForLayout(nodes).forEach((node) => {
        const { title, metaLines } = buildNodeLines(node);
        const isMetric = isMetricNode(node);
        const { width, height } = measureNode(title, metaLines, isMetric);

        graph.setNode(node.id, { width, height });
        nodeMap.set(node.id, {
            id: node.id,
            x: 0,
            y: 0,
            width,
            height,
            title,
            metaLines,
            isMetric,
        });
    });

    edges.forEach((edge) => {
        graph.setEdge(edge.source, edge.target);
    });

    Dagre.layout(graph);

    const layoutNodes = Array.from(nodeMap.values()).map((node) => {
        const position = graph.node(node.id);
        return {
            ...node,
            x: position.x,
            y: position.y,
        };
    });

    const layoutEdges: LineageEdge[] = edges.map((edge) => {
        const edgeData = graph.edge(edge.source, edge.target);
        return {
            ...edge,
            points: edgeData?.points ?? [],
        };
    });

    const bounds = layoutNodes.reduce(
        (acc, node) => {
            const left = node.x - node.width / 2;
            const right = node.x + node.width / 2;
            const top = node.y - node.height / 2;
            const bottom = node.y + node.height / 2;
            return {
                minX: Math.min(acc.minX, left),
                maxX: Math.max(acc.maxX, right),
                minY: Math.min(acc.minY, top),
                maxY: Math.max(acc.maxY, bottom),
            };
        },
        {
            minX: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            minY: Number.POSITIVE_INFINITY,
            maxY: Number.NEGATIVE_INFINITY,
        },
    );

    layoutEdges.forEach((edge) => {
        edge.points?.forEach((point) => {
            bounds.minX = Math.min(bounds.minX, point.x);
            bounds.maxX = Math.max(bounds.maxX, point.x);
            bounds.minY = Math.min(bounds.minY, point.y);
            bounds.maxY = Math.max(bounds.maxY, point.y);
        });
    });

    const padding = 40;
    const width = Math.max(1200, bounds.maxX - bounds.minX + padding * 2);
    const height = Math.max(240, bounds.maxY - bounds.minY + padding * 2);

    return {
        nodes: layoutNodes,
        edges: layoutEdges,
        width,
        height,
        viewBox: `${bounds.minX - padding} ${bounds.minY - padding} ${width} ${height}`,
    };
};

const MetricLineageGraph: FC<{
    lineage?: MetricLineage['lineage'];
    view: 'model' | 'full';
}> = ({ lineage, view }) => {
    const theme = useMantineTheme();

    const layout = useMemo(() => {
        if (!lineage?.nodes?.length) return null;
        const graphData =
            view === 'model'
                ? buildModelLineage(lineage)
                : { nodes: lineage.nodes, edges: lineage.edges };
        const edges = graphData.edges.map((edge) =>
            'source' in edge
                ? { source: edge.source, target: edge.target }
                : { source: edge.from, target: edge.to },
        );
        return layoutWithDagre(graphData.nodes, edges);
    }, [lineage, view]);

    if (!layout || !lineage?.nodes?.length) {
        return (
            <Text size="xs" c="ldGray.6">
                暂无血缘数据。
            </Text>
        );
    }

    return (
        <Box sx={{ overflowX: 'auto', overflowY: 'hidden', width: '100%' }}>
            <svg
                width={layout.width}
                height={layout.height}
                viewBox={layout.viewBox}
                style={{ display: 'block', minWidth: layout.width }}
            >
                <defs>
                    <marker
                        id="lineage-arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                    >
                        <path
                            d="M 0 0 L 10 5 L 0 10 z"
                            fill={theme.colors.ldGray[4]}
                        />
                    </marker>
                </defs>
                <g>
                    {layout.edges.map((edge, index) => {
                        const path = edge.points
                            ? buildSmoothPath(edge.points)
                            : '';
                        return (
                            <path
                                key={`${edge.source}-${edge.target}-${index}`}
                                d={path}
                                fill="none"
                                stroke={theme.colors.ldGray[3]}
                                strokeWidth={1.5}
                                markerEnd="url(#lineage-arrow)"
                            />
                        );
                    })}
                </g>
                <g>
                    {layout.nodes.map((node) => {
                        const x = node.x - node.width / 2;
                        const y = node.y - node.height / 2;
                        const textX = x + 14;
                        const textY = y + 10;
                        return (
                            <g key={node.id}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={node.width}
                                    height={node.height}
                                    rx={10}
                                    ry={10}
                                    fill={
                                        node.isMetric
                                            ? theme.colors.blue[0]
                                            : theme.colors.gray[0]
                                    }
                                    stroke={
                                        node.isMetric
                                            ? theme.colors.blue[5]
                                            : theme.colors.ldGray[3]
                                    }
                                    strokeWidth={node.isMetric ? 2 : 1}
                                />
                                <text
                                    x={textX}
                                    y={textY}
                                    fontSize={13}
                                    fontWeight={600}
                                    fill={theme.colors.ldDark[7]}
                                    dominantBaseline="hanging"
                                >
                                    <tspan x={textX} dy={0}>
                                        {node.title}
                                    </tspan>
                                    {node.metaLines.map((line, lineIndex) => (
                                        <tspan
                                            key={`${node.id}-meta-${lineIndex}`}
                                            x={textX}
                                            dy={18}
                                            fontSize={11}
                                            fontWeight={400}
                                            fill={theme.colors.ldGray[6]}
                                        >
                                            {line}
                                        </tspan>
                                    ))}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </Box>
    );
};

const MetricFlowLineagePanel: FC<{
    lineage?: MetricLineage['lineage'];
    isLoading?: boolean;
}> = ({ lineage, isLoading = false }) => {
    const [lineageView, setLineageView] = useState<'model' | 'full'>('model');
    const hasModelLineage = useMemo(() => {
        if (!lineage) return false;
        const modelGraph = buildModelLineage(lineage);
        return modelGraph.nodes.length > 0 && modelGraph.edges.length > 0;
    }, [lineage]);
    const activeLineageView = hasModelLineage ? lineageView : 'full';

    return (
        <Paper withBorder radius="md" p="md">
            <Stack spacing="xs">
                <Group position="apart" align="center">
                    <Text size="sm" fw={600} c="ldDark.7">
                        指标血缘
                    </Text>
                    <SegmentedControl
                        size="xs"
                        value={activeLineageView}
                        onChange={(value) =>
                            setLineageView(value as 'model' | 'full')
                        }
                        data={[
                            {
                                label: '模型视图',
                                value: 'model',
                                disabled: !hasModelLineage,
                            },
                            { label: '全量视图', value: 'full' },
                        ]}
                    />
                </Group>
                <Divider color="ldGray.2" />
                {isLoading ? (
                    <Text size="xs" c="ldGray.6">
                        加载中…
                    </Text>
                ) : (
                    <MetricLineageGraph
                        lineage={lineage}
                        view={activeLineageView}
                    />
                )}
            </Stack>
        </Paper>
    );
};

export default MetricFlowLineagePanel;
