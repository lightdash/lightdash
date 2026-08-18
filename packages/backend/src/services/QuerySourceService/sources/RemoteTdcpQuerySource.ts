import {
    ParameterError,
    QuerySourceType,
    UnexpectedServerError,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type ResultColumns,
    type SourceQuery,
    type TdcpSourceQuery,
} from '@lightdash/common';
import { TdcpClient } from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import { createTdcpGuardedFetch } from '../tdcp/guardedFetch';
import { tdcpTypeToDimensionType } from '../tdcp/typeMapping';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

type RemoteTdcpQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
};

/**
 * Remote TDCP servers as a query source. One registry entry covers every
 * remote server — the query names the server — so external sources plug
 * into the multi-source pipeline without new source types.
 *
 * The submit path is the inbound half of the protocol: control-plane query
 * through the @lightdash/tdcp client (SSRF-guarded fetch on both planes),
 * then the data plane streams into the local results pipeline, where it
 * becomes an ordinary queryUuid that compose references, pagination and
 * viz consume unchanged. The import primitive itself is protocol-agnostic —
 * this class hands it plain columns and a row stream.
 */
export class RemoteTdcpQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.TDCP,
        label: 'Remote TDCP server',
        description:
            'Queries against a remote server speaking the tabular data context protocol draft. The query names the server and carries a dialect-tagged payload; results are imported into the standard results pipeline and referenced like any other query result.',
    };

    private readonly asyncQueryService: AsyncQueryService;

    private readonly fetchImpl: typeof fetch;

    constructor(args: RemoteTdcpQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.fetchImpl = createTdcpGuardedFetch();
    }

    private static assertSourceQuery(query: SourceQuery): TdcpSourceQuery {
        if (query.sourceType !== QuerySourceType.TDCP) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.TDCP} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        // @oliver: the schema endpoint is GET /{sourceType}/schema, but a
        // remote scan needs to name WHICH server — that's a controller
        // change (schema of a registered server) that lands with the
        // sources entity. Empty until then.
        return {
            sourceType: QuerySourceType.TDCP,
            tables: [],
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(): string[] {
        // @oliver: remote compose (sending OUR handles to THEIR compose
        // server) is deliberately out of the draft — it needs the token
        // delegation decision from the proposal before any handle leaves
        // the deployment.
        return [];
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        const sourceQuery = RemoteTdcpQuerySource.assertSourceQuery(query);

        // @oliver: serverUrl straight from the request body is the draft's
        // biggest shortcut — it becomes a registered-server reference (and
        // per-server credentials) with the sources entity. The guarded
        // fetch closes the private-address hole meanwhile.
        const client = new TdcpClient({
            url: sourceQuery.serverUrl,
            fetchImpl: this.fetchImpl,
        });

        const descriptor = await client.query({
            dialect: sourceQuery.dialect,
            query: sourceQuery.query,
            limit: sourceQuery.limit,
        });

        const jsonlLink = descriptor.links?.find(
            (link) => link.encoding === 'jsonl',
        );
        if (!jsonlLink) {
            throw new UnexpectedServerError(
                'TDCP server returned a descriptor without a jsonl data-plane link',
            );
        }

        const columns: ResultColumns = Object.fromEntries(
            descriptor.schema.map((column) => [
                column.name,
                {
                    reference: column.name,
                    type: tdcpTypeToDimensionType(column.type),
                },
            ]),
        );

        return this.asyncQueryService.executeAsyncExternalDatasetImport({
            account,
            projectUuid,
            context,
            source: {
                url: sourceQuery.serverUrl,
                datasetId: descriptor.datasetId,
            },
            columns,
            fetchRows: () => client.fetchJsonlRows(jsonlLink),
        });
    }
}
