import {
    QuerySourceType,
    type ToolComposerQueriesArgs,
} from '@lightdash/common';

// PROTOTYPE ONLY. DAG shape of a composer pipeline: layers by longest path
// from a source, so a fan-in join lands after every node it reads.

/** Tool node plus the per-node title/description the tool will grow. */
export type PipelineNode = ToolComposerQueriesArgs['queries'][number] & {
    title?: string;
    description?: string;
};

export type PipelineLayer = { depth: number; nodes: PipelineNode[] };

export const getNodeReads = (
    node: PipelineNode,
    nodeIds: Set<string>,
): string[] => {
    if (node.sourceType !== QuerySourceType.DUCKDB) return [];
    const references = Array.isArray(node.references)
        ? node.references
        : Object.values(node.references);
    return references.filter((reference) => nodeIds.has(reference));
};

export const layoutPipeline = (nodes: PipelineNode[]): PipelineLayer[] => {
    const nodeIds = new Set(nodes.map((node) => node.nodeId));
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const depths = new Map<string, number>();
    const depthOf = (nodeId: string, seen: Set<string>): number => {
        const cached = depths.get(nodeId);
        if (cached !== undefined) return cached;
        const node = byId.get(nodeId);
        if (!node || seen.has(nodeId)) return 0;
        const reads = getNodeReads(node, nodeIds);
        const depth =
            reads.length === 0
                ? 0
                : 1 +
                  Math.max(
                      ...reads.map((read) =>
                          depthOf(read, new Set([...seen, nodeId])),
                      ),
                  );
        depths.set(nodeId, depth);
        return depth;
    };
    nodes.forEach((node) => depthOf(node.nodeId, new Set()));

    const layers = new Map<number, PipelineNode[]>();
    nodes.forEach((node) => {
        const depth = depths.get(node.nodeId) ?? 0;
        layers.set(depth, [...(layers.get(depth) ?? []), node]);
    });
    return [...layers.entries()]
        .sort(([a], [b]) => a - b)
        .map(([depth, layerNodes]) => ({ depth, nodes: layerNodes }));
};
