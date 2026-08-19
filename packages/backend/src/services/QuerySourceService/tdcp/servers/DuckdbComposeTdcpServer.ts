import {
    ParameterError,
    QuerySourceType,
    type DuckdbSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import {
    createTdcpServer,
    TdcpDialects,
    TdcpMethods,
    type TdcpDataRequest,
} from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import type { LightdashTdcpServer } from '../host';

type DuckdbComposeTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
};

const assertDuckdbQuery = (query: SourceQuery): DuckdbSourceQuery => {
    if (query.sourceType !== QuerySourceType.DUCKDB) {
        throw new ParameterError(`Expected a ${QuerySourceType.DUCKDB} query`);
    }
    return query;
};

/** The array shorthand exposes each referenced node as a table of the same name. */
const normalizeReferences = (
    references: DuckdbSourceQuery['references'],
): Record<string, string> | undefined => {
    if (references === undefined) return undefined;
    if (Array.isArray(references)) {
        return Object.fromEntries(references.map((nodeId) => [nodeId, nodeId]));
    }
    return references;
};

/** DuckdbSourceQuery -> protocol request, owned by this server module. */
export const duckdbSourceQueryToDataRequest = (
    query: SourceQuery,
    resolvedReferences: Record<string, string>,
): TdcpDataRequest => {
    const duckdbQuery = assertDuckdbQuery(query);
    const normalized = normalizeReferences(duckdbQuery.references);
    const references = normalized
        ? Object.fromEntries(
              Object.entries(normalized).map(([tableName, reference]) => [
                  tableName,
                  resolvedReferences[reference] ?? reference,
              ]),
          )
        : undefined;
    return {
        method: TdcpMethods.QUERY,
        dialect: TdcpDialects.DUCKDB_SQL,
        query: duckdbQuery.sql,
        references,
        limit: duckdbQuery.limit,
    };
};

/** The DAG edges: which result references a duckdb query consumes. */
export const duckdbQueryReferences = (query: SourceQuery): string[] =>
    Object.values(
        normalizeReferences(assertDuckdbQuery(query).references) ?? {},
    );

export const createDuckdbComposeTdcpServer = ({
    asyncQueryService,
}: DuckdbComposeTdcpServerArguments): LightdashTdcpServer =>
    createTdcpServer({
        catalog: async () => ({ tables: [], nextCursor: null }),
        queryDialects: [
            {
                dialect: TdcpDialects.DUCKDB_SQL,
                form: 'text',
                payloadSchema: null,
                docsUrl: null,
            },
        ],
        compose: true,
        query: async (ctx, request) => {
            if (request.query === undefined) {
                throw new ParameterError(
                    'A sql:duckdb query carries query text',
                );
            }
            const results = await asyncQueryService.executeAsyncComposeSqlQuery(
                {
                    account: ctx.account,
                    projectUuid: ctx.projectUuid,
                    sql: request.query,
                    limit: request.limit,
                    references: request.references,
                    context: ctx.queryContext,
                },
            );

            return { queryUuid: results.queryUuid };
        },
    });
