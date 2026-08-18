import {
    assertUnreachable,
    ParameterError,
    QuerySourceType,
    UnexpectedServerError,
    type DuckdbSourceQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
} from '@lightdash/common';
import {
    TdcpDialects,
    TdcpMethods,
    type TdcpCatalog,
    type TdcpDataRequest,
} from '@lightdash/tdcp';
import { tdcpSourceQueryToDataRequest } from '../tdcp/dataRequest';
import type { TdcpServer } from '../tdcp/TdcpServer';
import { tdcpTypeToDimensionType } from '../tdcp/typeMapping';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

type TdcpQuerySourceArguments = {
    definition: QuerySourceDefinition;
    server: TdcpServer;
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

/** A TDCP catalog in the query-sources schema shape — same data, two vocabularies. */
export const catalogToQuerySourceSchema = (
    sourceType: QuerySourceType,
    catalog: TdcpCatalog,
): QuerySourceSchema => ({
    sourceType,
    tables: catalog.tables.map((table) => ({
        reference: table.reference,
        label: table.label,
        description: table.description,
        columns: table.columns.map((column) => ({
            reference: column.name,
            type: tdcpTypeToDimensionType(column.type),
            label: column.label,
            description: column.description,
        })),
    })),
});

/**
 * Adapts an in-process TDCP server onto the QuerySourceClient contract, so
 * every built-in source speaks the protocol while the registry, service,
 * controller and tests stay untouched. One adapter, used three times —
 * remote servers go through RemoteTdcpQuerySource, which additionally
 * materializes data-plane results into the local pipeline.
 *
 * @oliver: this is the "make them all TDCP" move. QuerySourceClient stays
 * the internal seam; TdcpServer is the protocol seam behind it. When the
 * outbound MCP server lands it re-exposes the same TdcpServer instances,
 * so inbound and outbound share one implementation per source.
 */
export class TdcpQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition;

    private readonly server: TdcpServer;

    constructor(args: TdcpQuerySourceArguments) {
        this.definition = args.definition;
        this.server = args.server;
    }

    /**
     * SourceQuery -> protocol request. The public API keeps per-source query
     * shapes (typed, TSOA-validated); the protocol carries dialect-tagged
     * payloads. This mapping is the only place the two vocabularies meet.
     */
    private static toDataRequest(
        query: SourceQuery,
        resolvedReferences: Record<string, string>,
    ): TdcpDataRequest {
        switch (query.sourceType) {
            case QuerySourceType.SEMANTIC_LAYER: {
                const { sourceType, nodeId, ...payload } = query;
                return {
                    method: TdcpMethods.QUERY,
                    dialect: TdcpDialects.LIGHTDASH_METRIC_QUERY,
                    query: JSON.stringify(payload),
                    limit: query.limit,
                };
            }
            case QuerySourceType.SQL:
                return {
                    method: TdcpMethods.QUERY,
                    dialect: TdcpDialects.WAREHOUSE_SQL,
                    query: query.sql,
                    limit: query.limit,
                };
            case QuerySourceType.DUCKDB: {
                const normalized = normalizeReferences(query.references);
                const references = normalized
                    ? Object.fromEntries(
                          Object.entries(normalized).map(
                              ([tableName, reference]) => [
                                  tableName,
                                  resolvedReferences[reference] ?? reference,
                              ],
                          ),
                      )
                    : undefined;
                return {
                    method: TdcpMethods.QUERY,
                    dialect: TdcpDialects.DUCKDB_SQL,
                    query: query.sql,
                    references,
                    limit: query.limit,
                };
            }
            case QuerySourceType.TDCP:
                return tdcpSourceQueryToDataRequest(query);
            default:
                return assertUnreachable(query, 'Unknown source query type');
        }
    }

    private assertQueryType(query: SourceQuery): void {
        if (query.sourceType !== this.definition.sourceType) {
            throw new ParameterError(
                `Expected a ${this.definition.sourceType} query, got "${query.sourceType}"`,
            );
        }
    }

    async scanSchema({
        account,
        projectUuid,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
        const catalog = await this.server.catalog({ account, projectUuid });
        return catalogToQuerySourceSchema(this.definition.sourceType, catalog);
    }

    getQueryReferences(query: SourceQuery): string[] {
        this.assertQueryType(query);
        if (query.sourceType === QuerySourceType.DUCKDB) {
            return Object.values(normalizeReferences(query.references) ?? {});
        }
        return [];
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
        resolvedReferences,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        this.assertQueryType(query);
        const request = TdcpQuerySource.toDataRequest(
            query,
            resolvedReferences,
        );

        const descriptor = await this.server.query(
            { account, projectUuid, queryContext: context },
            request,
        );

        if (descriptor.links !== null) {
            throw new UnexpectedServerError(
                'In-process TDCP servers must not return data-plane links',
            );
        }

        // In-process datasets live in the local results pipeline: the
        // dataset id is the queryUuid.
        return { queryUuid: descriptor.datasetId };
    }
}
