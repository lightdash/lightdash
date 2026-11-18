import {
    QueryHistoryStatus,
    type ParametersValuesMap,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';

// Reuse is an explicit presentation-only request, after normal compilation and authorization.
export const canReuseQueryResult = (
    source: Pick<
        QueryHistory,
        | 'status'
        | 'createdByUserUuid'
        | 'compiledSql'
        | 'usedParameters'
        | 'resultsFileName'
        | 'resultsExpiresAt'
        | 'createdAt'
    >,
    current: {
        userUuid: string;
        sql: string;
        parameters: ParametersValuesMap;
        now?: number;
    },
): boolean => {
    const now = current.now ?? Date.now();
    return (
        source.status === QueryHistoryStatus.READY &&
        source.createdByUserUuid === current.userUuid &&
        source.compiledSql === current.sql &&
        isEqual(source.usedParameters ?? {}, current.parameters) &&
        source.resultsFileName !== null &&
        source.resultsExpiresAt !== null &&
        source.resultsExpiresAt.getTime() > now &&
        source.createdAt.getTime() <= now &&
        now - source.createdAt.getTime() <= 15 * 60_000
    );
};

type LiveReusePolicy = {
    /** The source's freshness window. */
    ttlSeconds: number;
    /** Results fetched before a purge are never reused. */
    purgedAt: Date | null;
};

/**
 * Repeating a live query within its source's freshness window reuses its
 * rows instead of spending the integration's quota again.
 */
export const canReuseApiResult = (
    source: {
        status: QueryHistoryStatus;
        resultsFileName: string | null;
        resultsCreatedAt: Date | null;
        resultsExpiresAt: Date | null;
    },
    policy: LiveReusePolicy,
    now: number = Date.now(),
): boolean =>
    source.status === QueryHistoryStatus.READY &&
    source.resultsFileName !== null &&
    source.resultsCreatedAt !== null &&
    now - source.resultsCreatedAt.getTime() <= policy.ttlSeconds * 1_000 &&
    (policy.purgedAt === null ||
        source.resultsCreatedAt.getTime() > policy.purgedAt.getTime()) &&
    (source.resultsExpiresAt === null ||
        source.resultsExpiresAt.getTime() > now);

/** A finished live result whose rows another query can point at. */
export type StoredLiveResult = {
    warehouseExecutionTimeMs: number | null;
    totalRowCount: number | null;
    resultsFileName: string;
    resultsCreatedAt: Date;
    resultsUpdatedAt: Date | null;
    resultsExpiresAt: Date | null;
    columns: ResultColumns | null;
};

/** The rows of a live query's result, when they are fresh enough to reuse. */
export const toStoredLiveResult = (
    result: Pick<
        QueryHistory,
        | 'status'
        | 'warehouseExecutionTimeMs'
        | 'totalRowCount'
        | 'resultsFileName'
        | 'resultsCreatedAt'
        | 'resultsUpdatedAt'
        | 'resultsExpiresAt'
        | 'columns'
    >,
    policy: LiveReusePolicy,
    now: number = Date.now(),
): StoredLiveResult | null => {
    const { resultsFileName, resultsCreatedAt } = result;
    if (
        !canReuseApiResult(result, policy, now) ||
        resultsFileName === null ||
        resultsCreatedAt === null
    ) {
        return null;
    }
    return {
        warehouseExecutionTimeMs: result.warehouseExecutionTimeMs,
        totalRowCount: result.totalRowCount,
        resultsFileName,
        resultsCreatedAt,
        resultsUpdatedAt: result.resultsUpdatedAt,
        resultsExpiresAt: result.resultsExpiresAt,
        columns: result.columns,
    };
};
