import { ParseError } from '../types/errors';
import {
    getSourceQueryResultReferences,
    QuerySourceType,
    type DuckdbSourceQuery,
    type QueryNodeId,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '../types/querySources';

export const SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION: SavedComposerPipeline['schemaVersion'] = 1;

/** The node kinds a composer chart may store; sql joins once SQL nodes ship, the rest are refused by name. */
export type SavedComposerPipelineNode = (
    | SemanticLayerSourceQuery
    | DuckdbSourceQuery
) & { nodeId: QueryNodeId };

/** The pipeline a composer chart version stores: the presented node's closed snapshot and the node it shows. */
export type SavedComposerPipeline = {
    // A literal, not typeof the constant: the pipeline is part of the API schema.
    schemaVersion: 1;
    /** Every node has a node id and reads only nodes of this list. */
    nodes: SavedComposerPipelineNode[];
    terminalNodeId: QueryNodeId;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

// A duckdb node runs on a session that can reach only these results, so it needs at least one.
const hasReferences = (value: unknown): boolean =>
    Array.isArray(value)
        ? value.length > 0 && isStringArray(value)
        : isRecord(value) &&
          Object.keys(value).length > 0 &&
          isStringArray(Object.values(value));

const isSourceQuery = (value: unknown): value is SourceQuery =>
    isRecord(value) &&
    typeof value.sourceType === 'string' &&
    (Object.values(QuerySourceType) as string[]).includes(value.sourceType);

const hasRequiredFields = (node: SavedComposerPipelineNode): boolean => {
    switch (node.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return (
                typeof node.exploreName === 'string' &&
                isStringArray(node.dimensions) &&
                isStringArray(node.metrics)
            );
        case QuerySourceType.DUCKDB:
            return (
                typeof node.sql === 'string' && hasReferences(node.references)
            );
        default:
            return false;
    }
};

const parseNode = (
    value: unknown,
    index: number,
): SavedComposerPipelineNode => {
    if (!isSourceQuery(value)) {
        throw new ParseError(
            `Composer pipeline node ${index} is not a source query.`,
        );
    }
    const { nodeId } = value;
    if (!nodeId) {
        throw new ParseError(
            `Composer pipeline node ${index} has no node id; every stored node needs one.`,
        );
    }
    if (
        value.sourceType !== QuerySourceType.SEMANTIC_LAYER &&
        value.sourceType !== QuerySourceType.DUCKDB
    ) {
        throw new ParseError(
            `Composer pipeline node "${nodeId}" is a ${value.sourceType} node, which a composer chart cannot store.`,
        );
    }
    const node = { ...value, nodeId };
    if (!hasRequiredFields(node)) {
        throw new ParseError(
            `Composer pipeline node "${nodeId}" is missing the fields a ${node.sourceType} node needs.`,
        );
    }
    return node;
};

/** Reads a stored pipeline. There is no explore to fall back to, so anything but a closed, allowed pipeline of the known schema version throws. */
export const parseStoredComposerPipeline = (
    value: unknown,
): SavedComposerPipeline => {
    if (!isRecord(value)) {
        throw new ParseError('Composer pipeline is not an object.');
    }
    if (value.schemaVersion !== SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION) {
        throw new ParseError(
            `Unknown composer pipeline schema version ${String(
                value.schemaVersion,
            )}.`,
        );
    }
    if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
        throw new ParseError('Composer pipeline has no nodes.');
    }
    if (typeof value.terminalNodeId !== 'string') {
        throw new ParseError('Composer pipeline has no terminal node.');
    }
    const nodes = value.nodes.map(parseNode);
    const nodeIds = new Set<QueryNodeId>();
    nodes.forEach((node) => {
        if (nodeIds.has(node.nodeId)) {
            throw new ParseError(
                `Composer pipeline defines node "${node.nodeId}" twice.`,
            );
        }
        nodeIds.add(node.nodeId);
    });
    nodes.forEach((node) => {
        Object.values(getSourceQueryResultReferences(node)).forEach(
            (reference) => {
                if (!nodeIds.has(reference)) {
                    throw new ParseError(
                        `Composer pipeline node "${node.nodeId}" reads "${reference}", which is not a node of the pipeline.`,
                    );
                }
            },
        );
    });
    if (!nodeIds.has(value.terminalNodeId)) {
        throw new ParseError(
            `Composer pipeline terminal node "${value.terminalNodeId}" is not a node of the pipeline.`,
        );
    }
    return {
        schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
        nodes,
        terminalNodeId: value.terminalNodeId,
    };
};
