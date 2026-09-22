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
