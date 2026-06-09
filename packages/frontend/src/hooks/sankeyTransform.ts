import {
    type ResultRow,
    type ResultValue,
    type SankeyNodeLayout,
} from '@lightdash/common';

export type SankeySeriesDataPoint = {
    nodes: { name: string }[];
    links: {
        source: string;
        target: string;
        value: number;
        meta: {
            value: ResultValue;
            rows: ResultRow[];
        };
    }[];
    /** Deepest layer in the flow, used to size the per-depth colour palette */
    maxDepth: number;
    /** True when the graph has a cycle, which makes node merging impossible. */
    hasCycle: boolean;
};

type SankeyBuild = Omit<SankeySeriesDataPoint, 'hasCycle'>;

type AggregatedLink = {
    source: string;
    target: string;
    value: number;
    meta: { value: ResultValue; rows: ResultRow[] };
};

type SankeyFields = {
    sourceFieldId: string;
    targetFieldId: string;
    metricFieldId: string;
};

const EMPTY: SankeySeriesDataPoint = {
    nodes: [],
    links: [],
    maxDepth: 0,
    hasCycle: false,
};

const linkKey = (source: string, target: string) => `${source}→${target}`;

// One link per source→target pair, summing the metric across rows.
const aggregateLinks = (
    rows: ResultRow[],
    { sourceFieldId, targetFieldId, metricFieldId }: SankeyFields,
): Map<string, AggregatedLink> => {
    const aggregated = new Map<string, AggregatedLink>();

    for (const row of rows) {
        const sourceCell = row[sourceFieldId];
        const targetCell = row[targetFieldId];
        const metricCell = row[metricFieldId];
        if (!sourceCell || !targetCell || !metricCell) continue;

        const source = String(sourceCell.value.formatted);
        const target = String(targetCell.value.formatted);
        const value = Number(metricCell.value.raw);
        if (isNaN(value) || value <= 0) continue;

        const key = linkKey(source, target);
        const existing = aggregated.get(key);
        if (existing) {
            existing.value += value;
            existing.meta.rows.push(row);
        } else {
            aggregated.set(key, {
                source,
                target,
                value,
                meta: { value: metricCell.value, rows: [row] },
            });
        }
    }

    return aggregated;
};

// Kahn's algorithm: detects a cycle and returns the longest-path depth.
const analyzeFlowGraph = (
    aggregated: Map<string, AggregatedLink>,
): { hasCycle: boolean; maxDepth: number } => {
    const nodes = new Set<string>();
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const { source, target } of aggregated.values()) {
        nodes.add(source);
        nodes.add(target);
        if (!adjacency.has(source)) adjacency.set(source, []);
        adjacency.get(source)!.push(target);
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
        if (!inDegree.has(source)) inDegree.set(source, 0);
    }

    const depthByNode = new Map<string, number>();
    const queue: string[] = [];
    for (const node of nodes) {
        if ((inDegree.get(node) ?? 0) === 0) {
            queue.push(node);
            depthByNode.set(node, 0);
        }
    }

    let processed = 0;
    let maxDepth = 0;
    while (queue.length > 0) {
        const node = queue.shift()!;
        processed += 1;
        const depth = depthByNode.get(node) ?? 0;
        for (const target of adjacency.get(node) ?? []) {
            const nextDepth = Math.max(depthByNode.get(target) ?? 0, depth + 1);
            depthByNode.set(target, nextDepth);
            if (nextDepth > maxDepth) maxDepth = nextDepth;
            const remaining = (inDegree.get(target) ?? 0) - 1;
            inDegree.set(target, remaining);
            if (remaining === 0) queue.push(target);
        }
    }

    return { hasCycle: processed < nodes.size, maxDepth };
};

// One node per unique label: the aggregated links, unchanged. Acyclic only.
const buildMergedSankey = (
    aggregated: Map<string, AggregatedLink>,
    maxDepth: number,
): SankeyBuild => {
    const names = new Set<string>();
    const links: SankeyBuild['links'] = [];

    for (const link of aggregated.values()) {
        names.add(link.source);
        names.add(link.target);
        links.push({
            source: link.source,
            target: link.target,
            value: link.value,
            meta: link.meta,
        });
    }

    return {
        nodes: Array.from(names).map((name) => ({ name })),
        links,
        maxDepth,
    };
};

// Unroll into depth layers via BFS so cyclic flows can render as a DAG: a label
// seen at multiple depths splits into "Label - Step N" nodes.
const buildSteppedSankey = (
    aggregated: Map<string, AggregatedLink>,
): SankeyBuild => {
    const outgoing = new Map<string, Set<string>>();
    for (const link of aggregated.values()) {
        if (!outgoing.has(link.source)) outgoing.set(link.source, new Set());
        outgoing.get(link.source)!.add(link.target);
    }

    const allTargets = new Set(
        Array.from(aggregated.values()).map((l) => l.target),
    );
    const allSources = new Set(
        Array.from(aggregated.values()).map((l) => l.source),
    );
    let roots = [...allSources].filter((s) => !allTargets.has(s));
    if (roots.length === 0) roots = [...allSources].slice(0, 1); // pure cycle: pick any source

    const MAX_DEPTH = 50;
    const nodeDepthMap = new Map<string, Set<number>>();
    const edgeInstances: {
        source: string;
        sourceDepth: number;
        target: string;
        targetDepth: number;
    }[] = [];
    const placedOriginalEdges = new Set<string>();

    type BFSItem = { name: string; depth: number };
    const queue: BFSItem[] = roots.map((n) => ({ name: n, depth: 0 }));
    const visited = new Set<string>(); // "name:depth"
    let maxDepth = 0;

    while (queue.length > 0) {
        const { name, depth } = queue.shift()!;
        if (depth > MAX_DEPTH) continue;

        const key = `${name}:${depth}`;
        if (visited.has(key)) continue;
        visited.add(key);

        if (!nodeDepthMap.has(name)) nodeDepthMap.set(name, new Set());
        nodeDepthMap.get(name)!.add(depth);
        if (depth > maxDepth) maxDepth = depth;

        const targets = outgoing.get(name);
        if (!targets) continue;

        for (const target of targets) {
            const originalEdgeKey = linkKey(name, target);
            if (placedOriginalEdges.has(originalEdgeKey)) continue;
            placedOriginalEdges.add(originalEdgeKey);

            const targetDepth = depth + 1;
            edgeInstances.push({
                source: name,
                sourceDepth: depth,
                target,
                targetDepth,
            });
            queue.push({ name: target, depth: targetDepth });
        }
    }

    const multiDepthNodes = new Set<string>();
    for (const [name, depths] of nodeDepthMap) {
        if (depths.size > 1) multiDepthNodes.add(name);
    }
    const getLabel = (name: string, depth: number) =>
        multiDepthNodes.has(name) ? `${name} - Step ${depth}` : name;

    const nodeSet = new Set<string>();
    const links: SankeyBuild['links'] = [];
    const placedLinks = new Set<string>();

    for (const edge of edgeInstances) {
        const sourceLabel = getLabel(edge.source, edge.sourceDepth);
        const targetLabel = getLabel(edge.target, edge.targetDepth);

        nodeSet.add(sourceLabel);
        nodeSet.add(targetLabel);

        const key = linkKey(sourceLabel, targetLabel);
        if (placedLinks.has(key)) continue;
        placedLinks.add(key);

        const aggLink = aggregated.get(linkKey(edge.source, edge.target));
        if (!aggLink) continue;

        links.push({
            source: sourceLabel,
            target: targetLabel,
            value: aggLink.value,
            meta: aggLink.meta,
        });
    }

    return {
        nodes: Array.from(nodeSet).map((name) => ({ name })),
        links,
        maxDepth,
    };
};

/**
 * Build Sankey nodes & links according to the chosen layout:
 * - `merged`: one node per label (acyclic only; falls back to multi-step)
 * - `multi-step`: depth-unrolled journeys with "Step N" instances
 */
export const transformSankeyData = (
    rows: ResultRow[],
    fields: SankeyFields,
    { nodeLayout }: { nodeLayout: SankeyNodeLayout },
): SankeySeriesDataPoint => {
    const aggregated = aggregateLinks(rows, fields);
    if (aggregated.size === 0) return EMPTY;

    const { hasCycle, maxDepth } = analyzeFlowGraph(aggregated);

    const build: SankeyBuild =
        nodeLayout === 'merged' && !hasCycle
            ? buildMergedSankey(aggregated, maxDepth)
            : buildSteppedSankey(aggregated);

    return { ...build, hasCycle };
};
