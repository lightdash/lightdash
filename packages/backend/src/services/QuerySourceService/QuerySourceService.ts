import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    ParameterError,
    QueryDagNodeStatus,
    QueryDagStatus,
    type Account,
    type ApiExecuteQueryDagResults,
    type ApiExecuteSourceQueryResults,
    type ApiGetQueryDagResults,
    type ApiListQuerySourcesResults,
    type ApiScanQuerySourceSchemaResults,
    type QueryDag,
    type QueryDagNodeRequest,
    type QueryExecutionContext,
    type QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type {
    QueryDagModel,
    QueryDagWithOwnership,
} from '../../models/QueryDagModel/QueryDagModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { BaseService } from '../BaseService';
import type { QuerySourceRegistry } from './QuerySourceRegistry';
import type { QuerySourceClient } from './types';

type QuerySourceServiceArguments = {
    projectModel: ProjectModel;
    queryHistoryModel: QueryHistoryModel;
    queryDagModel: QueryDagModel;
    featureFlagModel: FeatureFlagModel;
    registry: QuerySourceRegistry;
};

/** A DAG node with its source and resolved in-DAG dependencies. */
type ValidatedDagNode = {
    node: QueryDagNodeRequest;
    source: QuerySourceClient;
    dependsOn: string[];
};

const MAX_DAG_NODES = 25;
const NODE_ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/;
const UUID_PATTERN =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NODE_COMPLETION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * The single entry point for querying any registered source: source
 * discovery, schema scans, single query submission and DAG execution. Every
 * query — whatever its source — lands in the standard async query pipeline,
 * so each node yields a queryUuid whose results are fetched with the
 * standard results endpoint.
 *
 * DAG execution submits every node whose dependencies are satisfied in
 * parallel, polls the query history for completion, and resolves node
 * references to queryUuids before submitting dependents. The common shape is
 * n source queries fanned out in parallel feeding one duckdb node that
 * merges them.
 */
export class QuerySourceService extends BaseService {
    private readonly projectModel: ProjectModel;

    private readonly queryHistoryModel: QueryHistoryModel;

    private readonly queryDagModel: QueryDagModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly registry: QuerySourceRegistry;

    constructor(args: QuerySourceServiceArguments) {
        super({ serviceName: 'QuerySourceService' });
        this.projectModel = args.projectModel;
        this.queryHistoryModel = args.queryHistoryModel;
        this.queryDagModel = args.queryDagModel;
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
    ): Promise<{ organizationUuid: string }> {
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
        return { organizationUuid };
    }

    private static toApiDag(dag: QueryDagWithOwnership): QueryDag {
        return {
            queryDagUuid: dag.queryDagUuid,
            projectUuid: dag.projectUuid,
            status: dag.status,
            error: dag.error,
            createdAt: dag.createdAt,
            nodes: dag.nodes,
        };
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

    async executeSourceQuery({
        account,
        projectUuid,
        query,
        context,
    }: {
        account: Account;
        projectUuid: string;
        query: SourceQuery;
        context: QueryExecutionContext;
    }): Promise<ApiExecuteSourceQueryResults> {
        await this.throwIfMultiSourceQueryDisabled(account);
        await this.throwIfCannotRunQueries(account, projectUuid);

        const source = this.registry.get(query.sourceType);
        // Outside a DAG, references must already be queryUuids
        const { queryUuid } = await source.submitQuery({
            account,
            projectUuid,
            context,
            query,
            resolvedReferences: {},
        });
        return { queryUuid };
    }

    /**
     * Validates DAG shape: bounded size, unique well-formed node ids, known
     * source types, references either naming a node in the DAG (an edge) or
     * holding a queryUuid of an existing result, and no cycles.
     */
    private validateDag(nodes: QueryDagNodeRequest[]): ValidatedDagNode[] {
        if (nodes.length === 0) {
            throw new ParameterError('A query DAG needs at least one node');
        }
        if (nodes.length > MAX_DAG_NODES) {
            throw new ParameterError(
                `A query DAG supports at most ${MAX_DAG_NODES} nodes`,
            );
        }

        const nodeIds = new Set<string>();
        nodes.forEach((node) => {
            if (!NODE_ID_PATTERN.test(node.nodeId)) {
                throw new ParameterError(
                    `Invalid node id "${node.nodeId}": use letters, digits, underscores and hyphens, starting with a letter or underscore`,
                );
            }
            if (nodeIds.has(node.nodeId)) {
                throw new ParameterError(
                    `Duplicate node id "${node.nodeId}" in query DAG`,
                );
            }
            nodeIds.add(node.nodeId);
        });

        const validated = nodes.map((node): ValidatedDagNode => {
            const source = this.registry.get(node.query.sourceType);
            const references = source.getQueryReferences(node.query);
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
                            `Reference "${reference}" on node "${node.nodeId}" is neither a node id in this DAG nor a query uuid`,
                        );
                    }
                });
            return { node, source, dependsOn };
        });

        // Kahn's algorithm: if a topological order doesn't cover every node,
        // the remainder is a cycle
        const remainingDeps = new Map(
            validated.map((entry) => [
                entry.node.nodeId,
                new Set(entry.dependsOn),
            ]),
        );
        const dependents = new Map<string, string[]>();
        validated.forEach((entry) => {
            entry.dependsOn.forEach((dependency) => {
                dependents.set(dependency, [
                    ...(dependents.get(dependency) ?? []),
                    entry.node.nodeId,
                ]);
            });
        });
        const queue = validated
            .filter((entry) => entry.dependsOn.length === 0)
            .map((entry) => entry.node.nodeId);
        const ordered: string[] = [];
        while (queue.length > 0) {
            const current = queue.shift()!;
            ordered.push(current);
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
                `Query DAG contains a dependency cycle involving: ${cyclic}`,
            );
        }

        return validated;
    }

    async executeQueryDag({
        account,
        projectUuid,
        nodes,
        context,
    }: {
        account: Account;
        projectUuid: string;
        nodes: QueryDagNodeRequest[];
        context: QueryExecutionContext;
    }): Promise<ApiExecuteQueryDagResults> {
        await this.throwIfMultiSourceQueryDisabled(account);
        const { organizationUuid } = await this.throwIfCannotRunQueries(
            account,
            projectUuid,
        );

        const validated = this.validateDag(nodes);

        const dag = await this.queryDagModel.create({
            projectUuid,
            organizationUuid,
            createdByUserUuid: account.user.id,
            context,
            nodes: validated.map((entry) => ({
                nodeId: entry.node.nodeId,
                sourceType: entry.node.query.sourceType,
                query: entry.node.query,
                dependsOn: entry.dependsOn,
            })),
        });

        void this.runQueryDag({
            account,
            projectUuid,
            queryDagUuid: dag.queryDagUuid,
            validated,
            context,
        }).catch((e) => {
            this.logger.error(
                `Query DAG ${dag.queryDagUuid} failed: ${getErrorMessage(e)}`,
            );
        });

        return QuerySourceService.toApiDag(dag);
    }

    /**
     * In-process orchestration, mirroring how single async queries run: each
     * node is one promise that awaits its dependencies, submits, then polls
     * query history until the result is ready. Nodes with no unresolved
     * dependencies therefore run concurrently, and every state transition is
     * persisted so any pod can serve DAG status polls.
     */
    private async runQueryDag({
        account,
        projectUuid,
        queryDagUuid,
        validated,
        context,
    }: {
        account: Account;
        projectUuid: string;
        queryDagUuid: string;
        validated: ValidatedDagNode[];
        context: QueryExecutionContext;
    }): Promise<void> {
        await this.queryDagModel.updateDag(queryDagUuid, {
            status: QueryDagStatus.RUNNING,
        });

        const entriesById = new Map(
            validated.map((entry) => [entry.node.nodeId, entry]),
        );
        const nodePromises = new Map<string, Promise<string>>();

        const runNode = (entry: ValidatedDagNode): Promise<string> => {
            const existing = nodePromises.get(entry.node.nodeId);
            if (existing) {
                return existing;
            }

            const promise = (async (): Promise<string> => {
                let dependencyQueryUuids: string[];
                try {
                    dependencyQueryUuids = await Promise.all(
                        entry.dependsOn.map((dependency) =>
                            // Dependencies were validated against the node id set
                            runNode(entriesById.get(dependency)!),
                        ),
                    );
                } catch (e) {
                    await this.queryDagModel.updateNode(
                        queryDagUuid,
                        entry.node.nodeId,
                        {
                            status: QueryDagNodeStatus.SKIPPED,
                            error: 'An upstream node failed',
                        },
                    );
                    throw e;
                }

                const resolvedReferences = Object.fromEntries(
                    entry.dependsOn.map((dependency, index) => [
                        dependency,
                        dependencyQueryUuids[index],
                    ]),
                );

                try {
                    const { queryUuid } = await entry.source.submitQuery({
                        account,
                        projectUuid,
                        context,
                        query: entry.node.query,
                        resolvedReferences,
                    });
                    await this.queryDagModel.updateNode(
                        queryDagUuid,
                        entry.node.nodeId,
                        { status: QueryDagNodeStatus.RUNNING, queryUuid },
                    );

                    await this.queryHistoryModel.pollForQueryCompletion({
                        queryUuid,
                        account,
                        projectUuid,
                        timeoutMs: NODE_COMPLETION_TIMEOUT_MS,
                    });

                    await this.queryDagModel.updateNode(
                        queryDagUuid,
                        entry.node.nodeId,
                        { status: QueryDagNodeStatus.COMPLETED, queryUuid },
                    );
                    return queryUuid;
                } catch (e) {
                    await this.queryDagModel.updateNode(
                        queryDagUuid,
                        entry.node.nodeId,
                        {
                            status: QueryDagNodeStatus.ERROR,
                            error: getErrorMessage(e),
                        },
                    );
                    throw e;
                }
            })();

            nodePromises.set(entry.node.nodeId, promise);
            return promise;
        };

        const results = await Promise.allSettled(
            validated.map((entry) => runNode(entry)),
        );

        const failures = results.filter(
            (result): result is PromiseRejectedResult =>
                result.status === 'rejected',
        );
        if (failures.length > 0) {
            await this.queryDagModel.updateDag(queryDagUuid, {
                status: QueryDagStatus.ERROR,
                error: getErrorMessage(failures[0].reason),
            });
        } else {
            await this.queryDagModel.updateDag(queryDagUuid, {
                status: QueryDagStatus.COMPLETED,
            });
        }
    }

    async getQueryDag(
        account: Account,
        projectUuid: string,
        queryDagUuid: string,
    ): Promise<ApiGetQueryDagResults> {
        await this.throwIfMultiSourceQueryDisabled(account);

        const dag = await this.queryDagModel.get(queryDagUuid, projectUuid);

        // DAGs are creator-only, mirroring query history results access
        if (
            dag.createdByUserUuid === null ||
            dag.createdByUserUuid !== account.user.id
        ) {
            throw new ForbiddenError();
        }

        return QuerySourceService.toApiDag(dag);
    }
}
