import {
    getAgentEstimateExceededMessage,
    getQueryCostEstimateSettings,
    QueryCostEstimateExceededError,
    type WarehouseClient,
    type WarehouseExecuteAsyncQueryArgs,
    type WarehouseQueryEstimate,
} from '@lightdash/common';
import NodeCache from 'node-cache';
import { createHash } from 'node:crypto';

const ESTIMATE_TTL_SECONDS = 5 * 60;
const MAX_CACHED_ESTIMATES = 10_000;

/**
 * Dry runs are free and fast, but agents and the explorer repeat the same SQL.
 * Keyed by the full credentials so an estimate is never shared across
 * identities that may see different tables.
 */
export class QueryEstimateCache {
    private readonly cache = new NodeCache({
        stdTTL: ESTIMATE_TTL_SECONDS,
        maxKeys: MAX_CACHED_ESTIMATES,
        useClones: false,
    });

    static getKey(
        warehouseClient: WarehouseClient,
        args: Pick<WarehouseExecuteAsyncQueryArgs, 'sql' | 'values'>,
    ): string {
        return createHash('sha256')
            .update(
                JSON.stringify([
                    warehouseClient.credentials,
                    args.sql,
                    args.values ?? null,
                ]),
            )
            .digest('hex');
    }

    /** Null when the warehouse has no dry-run estimate. */
    async estimate(
        warehouseClient: WarehouseClient,
        args: WarehouseExecuteAsyncQueryArgs,
    ): Promise<WarehouseQueryEstimate | null> {
        if (!warehouseClient.estimateQuery) return null;
        const key = QueryEstimateCache.getKey(warehouseClient, args);
        const cached = this.cache.get<WarehouseQueryEstimate>(key);
        if (cached) return cached;
        const estimate = await warehouseClient.estimateQuery(args);
        if (this.cache.getStats().keys < MAX_CACHED_ESTIMATES) {
            this.cache.set(key, estimate);
        }
        return estimate;
    }
}

/**
 * Refuses an agent query whose dry-run estimate is above the connection's
 * agent limit. maximumBytesBilled stays the backstop: dry runs report 0 bytes
 * for row-level security and can underreport external tables.
 */
export const assertAgentQueryWithinEstimateLimit = async (
    cache: QueryEstimateCache,
    warehouseClient: WarehouseClient,
    args: WarehouseExecuteAsyncQueryArgs,
): Promise<void> => {
    const limitBytes =
        getQueryCostEstimateSettings(warehouseClient.credentials)
            ?.agentMaximumEstimatedBytes ?? null;
    if (limitBytes === null) return;
    const estimate = await cache.estimate(warehouseClient, args);
    if (estimate === null || estimate.totalBytesProcessed <= limitBytes) return;
    throw new QueryCostEstimateExceededError(
        getAgentEstimateExceededMessage({
            estimatedBytes: estimate.totalBytesProcessed,
            limitBytes,
        }),
        { estimatedBytes: estimate.totalBytesProcessed, limitBytes },
    );
};
