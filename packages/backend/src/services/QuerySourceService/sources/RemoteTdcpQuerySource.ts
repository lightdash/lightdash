import {
    ParameterError,
    QuerySourceType,
    TdcpMethods,
    UnexpectedServerError,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
    type TdcpSourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import { RemoteTdcpServer } from '../tdcp/RemoteTdcpServer';
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
 * against the remote server, then the data-plane result is materialized
 * into the local results pipeline, where it becomes an ordinary queryUuid
 * that compose references, pagination and viz consume unchanged.
 */
export class RemoteTdcpQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.TDCP,
        label: 'Remote TDCP server',
        description:
            'Queries against a remote server speaking the tabular data context protocol draft. The query names the server and carries a dialect-tagged payload; results are imported into the standard results pipeline and referenced like any other query result.',
    };

    private readonly asyncQueryService: AsyncQueryService;

    constructor(args: RemoteTdcpQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
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

        const server = new RemoteTdcpServer({ url: sourceQuery.serverUrl });
        const descriptor = await server.query(
            { account, projectUuid, queryContext: context },
            {
                method: TdcpMethods.QUERY,
                dialect: sourceQuery.dialect,
                query: sourceQuery.query,
                limit: sourceQuery.limit,
            },
        );

        const jsonlLink = descriptor.links?.find(
            (link) => link.encoding === 'jsonl',
        );
        if (!jsonlLink) {
            throw new UnexpectedServerError(
                'TDCP server returned a descriptor without a jsonl data-plane link',
            );
        }

        return this.asyncQueryService.executeAsyncTdcpImport({
            account,
            projectUuid,
            context,
            serverUrl: sourceQuery.serverUrl,
            descriptor,
            fetchRows: () => RemoteTdcpServer.fetchJsonlRows(jsonlLink),
        });
    }
}
