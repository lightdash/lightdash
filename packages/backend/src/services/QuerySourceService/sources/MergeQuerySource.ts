import {
    getMergeNodeMergeQuery,
    ParameterError,
    QuerySourceType,
    type FeatureFlags,
    type MergeSourceQuery,
    type MetricSourcedMergeQuery,
    type ParametersValuesMap,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
} from '@lightdash/common';
import type {
    AsyncQueryService,
    RunnableCompiledMergeQuery,
} from '../../AsyncQueryService/AsyncQueryService';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SourceQuerySubmissionResult,
    SubmitSourceQueryArgs,
    SubmittedSourceQueries,
    ValidateSourceQueryArgs,
} from '../types';

type MergeQuerySourceArguments = {
    asyncQueryService: Pick<
        AsyncQueryService,
        'compileComposerMerge' | 'submitComposerMergeJoin'
    >;
};

type PreparedMerge = {
    mergeQuery: MetricSourcedMergeQuery;
    compiled: RunnableCompiledMergeQuery;
    parameters: ParametersValuesMap;
};

const assertSourceQuery = (query: SourceQuery): MergeSourceQuery => {
    if (query.sourceType !== QuerySourceType.MERGE) {
        throw new ParameterError(
            `Expected a ${QuerySourceType.MERGE} query, got "${query.sourceType}"`,
        );
    }
    return query;
};

const nodeName = (query: SourceQuery) => `node "${query.nodeId}"`;

/**
 * The merge's sources must be semanticLayer nodes of the submission that
 * already group by their join keys: they are the legs, read as they ran.
 */
const toMergeQuery = (
    query: MergeSourceQuery,
    submission: SubmittedSourceQueries,
): MetricSourcedMergeQuery => {
    if (query.pivotConfiguration !== undefined) {
        throw new ParameterError(
            `Merge ${nodeName(query)} carries a pivotConfiguration, which merge queries do not support; pivot in a duckdb node that reads it.`,
        );
    }
    query.sources.forEach(({ nodeId }) => {
        const source = submission.find((node) => node.nodeId === nodeId);
        if (source?.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
            throw new ParameterError(
                `Merge ${nodeName(query)} reads "${nodeId}", which is not a semanticLayer node of this pipeline. A merge joins semanticLayer nodes; join other results with a duckdb node.`,
            );
        }
    });
    const mergeQuery = getMergeNodeMergeQuery(query, submission);
    if (mergeQuery === null) {
        throw new ParameterError(
            `Merge ${nodeName(query)} reads a node that is not a semanticLayer node of this pipeline.`,
        );
    }
    mergeQuery.joinKey.forEach((part) => {
        mergeQuery.sources.forEach((source) => {
            const fieldId = part.fieldIdBySourceId[source.id];
            if (
                fieldId !== undefined &&
                !source.metricQuery.dimensions.includes(fieldId)
            ) {
                throw new ParameterError(
                    `Join key "${part.name}" names "${fieldId}" on node "${source.id}", which that node does not select. Add "${fieldId}" to the dimensions of node "${source.id}".`,
                );
            }
        });
    });
    return mergeQuery;
};

/** Each source node's own parameters, layered over the submission's. */
const getMergeParameters = (
    mergeQuery: MetricSourcedMergeQuery,
    submission: SubmittedSourceQueries,
    parameters: ParametersValuesMap,
): ParametersValuesMap =>
    Object.assign(
        { ...parameters },
        ...mergeQuery.sources.map(({ id }) => {
            const node = submission.find(({ nodeId }) => nodeId === id);
            return node?.sourceType === QuerySourceType.SEMANTIC_LAYER
                ? (node.parameters ?? {})
                : {};
        }),
    );

/**
 * A merge as a query source: a declared join of semanticLayer nodes run
 * through the merge compiler, so its columns keep their fields' identity
 * and a join that would be wrong is refused before anything runs. The
 * referenced nodes are the legs; the merge submits only the join.
 */
export class MergeQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.MERGE,
        label: 'Merge',
        description:
            'Joins two or more semanticLayer nodes of the same submission on shared dimensions, without SQL. Each source must select its join keys and return fewer rows than its limit. Result columns are named <nodeId>_<fieldId>, and merge_<name> for join keys and table calculations, and keep the label and format of the field they come from.',
    };

    readonly supportsPivot = false;

    readonly requiredFeatureFlags: FeatureFlags[] = [];

    private readonly asyncQueryService: MergeQuerySourceArguments['asyncQueryService'];

    // One compile per submitted query object: validation and submission share it
    private readonly prepared = new WeakMap<
        SourceQuery,
        Promise<PreparedMerge>
    >();

    constructor(args: MergeQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
    }

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        return { sourceType: QuerySourceType.MERGE, tables: [] };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(query: SourceQuery): string[] {
        return assertSourceQuery(query).sources.map(({ nodeId }) => nodeId);
    }

    private prepare(args: ValidateSourceQueryArgs): Promise<PreparedMerge> {
        const existing = this.prepared.get(args.query);
        if (existing) return existing;
        const prepared = (async () => {
            const query = assertSourceQuery(args.query);
            const mergeQuery = toMergeQuery(query, args.submission);
            const parameters = getMergeParameters(
                mergeQuery,
                args.submission,
                args.parameters,
            );
            const compiled = await this.asyncQueryService.compileComposerMerge({
                account: args.account,
                projectUuid: args.projectUuid,
                nodeId: query.nodeId ?? 'merge',
                mergeQuery,
                parameters,
                userAttributeOverrides: args.userAttributeOverrides,
            });
            return { mergeQuery, compiled, parameters };
        })();
        this.prepared.set(args.query, prepared);
        return prepared;
    }

    async validateQuery(args: ValidateSourceQueryArgs): Promise<void> {
        await this.prepare(args);
    }

    async submitQuery(
        args: SubmitSourceQueryArgs,
    ): Promise<SourceQuerySubmissionResult> {
        const { mergeQuery, compiled, parameters } = await this.prepare(args);
        const legQueryUuidBySourceId = Object.fromEntries(
            mergeQuery.sources.map(({ id }) => {
                const queryUuid = args.resolvedReferences[id];
                if (queryUuid === undefined) {
                    throw new ParameterError(
                        `Merge source "${id}" was not submitted before the merge`,
                    );
                }
                return [id, queryUuid];
            }),
        );
        const labelBySourceId = Object.fromEntries(
            mergeQuery.sources.map(({ id }) => {
                const node = args.submission.find(
                    ({ nodeId }) => nodeId === id,
                );
                return [id, node?.title ? `"${node.title}"` : `Query "${id}"`];
            }),
        );
        const { queryUuid } =
            await this.asyncQueryService.submitComposerMergeJoin({
                account: args.account,
                projectUuid: args.projectUuid,
                context: args.context,
                querySurface: args.querySurface,
                mergeQuery,
                compiledMerge: compiled,
                legQueryUuidBySourceId,
                labelBySourceId,
                parameters,
                invalidateCache: args.invalidateCache,
            });
        return { queryUuid, cacheHit: false };
    }
}
