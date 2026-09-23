import { QuerySourceType, type SourceQuery } from '@lightdash/common';

export type PipelineNode = {
    nodeId: string;
    title: string;
    description: string | null;
    isTerminal: boolean;
    /** Titles of the nodes this one reads; references outside the pipeline stay as-is. */
    reads: string[];
    query: SourceQuery;
};

export type PipelineLayerKind = 'sources' | 'transformations' | 'result';

export type PipelineLayer = {
    depth: number;
    kind: PipelineLayerKind;
    nodes: PipelineNode[];
};

const nodeIdOf = (query: SourceQuery, index: number) =>
    query.nodeId ?? `query_${index + 1}`;

const referencesOf = (query: SourceQuery): string[] => {
    if (query.sourceType !== QuerySourceType.DUCKDB || !query.references)
        return [];
    return Array.isArray(query.references)
        ? query.references
        : Object.values(query.references);
};

/**
 * Layers a pipeline by longest path from a source, so a fan-in join lands
 * after everything it reads. Cycles and unknown references count as depth 0.
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
    const readsOf = (nodeId: string) =>
        referencesOf(byId.get(nodeId)!.query).filter((reference) =>
            byId.has(reference),
        );

    const depths = new Map<string, number>();
    const depthOf = (nodeId: string, seen: Set<string>): number => {
        const cached = depths.get(nodeId);
        if (cached !== undefined) return cached;
        if (seen.has(nodeId)) return 0;
        const upstream = readsOf(nodeId);
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

    const titleOf = (reference: string) =>
        byId.get(reference)?.query.title ?? reference;
    const nodes: PipelineNode[] = entries.map(({ nodeId, query }) => ({
        nodeId,
        title: query.title ?? nodeId,
        description: query.description ?? null,
        isTerminal: nodeId === terminalNodeId,
        reads: referencesOf(query).map(titleOf),
        query,
    }));

    const layerDepths = [
        ...new Set(nodes.map((node) => depths.get(node.nodeId)!)),
    ].sort((a, b) => a - b);
    const lastDepth = layerDepths[layerDepths.length - 1];
    return layerDepths.map((depth) => ({
        depth,
        kind:
            depth === lastDepth
                ? 'result'
                : depth === 0
                  ? 'sources'
                  : 'transformations',
        nodes: nodes.filter((node) => depths.get(node.nodeId) === depth),
    }));
};
