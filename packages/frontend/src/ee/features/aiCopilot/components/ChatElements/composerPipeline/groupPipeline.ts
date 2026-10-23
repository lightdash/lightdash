import {
    assertUnreachable,
    getSourceQueryResultReferences,
    QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import {
    IconBrandPython,
    IconDatabase,
    IconFileSpreadsheet,
    IconSitemap,
} from '@tabler/icons-react';

export type PipelineNode = {
    nodeId: string;
    title: string;
    description: string | null;
    isTerminal: boolean;
    /** Longest path from a source; 0 for nodes that read nothing. */
    depth: number;
    /** Titles of the nodes this one reads; unknown references stay as-is. */
    reads: string[];
    /** Node ids this one reads that resolve to nodes in the pipeline. */
    readNodeIds: string[];
    query: SourceQuery;
};

export type PipelineLayerKind = 'sources' | 'transformations' | 'result';

export type PipelineLayer = {
    depth: number;
    kind: PipelineLayerKind;
    nodes: PipelineNode[];
};

/** User-facing node type: where a source reads from, or Python; null for DuckDB transformations. */
export const nodeTypeLabelOf = (query: SourceQuery): string | null => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return 'Semantic layer';
        case QuerySourceType.SQL:
            return 'Warehouse SQL';
        case QuerySourceType.EXTERNAL:
            return 'External data';
        case QuerySourceType.PYTHON:
            return 'Python';
        case QuerySourceType.DUCKDB:
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

export const nodeTypeIcon = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return IconSitemap;
        case QuerySourceType.SQL:
            return IconDatabase;
        case QuerySourceType.EXTERNAL:
            return IconFileSpreadsheet;
        case QuerySourceType.PYTHON:
            return IconBrandPython;
        case QuerySourceType.DUCKDB:
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

const nodeIdOf = (query: SourceQuery, index: number) =>
    query.nodeId ?? `query_${index + 1}`;

const referencesOf = (query: SourceQuery): string[] =>
    Object.values(getSourceQueryResultReferences(query));

/**
 * Layers a pipeline by longest path from a source, so a fan-in join lands
 * after everything it reads. The terminal node alone forms the last (result)
 * layer wherever it sits. Cycles and unknown references count as depth 0.
 */
export const groupPipeline = (
    queries: SourceQuery[],
    terminalNodeId: string,
): PipelineLayer[] => {
    const entries = queries.map((query, index) => ({
        nodeId: nodeIdOf(query, index),
        query,
    }));
    const byId = new Map(entries.map((entry) => [entry.nodeId, entry]));

    const resolveRead = (value: string) => {
        const entry = byId.get(value);
        return entry
            ? { nodeId: value, title: entry.query.title ?? value }
            : { nodeId: null, title: value };
    };
    const readsOf = (query: SourceQuery) =>
        referencesOf(query).map(resolveRead);
    const readNodeIdsOf = (query: SourceQuery) =>
        readsOf(query).flatMap(({ nodeId }) =>
            nodeId === null ? [] : [nodeId],
        );

    const depths = new Map<string, number>();
    const depthOf = (nodeId: string, seen: Set<string>): number => {
        const cached = depths.get(nodeId);
        if (cached !== undefined) return cached;
        const entry = byId.get(nodeId);
        if (!entry || seen.has(nodeId)) return 0;
        const upstream = readNodeIdsOf(entry.query);
        const depth =
            upstream.length === 0
                ? 0
                : 1 +
                  Math.max(
                      ...upstream.map((read) =>
                          depthOf(read, new Set([...seen, nodeId])),
                      ),
                  );
        depths.set(nodeId, depth);
        return depth;
    };
    entries.forEach((entry) => depthOf(entry.nodeId, new Set()));

    const nodes = entries.map<PipelineNode>(({ nodeId, query }) => ({
        nodeId,
        title: query.title ?? nodeId,
        description: query.description ?? null,
        isTerminal: nodeId === terminalNodeId,
        depth: depths.get(nodeId)!,
        reads: readsOf(query).map(({ title }) => title),
        readNodeIds: readNodeIdsOf(query),
        query,
    }));
    const terminal = nodes.filter((node) => node.isTerminal);
    const others = nodes.filter((node) => !node.isTerminal);
    const layerDepths = [...new Set(others.map((node) => node.depth))].sort(
        (a, b) => a - b,
    );
    const layers: PipelineLayer[] = layerDepths.map((depth) => ({
        depth,
        kind: depth === 0 ? 'sources' : 'transformations',
        nodes: others.filter((node) => node.depth === depth),
    }));
    if (terminal.length > 0) {
        layers.push({
            depth: (layerDepths[layerDepths.length - 1] ?? -1) + 1,
            kind: 'result',
            nodes: terminal,
        });
    }
    return layers;
};
