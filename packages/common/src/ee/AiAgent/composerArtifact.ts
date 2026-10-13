import { ParameterError } from '../../types/errors';
import {
    getSourceQueryResultReferences,
    QuerySourceType,
    type QueryNodeId,
    type SourceQuery,
} from '../../types/querySources';
import { stableJson } from '../../utils/stableJson';
import { type AllVizChartConfig } from '../../visualizations/types';

/**
 * A composer artifact version: a declarative pipeline, its terminal node and
 * the viz config. Holds no results; opening it runs the pipeline.
 */
export type AiComposerChartArtifactConfig = {
    source: 'composer';
    schemaVersion: 1;
    /** Self-contained pipeline: every node has a node id and reads only nodes of this pipeline. */
    queries: SourceQuery[];
    terminalNodeId: QueryNodeId;
    vizConfig: AllVizChartConfig | null;
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
    typeof config.terminalNodeId === 'string';

// The full definition, with array references written in map form.
const nodeDefinition = (node: SourceQuery): string =>
    stableJson(
        node.sourceType === QuerySourceType.DUCKDB ||
            node.sourceType === QuerySourceType.PYTHON
            ? { ...node, references: getSourceQueryResultReferences(node) }
            : node,
    );

const describeNodes = (nodes: SourceQuery[]): string =>
    nodes.length === 0
        ? 'There are no nodes from earlier versions in this thread.'
        : `Nodes from earlier versions: ${nodes
              .map((node) => `${node.nodeId} ("${node.title ?? node.nodeId}")`)
              .join(', ')}.`;

/**
 * Builds a version's pipeline from a submission: submitted nodes plus every
 * reused node from earlier versions and everything it reads, in dependency
 * order. Node ids name one definition for the whole thread.
 */
/** A node of a built pipeline; building guarantees every node a node id. */
export type ComposerPipelineNode = SourceQuery & { nodeId: QueryNodeId };

const hasNodeId = (node: SourceQuery): node is ComposerPipelineNode =>
    !!node.nodeId;

export const buildComposerArtifactPipeline = ({
    queries,
    earlierPipelines,
}: {
    queries: SourceQuery[];
    earlierPipelines: AiComposerChartArtifactConfig[];
}): ComposerPipelineNode[] => {
    const threadNodes = new Map<QueryNodeId, SourceQuery>();
    earlierPipelines.forEach((pipeline) =>
        pipeline.queries.forEach((node) => {
            if (node.nodeId) threadNodes.set(node.nodeId, node);
        }),
    );
    const submittedNodes = new Map<QueryNodeId, SourceQuery>(
        queries.flatMap((node) => (node.nodeId ? [[node.nodeId, node]] : [])),
    );

    submittedNodes.forEach((node, nodeId) => {
        const earlier = threadNodes.get(nodeId);
        if (earlier && nodeDefinition(earlier) !== nodeDefinition(node)) {
            throw new ParameterError(
                `Node id "${nodeId}" already names a different node in this thread ("${earlier.title ?? nodeId}"). To reuse it, read "${nodeId}" without resubmitting it; to define a new node, give it a different node id.`,
            );
        }
    });
    queries.forEach((node) =>
        Object.values(getSourceQueryResultReferences(node)).forEach(
            (reference) => {
                if (
                    !submittedNodes.has(reference) &&
                    !threadNodes.has(reference)
                ) {
                    throw new ParameterError(
                        `Node "${node.nodeId}" reads "${reference}", which is not a node of this submission or of an earlier version in this thread. ${describeNodes([...threadNodes.values()])}`,
                    );
                }
            },
        ),
    );

    const emitted = new Set<QueryNodeId>();
    const visiting = new Set<QueryNodeId>();
    const pipeline: ComposerPipelineNode[] = [];
    const visit = (node: SourceQuery) => {
        if (!hasNodeId(node)) return;
        const { nodeId } = node;
        if (emitted.has(nodeId) || visiting.has(nodeId)) return;
        visiting.add(nodeId);
        Object.values(getSourceQueryResultReferences(node)).forEach(
            (reference) => {
                const read =
                    submittedNodes.get(reference) ?? threadNodes.get(reference);
                if (read) visit(read);
            },
        );
        visiting.delete(nodeId);
        emitted.add(nodeId);
        pipeline.push(node);
    };
    queries.forEach(visit);
    return pipeline;
};
