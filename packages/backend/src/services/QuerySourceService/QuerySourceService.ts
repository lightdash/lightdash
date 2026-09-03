import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    type Account,
    type ApiExecuteSourceQueriesResults,
    type ApiGetSourceQueryStatusResults,
    type ApiListQuerySourcesResults,
    type ApiScanQuerySourceSchemaResults,
    type QueryExecutionContext,
    type QuerySourceType,
    type SourceQuery,
    type SourceQuerySubmission,
} from '@lightdash/common';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { BaseService } from '../BaseService';
import type { QuerySourceRegistry } from './QuerySourceRegistry';
import type { QuerySourceClient, SourceQueryExecutionContext } from './types';

type QuerySourceServiceArguments = {
    projectModel: ProjectModel;
    queryHistoryModel: QueryHistoryModel;
    featureFlagModel: FeatureFlagModel;
    registry: QuerySourceRegistry;
};

/** One query of a submission with its source and in-request dependencies. */
type ValidatedQuery = {
    nodeId: string;
    query: SourceQuery;
    source: QuerySourceClient;
    dependsOn: string[];
};

const MAX_QUERIES = 25;
const MAX_STATUS_QUERY_UUIDS = 50;
const NODE_ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const UUID_PATTERN =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The single entry point for querying any registered source: source
 * discovery, schema scans and query submission. Every query — whatever its
 * source — lands in the standard async query pipeline, so each yields a
 * queryUuid whose results are fetched with the standard results endpoint.
 *
 * There is no server-side pipeline orchestrator: a multi-query submission is
 * validated (unique node ids, resolvable references, no cycles) and every
 * query is submitted immediately, in dependency order so node-id references
 * rewrite to real queryUuids. Dependency *waiting* happens inside the
 * referencing query — a duckdb query's execution blocks until its referenced
 * results exist and fails if a referenced query fails — so pipeline
 * robustness is exactly that of any single async query.
 */
export class QuerySourceService extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly registry: QuerySourceRegistry;

    constructor(args: QuerySourceServiceArguments) {
        super({ serviceName: 'QuerySourceService' });
        this.projectModel = args.projectModel;
        this.queryHistoryModel = args.queryHistoryModel;
        this.featureFlagModel = args.featureFlagModel;
        this.registry = args.registry;
    }

    private async throwIfMultiSourceQueryDisabled(
        account: Account,
    ): Promise<void> {
        assertIsAccountWithOrg(account);
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.id,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.MultiSourceQuery,
        });
        if (!enabled) {
            throw new ForbiddenError('Multi-source queries are not enabled');
        }
    }

    /**
     * Running a source query needs the same ability as running a query from
     * the explorer: interactive viewers and up. Each source's submitQuery
     * additionally applies the checks of the execution path it wraps.
     */
    private async throwIfCannotRunQueries(
        account: Account,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async listSources(
        account: Account,
        projectUuid: string,
    ): Promise<ApiListQuerySourcesResults> {
        await this.throwIfMultiSourceQueryDisabled(account);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { sources: this.registry.list() };
    }

    async scanSchema(
        account: Account,
        projectUuid: string,
        sourceType: QuerySourceType,
    ): Promise<ApiScanQuerySourceSchemaResults> {
        await this.throwIfMultiSourceQueryDisabled(account);
        const source = this.registry.get(sourceType);
        return source.scanSchema({ account, projectUuid });
    }

    /**
     * Validates a submission and returns its queries in dependency order:
     * bounded size, unique well-formed node ids (generated where omitted),
     * known source types, references either naming a query in the submission
     * or holding a queryUuid of an existing result, and no cycles.
     */
    private validateQueries(queries: SourceQuery[]): ValidatedQuery[] {
        if (queries.length === 0) {
            throw new ParameterError('Submit at least one query');
        }
        if (queries.length > MAX_QUERIES) {
            throw new ParameterError(
                `A submission supports at most ${MAX_QUERIES} queries`,
            );
        }

        const nodeIds = new Set<string>();
        queries.forEach((query) => {
            if (query.nodeId === undefined) return;
            if (!NODE_ID_PATTERN.test(query.nodeId)) {
                throw new ParameterError(
                    `Invalid node id "${query.nodeId}": use letters, digits and underscores, starting with a letter or underscore`,
                );
            }
            if (nodeIds.has(query.nodeId)) {
                throw new ParameterError(
                    `Duplicate node id "${query.nodeId}" in submission`,
                );
            }
            nodeIds.add(query.nodeId);
        });

        // Generated ids fill the gaps for queries nothing references
        let generatedIndex = 0;
        const generateNodeId = (): string => {
            let candidate: string;
            do {
                generatedIndex += 1;
                candidate = `query_${generatedIndex}`;
            } while (nodeIds.has(candidate));
            nodeIds.add(candidate);
            return candidate;
        };

        const validated = queries.map((query): ValidatedQuery => {
            const nodeId = query.nodeId ?? generateNodeId();
            const source = this.registry.get(query.sourceType);
            const references = source.getQueryReferences(query);
            const dependsOn = [
                ...new Set(
                    references.filter((reference) => nodeIds.has(reference)),
                ),
            ];
            references
                .filter((reference) => !nodeIds.has(reference))
                .forEach((reference) => {
                    if (!UUID_PATTERN.test(reference)) {
                        throw new ParameterError(
                            `Reference "${reference}" on query "${nodeId}" is neither the node id of a query in this submission nor a query uuid`,
                        );
                    }
                });
            return { nodeId, query, source, dependsOn };
        });

        // Kahn's algorithm: dependency order to submit in; if it doesn't
        // cover every query, the remainder is a cycle
        const entriesById = new Map(
            validated.map((entry) => [entry.nodeId, entry]),
        );
        const remainingDeps = new Map(
            validated.map((entry) => [entry.nodeId, new Set(entry.dependsOn)]),
        );
        const dependents = new Map<string, string[]>();
        validated.forEach((entry) => {
            entry.dependsOn.forEach((dependency) => {
                dependents.set(dependency, [
                    ...(dependents.get(dependency) ?? []),
                    entry.nodeId,
                ]);
            });
        });
        const queue = validated
            .filter((entry) => entry.dependsOn.length === 0)
            .map((entry) => entry.nodeId);
        const ordered: ValidatedQuery[] = [];
        while (queue.length > 0) {
            const current = queue.shift()!;
            ordered.push(entriesById.get(current)!);
            remainingDeps.delete(current);
            (dependents.get(current) ?? []).forEach((dependent) => {
                const deps = remainingDeps.get(dependent);
                if (deps) {
                    deps.delete(current);
                    if (deps.size === 0) {
                        queue.push(dependent);
                    }
                }
            });
        }
        if (ordered.length !== validated.length) {
            const cyclic = Array.from(remainingDeps.keys()).join(', ');
            throw new ParameterError(
                `Submission contains a reference cycle involving: ${cyclic}`,
            );
        }

        return ordered;
    }

    /**
     * Submits one or more source queries. All queries are submitted
     * immediately (each submit is the standard fire-and-forget async execute,
     * so this returns in milliseconds with every queryUuid); submission
     * happens in dependency order purely so node-id references rewrite to the
     * referenced queries' uuids. A query referencing still-running results
     * waits inside its own execution.
     */
    async executeSourceQueries({
        account,
        projectUuid,
        queries,
        context,
        parameters,
        userAttributeOverrides,
        invalidateCache,
    }: SourceQueryExecutionContext & {
        account: Account;
        projectUuid: string;
        queries: SourceQuery[];
        context: QueryExecutionContext;
    }): Promise<ApiExecuteSourceQueriesResults> {
        await this.throwIfMultiSourceQueryDisabled(account);
        await this.throwIfCannotRunQueries(account, projectUuid);

        const ordered = this.validateQueries(queries);

        // nodeId -> queryUuid, grown as submissions happen so later queries'
        // node-id references resolve
        const resolvedReferences: Record<string, string> = {};
        const submissions: SourceQuerySubmission[] = [];
        for (const entry of ordered) {
            // eslint-disable-next-line no-await-in-loop -- dependency order: later submits need earlier queryUuids
            const { queryUuid } = await entry.source.submitQuery({
                account,
                projectUuid,
                context,
                query: entry.query,
                resolvedReferences: { ...resolvedReferences },
                parameters,
                userAttributeOverrides,
                invalidateCache,
                pivotConfiguration: entry.query.pivotConfiguration ?? null,
            });
            resolvedReferences[entry.nodeId] = queryUuid;
            submissions.push({
                nodeId: entry.nodeId,
                sourceType: entry.query.sourceType,
                queryUuid,
            });
        }

        return { queries: submissions };
    }

    /**
     * Batch status poll: the standard async query status for each uuid, from
     * query_history. Statuses are creator-scoped, like fetching results.
     */
    async getSourceQueryStatuses(
        account: Account,
        projectUuid: string,
        queryUuids: string[],
    ): Promise<ApiGetSourceQueryStatusResults> {
        await this.throwIfMultiSourceQueryDisabled(account);
        if (queryUuids.length === 0) {
            throw new ParameterError('Provide at least one query uuid');
        }
        if (queryUuids.length > MAX_STATUS_QUERY_UUIDS) {
            throw new ParameterError(
                `Provide at most ${MAX_STATUS_QUERY_UUIDS} query uuids`,
            );
        }

        const statuses = await Promise.all(
            queryUuids.map(async (queryUuid) => {
                const queryHistory = await this.queryHistoryModel.get(
                    queryUuid,
                    projectUuid,
                    account,
                );
                return {
                    queryUuid: queryHistory.queryUuid,
                    status: queryHistory.status,
                    error: queryHistory.error,
                };
            }),
        );

        return { statuses };
    }
}
