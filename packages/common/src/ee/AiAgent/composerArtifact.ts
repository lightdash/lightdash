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

export const isSameComposerNodeDefinition = (
    a: SourceQuery,
    b: SourceQuery,
): boolean => nodeDefinition(a) === nodeDefinition(b);

export const getComposerNodeConflictMessage = (
    existing: ThreadComposerQueryNode,
): string =>
    `Node id "${existing.nodeId}" already names a different node in this thread ("${existing.title ?? existing.nodeId}"). To reuse it, read "${existing.nodeId}" without resubmitting it; to define a new node, give it a different node id.`;

const describeNodes = (nodes: ThreadComposerQueryNode[]): string =>
    nodes.length === 0
        ? 'No nodes have been defined earlier in this thread.'
        : `Nodes defined earlier in this thread: ${nodes
              .map((node) => `${node.nodeId} ("${node.title ?? node.nodeId}")`)
              .join(', ')}.`;

/** A node of a built pipeline; building guarantees every node a node id. */
export type ComposerPipelineNode = SourceQuery & { nodeId: QueryNodeId };

/** A node a thread defined through a successful composer query. */
export type ThreadComposerQueryNode = ComposerPipelineNode;

const hasNodeId = (node: SourceQuery): node is ComposerPipelineNode =>
    !!node.nodeId;

/**
 * Builds a submission's pipeline: submitted nodes plus every reused thread
 * node and everything it reads, in dependency order. A node id names one
 * definition for the whole thread.
 */
export const buildComposerArtifactPipeline = ({
    queries,
    threadNodes: threadNodeList,
}: {
    queries: SourceQuery[];
    threadNodes: ThreadComposerQueryNode[];
}): ComposerPipelineNode[] => {
    const threadNodes = new Map<QueryNodeId, ThreadComposerQueryNode>(
        threadNodeList.map((node) => [node.nodeId, node]),
    );
    const submittedNodes = new Map<QueryNodeId, SourceQuery>(
        queries.flatMap((node) => (node.nodeId ? [[node.nodeId, node]] : [])),
    );

    submittedNodes.forEach((node, nodeId) => {
        const existing = threadNodes.get(nodeId);
        if (existing && !isSameComposerNodeDefinition(existing, node)) {
            throw new ParameterError(getComposerNodeConflictMessage(existing));
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
                        `Node "${node.nodeId}" reads "${reference}", which is not a node of this submission or of an earlier call in this thread. ${describeNodes(threadNodeList)}`,
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
