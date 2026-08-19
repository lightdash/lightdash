import {
    createTdcpServer,
    TdcpDialects,
    type TdcpServer,
} from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import {
    localDatasetDescriptor,
    type TdcpCatalogContext,
    type TdcpRequestContext,
} from '../host';

type DuckdbComposeTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
};

export const createDuckdbComposeTdcpServer = ({
    asyncQueryService,
}: DuckdbComposeTdcpServerArguments): TdcpServer<
    TdcpCatalogContext,
    TdcpRequestContext
> =>
    createTdcpServer({
        catalog: async () => ({ tables: [] }),
        queryDialects: [TdcpDialects.DUCKDB_SQL],
        compose: true,
        query: async (ctx, request) => {
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

            return localDatasetDescriptor({
                queryUuid: results.queryUuid,
                expiresAt: asyncQueryService.getCacheExpiresAt(new Date()),
            });
        },
    });
