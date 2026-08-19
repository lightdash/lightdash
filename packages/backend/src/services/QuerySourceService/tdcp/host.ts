import { type Account, type QueryExecutionContext } from '@lightdash/common';
import type { TdcpServer } from '@lightdash/tdcp';

/**
 * The host-side context every in-process TDCP server receives. queryContext
 * is an analytics tag, not an auth distinction — catalog and data requests
 * carry the same principal.
 */
export type TdcpHostContext = {
    account: Account;
    projectUuid: string;
    queryContext: QueryExecutionContext;
};

/**
 * What an in-process data request resolves to: a handle into the local
 * results pipeline. Descriptors exist only on the wire — the outbound
 * endpoint mints them from query_history, where schema, row count, expiry
 * and cache-hit are real rather than fabricated.
 */
export type TdcpLocalDataset = {
    queryUuid: string;
};

export type LightdashTdcpServer = TdcpServer<TdcpHostContext, TdcpLocalDataset>;
