import {
    type CacheMetadata,
    type QueryResultsPreAggregate,
} from '@lightdash/common';
import { formatPreAggregateFallbackReason } from '../common/Dashboard/PreAggregateAuditIndicator.utils';

// `cacheMetadata.preAggregate.hit` is the plan-time match; `preAggregate` from
// results metadata is the post-execution truth, including warehouse fallback.
export function getResultSource(
    cacheMetadata: CacheMetadata,
    preAggregate: QueryResultsPreAggregate | null,
): string {
    if (cacheMetadata.cacheHit) return 'Result cache';
    if (preAggregate) {
        if (preAggregate.fallbackReason !== null)
            return `Warehouse (${formatPreAggregateFallbackReason(
                preAggregate.fallbackReason,
            )})`;
        return preAggregate.execution === 'duckdb'
            ? 'DuckDB pre-aggregate'
            : 'External pre-aggregate';
    }
    if (cacheMetadata.preAggregate?.hit) return 'DuckDB pre-aggregate';
    return 'Warehouse';
}

export function isServedFromPreAggregate(
    cacheMetadata: CacheMetadata,
    preAggregate: QueryResultsPreAggregate | null,
): boolean {
    if (preAggregate) return preAggregate.fallbackReason === null;
    return cacheMetadata.preAggregate?.hit ?? false;
}
