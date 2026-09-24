import {
    assertUnreachable,
    QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';

type PipelineNodeBase = {
    nodeId: string;
    title: string;
    description: string | null;
    isTerminal: boolean;
    /** Longest path from a source; 0 for nodes that read nothing. */
    depth: number;
    /** Titles of the nodes this one reads; unknown array-form references stay as-is. */
    reads: string[];
    /** Node ids this one reads that resolve to nodes or placeholders in the pipeline. */
    readNodeIds: string[];
};

export type PipelineQueryNode = PipelineNodeBase & {
    kind: 'query';
    query: SourceQuery;
};

/** A map-form read of an earlier result that is not a node in the pipeline. */
export type PipelinePlaceholderNode = PipelineNodeBase & {
    kind: 'placeholder';
};

export type PipelineNode = PipelineQueryNode | PipelinePlaceholderNode;

export const EARLIER_RESULT_NOTE = 'Earlier result';

export type PipelineLayerKind = 'sources' | 'transformations' | 'result';

export type PipelineLayer = {
    depth: number;
    kind: PipelineLayerKind;
    nodes: PipelineNode[];
};

/** User-facing label of where a source node reads from; null for transformations. */
export const sourceLabelOf = (query: SourceQuery): string | null => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return 'Semantic layer';
        case QuerySourceType.SQL:
            return 'Warehouse SQL';
        case QuerySourceType.EXTERNAL:
            return 'External data';
        case QuerySourceType.DUCKDB:
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};

const nodeIdOf = (query: SourceQuery, index: number) =>
    query.nodeId ?? `query_${index + 1}`;

type Reference = { alias: string | null; value: string };

const referencesOf = (query: SourceQuery): Reference[] => {
    if (query.sourceType !== QuerySourceType.DUCKDB || !query.references)
        return [];
    return Array.isArray(query.references)
        ? query.references.map((value) => ({ alias: null, value }))
        : Object.entries(query.references).map(([alias, value]) => ({
              alias,
              value,
          }));
};

const placeholderIdOf = (reference: string) => `earlier:${reference}`;

/**
 * Layers a pipeline by longest path from a source, so a fan-in join lands
 * after everything it reads. The terminal node alone forms the last (result)
 * layer wherever it sits. Cycles and unknown references count as depth 0.
 * Unknown map-form references become placeholder source nodes named by alias.
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

    const placeholders = new Map<string, PipelinePlaceholderNode>();
    entries.forEach(({ query }) =>
        referencesOf(query).forEach(({ alias, value }) => {
            if (alias === null || byId.has(value)) return;
            const nodeId = placeholderIdOf(value);
            if (placeholders.has(nodeId)) return;
            placeholders.set(nodeId, {
                kind: 'placeholder',
                nodeId,
                title: alias,
                description: EARLIER_RESULT_NOTE,
                isTerminal: false,
                depth: 0,
                reads: [],
                readNodeIds: [],
            });
        }),
    );

    const resolve = ({ alias, value }: Reference) => {
        const entry = byId.get(value);
        if (entry) return { nodeId: value, title: entry.query.title ?? value };
        if (alias !== null)
            return { nodeId: placeholderIdOf(value), title: alias };
        return { nodeId: null, title: value };
    };
    const readsOf = (query: SourceQuery) => referencesOf(query).map(resolve);
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

    const nodes: PipelineNode[] = [
        ...entries.map<PipelineQueryNode>(({ nodeId, query }) => ({
            kind: 'query',
            nodeId,
            title: query.title ?? nodeId,
            description: query.description ?? null,
            isTerminal: nodeId === terminalNodeId,
            depth: depths.get(nodeId)!,
            reads: readsOf(query).map(({ title }) => title),
            readNodeIds: readNodeIdsOf(query),
            query,
        })),
        ...placeholders.values(),
    ];
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
