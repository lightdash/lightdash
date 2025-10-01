import { useCallback, useEffect, useState } from 'react';
import {
    type QueryResultsProps,
    useGetReadyQueryResults,
    useInfiniteQueryResults,
} from '../../hooks/useQueryResults';

/**
 * Low-level hook that executes a single query and tracks its state
 *
 * This hook:
 * - Subscribes to TanStack Query for query creation and result fetching
 * - Manages query UUID history
 * - Returns query state and paginated results
 *
 * Used by both useExplorerQueryManager (orchestrator) and useExplorerQuery (consumer).
 */
export const useQueryExecutor = (
    queryArgs: QueryResultsProps | null,
    missingRequiredParameters: string[] | null,
    enabled: boolean = true,
    queryUuidHistoryProp?: string[],
    setQueryUuidHistoryProp?: (history: string[]) => void,
) => {
    const query = useGetReadyQueryResults(
        enabled ? queryArgs : null,
        enabled ? missingRequiredParameters : null,
    );

    // Use internal state if not provided (backward compatibility for ExplorerProvider)
    const [internalQueryUuidHistory, setInternalQueryUuidHistory] = useState<
        string[]
    >([]);
    const queryUuidHistory =
        queryUuidHistoryProp !== undefined
            ? queryUuidHistoryProp
            : internalQueryUuidHistory;

    // Create a wrapper that handles both direct values and function updaters
    const setQueryUuidHistory = useCallback(
        (valueOrUpdater: string[] | ((prev: string[]) => string[])) => {
            if (setQueryUuidHistoryProp !== undefined) {
                // Redux dispatch - compute the value from the updater function
                // Use queryUuidHistoryProp directly to get current value
                const newValue =
                    typeof valueOrUpdater === 'function'
                        ? valueOrUpdater(queryUuidHistoryProp || [])
                        : valueOrUpdater;
                setQueryUuidHistoryProp(newValue);
            } else {
                // Internal state - use React's setState which handles both patterns
                setInternalQueryUuidHistory(valueOrUpdater);
            }
        },
        [setQueryUuidHistoryProp, queryUuidHistoryProp],
    );

    useEffect(() => {
        if (query.data) {
            // Use function updater to avoid dependency on queryUuidHistory
            setQueryUuidHistory((prev) => [...prev, query.data.queryUuid]);
        }
        // Only depend on query.data changing, not on the setter
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query.data]);

    const queryResults = useInfiniteQueryResults(
        queryArgs?.projectUuid,
        queryUuidHistory[queryUuidHistory.length - 1],
    );

    // Return with setQueryUuidHistory for backward compatibility
    return [{ query, queryResults }, setQueryUuidHistory] as const;
};
