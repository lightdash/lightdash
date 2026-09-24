import {
    QuerySourceType,
    type QueryNodeId,
    type SourceQuery,
} from '../../types/querySources';

/** Per node: the queryUuid of its last run. */
export type ComposerNodeResults = Record<QueryNodeId, { queryUuid: string }>;

/**
 * A composer query (multi-source pipeline) stored as a chart artifact. The
 * pipeline is stored replayable from day one; v0 rendering reads only the
 * terminal node's last result.
 */
export type AiComposerChartArtifactConfig = {
    source: 'composer';
    schemaVersion: 1;
    /** The replayable pipeline. Node ids are always pinned (resolved ids from submission). */
    queries: SourceQuery[];
    /** Which node's result this artifact shows. */
    terminalNodeId: QueryNodeId;
    /** Snapshot of the terminal node's last run; rendering v0 reads only this. */
    lastQueryUuid: string;
    /** One entry per node in `queries`; optional only for rows written before this field existed. */
    nodeResults?: ComposerNodeResults;
};

export const isAiComposerChartArtifactConfig = (
    config: unknown,
): config is AiComposerChartArtifactConfig =>
    typeof config === 'object' &&
    config !== null &&
    'source' in config &&
    config.source === 'composer' &&
    'schemaVersion' in config &&
    config.schemaVersion === 1 &&
    'queries' in config &&
    Array.isArray(config.queries) &&
    'terminalNodeId' in config &&
    typeof config.terminalNodeId === 'string' &&
    'lastQueryUuid' in config &&
    typeof config.lastQueryUuid === 'string';

const NODE_ID_MAX_LENGTH = 63;

// Suffix grows deterministically (8, 12, 16… hex chars) until the id is free.
const getCopiedNodeId = (
    nodeId: QueryNodeId,
    queryUuid: string,
    takenIds: Set<QueryNodeId>,
): QueryNodeId => {
    const hex = queryUuid.replace(/[^a-zA-Z0-9]/g, '');
    if (nodeId.endsWith(`_${hex.slice(0, 8)}`)) return nodeId;
    for (let length = 8; ; length += 4) {
        const suffix = `_${hex.slice(0, length)}`;
        const candidate = `${nodeId.slice(0, NODE_ID_MAX_LENGTH - suffix.length)}${suffix}`;
        if (!takenIds.has(candidate) || length >= hex.length) return candidate;
    }
};

/**
 * Builds the stored pipeline of a composer artifact: this run's nodes plus
 * every reused node (and its transitive reads) copied from earlier versions.
 */
export const buildComposerArtifactPipeline = ({
    queries,
    submissions,
    earlierPipelines,
}: {
    queries: SourceQuery[];
    submissions: { nodeId: QueryNodeId; queryUuid: string }[];
    earlierPipelines: AiComposerChartArtifactConfig[];
}): { queries: SourceQuery[]; nodeResults: ComposerNodeResults } => {
    const earlierNodesByQueryUuid = new Map<
        string,
        { node: SourceQuery; pipeline: AiComposerChartArtifactConfig }
    >();
    earlierPipelines.forEach((pipeline) => {
        const { nodeResults } = pipeline;
        if (!nodeResults) return;
        pipeline.queries.forEach((node) => {
            const result = node.nodeId ? nodeResults[node.nodeId] : undefined;
            if (result && !earlierNodesByQueryUuid.has(result.queryUuid)) {
                earlierNodesByQueryUuid.set(result.queryUuid, {
                    node,
                    pipeline,
                });
            }
        });
    });

    const submittedNodeIds = new Set(
        submissions.map((submission) => submission.nodeId),
    );
    const takenIds = new Set(submittedNodeIds);
    const copiedIdsByQueryUuid = new Map<string, QueryNodeId>();
    const copiedNodes: SourceQuery[] = [];
    const copiedNodeResults: ComposerNodeResults = {};

    // Resolves a reference to a copied node id, or null when nothing earlier owns it.
    const copyNode = (queryUuid: string): QueryNodeId | null => {
        const copiedId = copiedIdsByQueryUuid.get(queryUuid);
        if (copiedId) return copiedId;
        const earlier = earlierNodesByQueryUuid.get(queryUuid);
        if (!earlier?.node.nodeId) return null;

        const nodeId = getCopiedNodeId(
            earlier.node.nodeId,
            queryUuid,
            takenIds,
        );
        takenIds.add(nodeId);
        copiedIdsByQueryUuid.set(queryUuid, nodeId);

        let node: SourceQuery = { ...earlier.node, nodeId };
        if (node.sourceType === QuerySourceType.DUCKDB && node.references) {
            const entries = Array.isArray(node.references)
                ? node.references.map((reference) => [reference, reference])
                : Object.entries(node.references);
            node = {
                ...node,
                references: Object.fromEntries(
                    entries.map(([tableName, reference]) => {
                        const localQueryUuid =
                            earlier.pipeline.nodeResults?.[reference]
                                ?.queryUuid;
                        return [
                            tableName,
                            copyNode(localQueryUuid ?? reference) ?? reference,
                        ];
                    }),
                ),
            };
        }

        copiedNodes.push(node);
        copiedNodeResults[nodeId] = { queryUuid };
        return nodeId;
    };

    const submittedQueries = queries.map((node): SourceQuery => {
        if (
            node.sourceType !== QuerySourceType.DUCKDB ||
            !node.references ||
            Array.isArray(node.references)
        ) {
            return node;
        }
        return {
            ...node,
            references: Object.fromEntries(
                Object.entries(node.references).map(
                    ([tableName, reference]) => [
                        tableName,
                        submittedNodeIds.has(reference)
                            ? reference
                            : (copyNode(reference) ?? reference),
                    ],
                ),
            ),
        };
    });

    return {
        queries: [...copiedNodes, ...submittedQueries],
        nodeResults: {
            ...copiedNodeResults,
            ...Object.fromEntries(
                submissions.map((submission) => [
                    submission.nodeId,
                    { queryUuid: submission.queryUuid },
                ]),
            ),
        },
    };
};
