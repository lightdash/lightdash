import { type RawResultRow, type ResultRow } from '@lightdash/common';
import { useEffect, useMemo } from 'react';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';

const unwrapRows = (rows: ResultRow[]): RawResultRow[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        ),
    );

/** Every row of an artifact result, raw, with the columns that describe them. */
export const useArtifactResultRows = (results: InfiniteQueryResults) => {
    const columns = useMemo(
        () => Object.values(results.columns ?? {}),
        [results.columns],
    );
    const rows = useMemo(() => unwrapRows(results.rows), [results.rows]);

    useEffect(() => {
        if (!results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [results]);

    // An empty result has no columns either, so only a non-empty one waits on them
    const isLoading =
        results.isInitialLoading ||
        results.isFetchingFirstPage ||
        (columns.length === 0 && results.totalResults !== 0);

    return { columns, rows, isLoading };
};
