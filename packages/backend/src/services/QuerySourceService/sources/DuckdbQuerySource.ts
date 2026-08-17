import {
    ParameterError,
    QuerySourceType,
    type DuckdbSourceQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

type DuckdbQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
};

/**
 * The DuckDB compose engine as a query source. It has no schema of its own:
 * its tables are the references handed to each query, which makes it the
 * merge/transform node of a multi-source DAG — upstream node results become
 * named tables the SQL joins and reshapes.
 */
export class DuckdbQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.DUCKDB,
        label: 'DuckDB compose',
        description:
            'DuckDB SQL over previous query results. Each references entry exposes another query result as a named table; reference upstream DAG nodes by node id, or existing results by queryUuid.',
    };

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

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        return {
            sourceType: QuerySourceType.DUCKDB,
            tables: [],
        };
    }

    getQueryReferences(query: SourceQuery): string[] {
        const sourceQuery = DuckdbQuerySource.assertSourceQuery(query);
        return Object.values(sourceQuery.references ?? {});
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
        resolvedReferences,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        const sourceQuery = DuckdbQuerySource.assertSourceQuery(query);

        const references = sourceQuery.references
            ? Object.fromEntries(
                  Object.entries(sourceQuery.references).map(
                      ([tableName, reference]) => [
                          tableName,
                          resolvedReferences[reference] ?? reference,
                      ],
                  ),
              )
            : undefined;

        const results =
            await this.asyncQueryService.executeAsyncComposeSqlQuery({
                account,
                projectUuid,
                sql: sourceQuery.sql,
                limit: sourceQuery.limit,
                references,
                context,
            });

        return { queryUuid: results.queryUuid };
    }
}
