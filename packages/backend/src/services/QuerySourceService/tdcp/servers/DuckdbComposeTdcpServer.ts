import {
    ParameterError,
    TDCP_PROTOCOL_REVISION,
    TdcpDialects,
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpDataRequest,
    type TdcpDatasetDescriptor,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import {
    localDatasetDescriptor,
    type TdcpCatalogContext,
    type TdcpRequestContext,
    type TdcpServer,
} from '../TdcpServer';

type DuckdbComposeTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
};

/**
 * The DuckDB compose engine as an in-process TDCP server, and the answer to
 * "does supporting TDCP mean the client needs a DuckDB?": no — compose is a
 * server capability. A consumer with no local engine sends dataset
 * references here and gets a new dataset back. It has no catalog of its own:
 * its tables are the references handed to each query.
 */
export class DuckdbComposeTdcpServer implements TdcpServer {
    private readonly asyncQueryService: AsyncQueryService;

    constructor(args: DuckdbComposeTdcpServerArguments) {
        this.asyncQueryService = args.asyncQueryService;
    }

    // eslint-disable-next-line class-methods-use-this
    async capabilities(): Promise<TdcpCapabilities> {
        return {
            revision: TDCP_PROTOCOL_REVISION,
            read: false,
            scan: false,
            queryDialects: [TdcpDialects.DUCKDB_SQL],
            compose: true,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    async catalog(_ctx: TdcpCatalogContext): Promise<TdcpCatalog> {
        return { tables: [] };
    }

    async query(
        ctx: TdcpRequestContext,
        request: TdcpDataRequest,
    ): Promise<TdcpDatasetDescriptor> {
        if (
            request.method !== TdcpMethods.QUERY ||
            request.dialect !== TdcpDialects.DUCKDB_SQL
        ) {
            throw new ParameterError(
                `The compose source only accepts ${TdcpMethods.QUERY} requests in the ${TdcpDialects.DUCKDB_SQL} dialect`,
            );
        }

        const results =
            await this.asyncQueryService.executeAsyncComposeSqlQuery({
                account: ctx.account,
                projectUuid: ctx.projectUuid,
                sql: request.query,
                limit: request.limit,
                references: request.references,
                context: ctx.queryContext,
            });

        return localDatasetDescriptor({
            queryUuid: results.queryUuid,
            expiresAt: this.asyncQueryService.getCacheExpiresAt(new Date()),
        });
    }
}
