import { useMergeSafe } from '../../../features/mergeQuery/context/useMerge';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { useGroupedResultsAvailability } from './useGroupedResultsAvailability';

/** Total rows of the results table, mirroring the source ExplorerResults reads. */
export const useResultsRowCount = (): number | null => {
    const merge = useMergeSafe();
    const {
        queryResults,
        unpivotedQuery,
        unpivotedQueryResults,
        unpivotedEnabled,
    } = useExplorerQuery();
    const { hasPivotColumns } = useGroupedResultsAvailability();

    const mergeResults = merge?.mergeResults;
    if (mergeResults) {
        return (
            (mergeResults.unpivotedResults ?? mergeResults.results)
                .totalResults ?? null
        );
    }
    if (merge?.isMerging) return null;

    if (hasPivotColumns && unpivotedEnabled) {
        return unpivotedQuery?.data?.queryUuid
            ? (unpivotedQueryResults.totalResults ?? null)
            : null;
    }
    return queryResults.totalResults ?? null;
};
