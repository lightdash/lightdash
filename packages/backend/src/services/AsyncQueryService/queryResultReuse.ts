import {
    QueryHistoryStatus,
    type ParametersValuesMap,
    type QueryHistory,
} from '@lightdash/common';
import { isEqual } from 'lodash';

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

// Repeating a live query within this window reuses its rows instead of
// spending the source API's quota again.
const API_RESULT_REUSE_MS = 60_000;

export const canReuseApiResult = (
    source: {
        status: QueryHistoryStatus;
        resultsFileName: string | null;
        resultsCreatedAt: Date | null;
        resultsExpiresAt: Date | null;
    },
    now: number = Date.now(),
): boolean =>
    source.status === QueryHistoryStatus.READY &&
    source.resultsFileName !== null &&
    source.resultsCreatedAt !== null &&
    now - source.resultsCreatedAt.getTime() <= API_RESULT_REUSE_MS &&
    (source.resultsExpiresAt === null ||
        source.resultsExpiresAt.getTime() > now);
