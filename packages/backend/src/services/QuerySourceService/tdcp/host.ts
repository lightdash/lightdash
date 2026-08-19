import { type Account, type QueryExecutionContext } from '@lightdash/common';
import type { TdcpDatasetDescriptor } from '@lightdash/tdcp';

export type TdcpCatalogContext = {
    account: Account;
    projectUuid: string;
};

export type TdcpRequestContext = TdcpCatalogContext & {
    queryContext: QueryExecutionContext;
};

/** Local query results use queryUuid as their in-process dataset handle. */
export const localDatasetDescriptor = (args: {
    queryUuid: string;
    expiresAt: Date;
}): TdcpDatasetDescriptor => ({
    datasetId: args.queryUuid,
    schema: [],
    rowCount: null,
    producedAt: new Date().toISOString(),
    expiresAt: args.expiresAt.toISOString(),
    freshness: {
        sourceQueriedAt: new Date().toISOString(),
        cacheHit: false,
    },
    links: null,
});
