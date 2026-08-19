import {
    ParameterError,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import { type TdcpCatalog, type TdcpDataRequest } from '@lightdash/tdcp';
import type { LightdashTdcpServer, TdcpHostContext } from '../tdcp/host';
import { tdcpTypeToDimensionType } from '../tdcp/typeMapping';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

/**
 * How one source's public query shape becomes a protocol request. Each
 * server module exports its own mapping next to the server it belongs to —
 * the adapter stays genuinely source-agnostic.
 */
export type SourceQueryToDataRequest = (
    query: SourceQuery,
    resolvedReferences: Record<string, string>,
    ctx: TdcpHostContext,
) => TdcpDataRequest | Promise<TdcpDataRequest>;

type TdcpQuerySourceArguments = {
    definition: QuerySourceDefinition;
    server: LightdashTdcpServer;
    toDataRequest: SourceQueryToDataRequest;
    /** Result references a query consumes (the DAG edges); default none. */
    getQueryReferences?: (query: SourceQuery) => string[];
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
        columns: (table.columns ?? []).map((column) => ({
            reference: column.name,
            type: tdcpTypeToDimensionType(column.type),
            label: column.label,
            description: column.description,
        })),
    })),
});

/**
 * Adapts an in-process TDCP server onto the QuerySourceClient contract, so
 * every built-in source speaks the protocol vocabulary while the registry,
 * service, controller and tests stay untouched. One adapter, used three
 * times — remote servers go through RemoteTdcpQuerySource, which
 * additionally materializes data-plane results into the local pipeline.
 *
 * @oliver: QuerySourceClient stays the internal seam; TdcpServer is the
 * protocol seam behind it. In-process, catalog is the load-bearing path
 * (it serves the schema endpoint); execute-side conformance is what the
 * SDK's tests claim, not what this deployment exercises — the adapter and
 * the registrations are the same author's two hands until the outbound
 * endpoint makes dialect and capabilities wire input.
 */
export class TdcpQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition;

    private readonly server: LightdashTdcpServer;

    private readonly toDataRequest: SourceQueryToDataRequest;

    private readonly referencesOf: (query: SourceQuery) => string[];

    constructor(args: TdcpQuerySourceArguments) {
        this.definition = args.definition;
        this.server = args.server;
        this.toDataRequest = args.toDataRequest;
        this.referencesOf = args.getQueryReferences ?? (() => []);
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
        context,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
        const catalog = await this.server.catalog(
            { account, projectUuid, queryContext: context },
            {},
        );
        return catalogToQuerySourceSchema(this.definition.sourceType, catalog);
    }

    getQueryReferences(query: SourceQuery): string[] {
        this.assertQueryType(query);
        return this.referencesOf(query);
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
        resolvedReferences,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        this.assertQueryType(query);
        const ctx: TdcpHostContext = {
            account,
            projectUuid,
            queryContext: context,
        };
        const request = await this.toDataRequest(
            query,
            resolvedReferences,
            ctx,
        );
        const { dataset } = await this.server.execute(ctx, request);
        return { queryUuid: dataset.queryUuid };
    }
}
