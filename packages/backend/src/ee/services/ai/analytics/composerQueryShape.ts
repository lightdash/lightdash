import {
    isComposerQueryToolName,
    MAX_SOURCE_QUERIES_PER_SUBMISSION,
    QuerySourceType,
} from '@lightdash/common';
import { countBy } from 'es-toolkit/compat';
import { z } from 'zod';

const nullableCountField = z.number().int().nonnegative().nullable();

/** Shape of one composer query call's nodes. Counts only: explore and field names are customer schema. */
export const composerQueryShapeSchema = z.object({
    composerSemanticLayerNodeCount: nullableCountField,
    composerExploreCount: nullableCountField,
    /** Largest group of semanticLayer nodes reading one explore with the same dimensions; 2+ is a fan-out. */
    composerMaxSameGrainNodeCount: nullableCountField,
    composerMergeNodeCount: nullableCountField,
    /** A merge is in neither explore count when a source from an earlier call leaves it undecided. */
    composerSingleExploreMergeNodeCount: nullableCountField,
    composerMultiExploreMergeNodeCount: nullableCountField,
});

export type ComposerQueryShape = z.infer<typeof composerQueryShapeSchema>;

export const NO_COMPOSER_QUERY_SHAPE: ComposerQueryShape = {
    composerSemanticLayerNodeCount: null,
    composerExploreCount: null,
    composerMaxSameGrainNodeCount: null,
    composerMergeNodeCount: null,
    composerSingleExploreMergeNodeCount: null,
    composerMultiExploreMergeNodeCount: null,
};

const composerQueryInputSchema = z.object({
    queries: z
        .array(
            z.discriminatedUnion('sourceType', [
                z.object({
                    sourceType: z.literal(QuerySourceType.SEMANTIC_LAYER),
                    nodeId: z.string(),
                    exploreName: z.string(),
                    dimensions: z.array(z.string()),
                }),
                z.object({
                    sourceType: z.literal(QuerySourceType.MERGE),
                    sources: z.array(z.object({ nodeId: z.string() })),
                }),
                z.object({
                    sourceType: z
                        .enum(QuerySourceType)
                        .exclude(['SEMANTIC_LAYER', 'MERGE']),
                }),
            ]),
        )
        // Keeps the work below bounded
        .max(MAX_SOURCE_QUERIES_PER_SUBMISSION),
});

export const getComposerQueryShape = (
    toolName: string,
    input: unknown,
): ComposerQueryShape => {
    if (!isComposerQueryToolName(toolName)) return NO_COMPOSER_QUERY_SHAPE;
    const parsed = composerQueryInputSchema.safeParse(input);
    if (!parsed.success) return NO_COMPOSER_QUERY_SHAPE;

    const semanticLayerNodes = parsed.data.queries.flatMap((node) =>
        node.sourceType === QuerySourceType.SEMANTIC_LAYER ? [node] : [],
    );
    // A node id the call repeats names no single explore
    const nodeCountById = countBy(semanticLayerNodes, 'nodeId');
    const exploreByNodeId = new Map(
        semanticLayerNodes
            .filter(({ nodeId }) => nodeCountById[nodeId] === 1)
            .map(({ nodeId, exploreName }) => [nodeId, exploreName]),
    );
    const nodeCountByGrain = countBy(
        semanticLayerNodes,
        ({ exploreName, dimensions }) =>
            JSON.stringify([exploreName, [...new Set(dimensions)].sort()]),
    );
    const merges = parsed.data.queries.flatMap((node) => {
        if (node.sourceType !== QuerySourceType.MERGE) return [];
        const explores = node.sources.map(({ nodeId }) =>
            exploreByNodeId.get(nodeId),
        );
        const known = new Set(
            explores.filter((explore) => explore !== undefined),
        );
        return [
            {
                singleExplore:
                    known.size === 1 && !explores.includes(undefined),
                multiExplore: known.size > 1,
            },
        ];
    });

    return {
        composerSemanticLayerNodeCount: semanticLayerNodes.length,
        composerExploreCount: new Set(
            semanticLayerNodes.map(({ exploreName }) => exploreName),
        ).size,
        composerMaxSameGrainNodeCount: Math.max(
            0,
            ...Object.values(nodeCountByGrain),
        ),
        composerMergeNodeCount: merges.length,
        composerSingleExploreMergeNodeCount: merges.filter(
            ({ singleExplore }) => singleExplore,
        ).length,
        composerMultiExploreMergeNodeCount: merges.filter(
            ({ multiExplore }) => multiExplore,
        ).length,
    };
};
