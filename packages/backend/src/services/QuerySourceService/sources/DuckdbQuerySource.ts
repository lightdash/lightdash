import {
    ParameterError,
    QuerySourceType,
    type DuckdbSourceQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { DuckdbQueryPlan } from '../../AsyncQueryService/types';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SourceQuerySubmissionResult,
    SubmitSourceQueryArgs,
} from '../types';

type DuckdbQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
};

/**
 * The DuckDB compose engine as a query source. It has no schema of its own:
 * its tables are the references handed to each query, which makes it the
 * merge/transform step of a multi-source pipeline — other queries' results
 * become named tables the SQL joins and reshapes.
 */
export class DuckdbQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.DUCKDB,
        label: 'DuckDB compose',
        description:
            'DuckDB SQL over other query results. References expose results as named tables: an array of node ids (each a table named by its node id) or a {tableName: nodeIdOrQueryUuid} map. A referenced result keeps the column names of the query that produced it — field ids for semanticLayer queries, SELECT output names for sql queries. References to still-running queries are waited on.',
    };

    readonly supportsPivot = false;

    private readonly asyncQueryService: AsyncQueryService;

    constructor(args: DuckdbQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
    }

    private static assertSourceQuery(query: SourceQuery): DuckdbSourceQuery {
        if (query.sourceType !== QuerySourceType.DUCKDB) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.DUCKDB} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    /** The array shorthand exposes each referenced node as a table of the same name. */
    private static normalizeReferences(
        references: DuckdbSourceQuery['references'],
    ): Record<string, string> | undefined {
        if (references === undefined) return undefined;
        if (Array.isArray(references)) {
            return Object.fromEntries(
                references.map((nodeId) => [nodeId, nodeId]),
            );
        }
        return references;
    }

    /** A supplied column's provenance may name a node; it resolves like a table reference. */
    private static resolvePlanReferences(
        plan: DuckdbQueryPlan,
        resolvedReferences: Record<string, string>,
    ): DuckdbQueryPlan {
        if (plan.columns.mode !== 'supplied') return plan;
        const originalColumns = Object.fromEntries(
            Object.entries(plan.columns.originalColumns).map(
                ([reference, column]) => {
                    const sourceQueryUuid = column.provenance?.sourceQueryUuid;
                    if (sourceQueryUuid === undefined) {
                        return [reference, column];
                    }
                    return [
                        reference,
                        {
                            ...column,
                            provenance: {
                                ...column.provenance,
                                sourceQueryUuid:
                                    resolvedReferences[sourceQueryUuid] ??
                                    sourceQueryUuid,
                            },
                        },
                    ];
                },
            ),
        );
        return { ...plan, columns: { ...plan.columns, originalColumns } };
    }

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        return {
            sourceType: QuerySourceType.DUCKDB,
            tables: [],
        };
    }

    getQueryReferences(query: SourceQuery): string[] {
        const sourceQuery = DuckdbQuerySource.assertSourceQuery(query);
        return Object.values(
            DuckdbQuerySource.normalizeReferences(sourceQuery.references) ?? {},
        );
    }

    /**
     * User attribute overrides have nothing to apply to here: referenced
     * results were produced under them and compose SQL carries no attribute
     * references.
     *
     * Without a plan the query takes the public compose SQL path, which
     * carries its own flag and ability gates and cannot pivot: raw SQL has no
     * fields to pivot on. With a plan it goes straight to the execution
     * tail, where the plan's composer owns the pivot stage; the caller that
     * built the plan owns authorization.
     */
    async submitQuery({
        account,
        projectUuid,
        context,
        query,
        resolvedReferences,
        parameters,
        invalidateCache,
        pivotConfiguration,
        plan,
    }: SubmitSourceQueryArgs): Promise<SourceQuerySubmissionResult> {
        const sourceQuery = DuckdbQuerySource.assertSourceQuery(query);
        if (pivotConfiguration !== null && plan === null) {
            throw new ParameterError(
                `${QuerySourceType.DUCKDB} queries do not support pivotConfiguration yet`,
            );
        }

        const normalized = DuckdbQuerySource.normalizeReferences(
            sourceQuery.references,
        );
        const references = normalized
            ? Object.fromEntries(
                  Object.entries(normalized).map(([tableName, reference]) => [
                      tableName,
                      resolvedReferences[reference] ?? reference,
                  ]),
              )
            : undefined;

        const args = {
            account,
            projectUuid,
            sql: sourceQuery.sql,
            limit: sourceQuery.limit,
            references,
            context,
            parameters,
            invalidateCache,
        };
        const { queryUuid } =
            plan === null
                ? await this.asyncQueryService.executeAsyncComposeSqlQuery(args)
                : await this.asyncQueryService.executeAsyncDuckdbSourceQuery({
                      ...args,
                      pivotConfiguration: pivotConfiguration ?? undefined,
                      plan: DuckdbQuerySource.resolvePlanReferences(
                          plan,
                          resolvedReferences,
                      ),
                  });

        // A DuckDB query always runs: its inputs may be cached, it is not
        return { queryUuid, cacheHit: false };
    }
}
