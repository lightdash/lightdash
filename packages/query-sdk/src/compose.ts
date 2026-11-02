/**
 * Composer pipelines: semantic-layer queries (or saved charts) feeding DuckDB
 * SQL and Python steps, executed server-side as one multi-query submission.
 *
 * Usage:
 *   compose('revenue-forecast')
 *     .title('Revenue forecast')
 *     .description('Projects the next 6 months of revenue.')
 *     .semantic('orders', query('orders').dimensions(['order_date_month']).metrics(['total_revenue']))
 *     .python('fc', 'def run(inputs, params):\n    return inputs["orders"]', { reads: ['orders'] })
 *     .terminal('fc')
 *
 * The builder is immutable -- each method returns a new instance. It never
 * throws; `validateComposerDefinition` reports mistakes when the pipeline runs.
 */

import { QueryBuilder } from './query';
import type { SavedChartQuery } from './savedChart';
import type {
    ComposerDefinition,
    ComposerNode,
    ParametersValuesMap,
} from './types';

/** Pipeline ids: stable kebab/snake identifiers. */
export const COMPOSER_ID_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/;
/** Node ids double as DuckDB table names and Python input keys. */
export const COMPOSER_NODE_ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

export type ComposerNodeOptions = {
    title?: string;
    description?: string;
};

export type ComposerStepOptions = ComposerNodeOptions & {
    /** Node ids of this pipeline whose results the step reads. */
    reads: string[];
    /** Maximum rows kept from the step's result. */
    limit?: number;
};

export function compose(id: string): ComposerQuery {
    return new ComposerQuery({
        kind: 'composer',
        id,
        title: null,
        description: null,
        nodes: [],
        terminal: null,
        parameters: {},
    });
}

export class ComposerQuery {
    private readonly _state: ComposerDefinition;

    constructor(state: ComposerDefinition) {
        this._state = state;
    }

    private _clone(overrides: Partial<ComposerDefinition>): ComposerQuery {
        return new ComposerQuery({ ...this._state, ...overrides });
    }

    private _addNode(node: ComposerNode): ComposerQuery {
        return this._clone({ nodes: [...this._state.nodes, node] });
    }

    /** Short human title for the pipeline (2-6 words). */
    title(text: string): ComposerQuery {
        return this._clone({ title: text });
    }

    /** One-line description of what the pipeline computes. */
    description(text: string): ComposerQuery {
        return this._clone({ description: text });
    }

    /** Parameter values shared by every node. Merges with prior calls. */
    parameters(map: ParametersValuesMap): ComposerQuery {
        return this._clone({
            parameters: { ...this._state.parameters, ...map },
        });
    }

    /** A semantic-layer query or saved chart as a pipeline source. */
    semantic(
        nodeId: string,
        source: QueryBuilder | SavedChartQuery,
        options: ComposerNodeOptions = {},
    ): ComposerQuery {
        return this._addNode({
            kind: 'semantic',
            nodeId,
            title: options.title ?? null,
            description: options.description ?? null,
            source:
                source instanceof QueryBuilder
                    ? { kind: 'query', query: source.build() }
                    : {
                          kind: 'savedChart',
                          chartUuid: source.chartUuid,
                          label: source.labelText ?? null,
                          limit: source.limitValue ?? null,
                          parameters: source.parameterValues ?? {},
                          filters: source.filterValues ?? [],
                      },
        });
    }

    /** DuckDB SQL over other nodes' results; each read is a table named by its node id. */
    duckdb(
        nodeId: string,
        sql: string,
        options: ComposerStepOptions,
    ): ComposerQuery {
        return this._addNode({
            kind: 'duckdb',
            nodeId,
            title: options.title ?? null,
            description: options.description ?? null,
            sql,
            reads: options.reads,
            limit: options.limit ?? null,
        });
    }

    /** Python `def run(inputs, params)` returning a pandas DataFrame; inputs keyed by node id. */
    python(
        nodeId: string,
        code: string,
        options: ComposerStepOptions,
    ): ComposerQuery {
        return this._addNode({
            kind: 'python',
            nodeId,
            title: options.title ?? null,
            description: options.description ?? null,
            code,
            reads: options.reads,
            limit: options.limit ?? null,
        });
    }

    /** The node whose result `useLightdash` returns. */
    terminal(nodeId: string): ComposerQuery {
        return this._clone({ terminal: nodeId });
    }

    build(): ComposerDefinition {
        return this._state;
    }
}

/** Throws a descriptive error when the pipeline can't be submitted. */
export function validateComposerDefinition(
    definition: ComposerDefinition,
): void {
    const where = `compose('${definition.id}')`;
    if (!COMPOSER_ID_PATTERN.test(definition.id)) {
        throw new Error(
            `${where}: the pipeline id must be 1-64 letters, digits, "-" or "_", not starting with "-".`,
        );
    }
    if (definition.nodes.length === 0) {
        throw new Error(`${where}: add at least one node.`);
    }
    const nodeIds = new Set<string>();
    for (const node of definition.nodes) {
        if (!COMPOSER_NODE_ID_PATTERN.test(node.nodeId)) {
            throw new Error(
                `${where}: node id "${node.nodeId}" must start with a letter or "_" and use only letters, digits and "_" (max 63).`,
            );
        }
        if (nodeIds.has(node.nodeId)) {
            throw new Error(
                `${where}: node id "${node.nodeId}" is used twice.`,
            );
        }
        nodeIds.add(node.nodeId);
    }
    for (const node of definition.nodes) {
        if (node.kind === 'semantic') continue;
        if (node.reads.length === 0) {
            throw new Error(
                `${where}: ${node.kind} node "${node.nodeId}" must read at least one node.`,
            );
        }
        for (const read of node.reads) {
            if (read === node.nodeId || !nodeIds.has(read)) {
                throw new Error(
                    `${where}: ${node.kind} node "${node.nodeId}" reads "${read}", which is not another node in this pipeline.`,
                );
            }
        }
    }
    if (definition.terminal === null) {
        throw new Error(
            `${where}: call .terminal(nodeId) to choose which node's result to return.`,
        );
    }
    if (!nodeIds.has(definition.terminal)) {
        throw new Error(
            `${where}: terminal "${definition.terminal}" is not a node in this pipeline.`,
        );
    }
}
