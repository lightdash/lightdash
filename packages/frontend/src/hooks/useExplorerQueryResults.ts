import { useCallback } from 'react';
import {
    explorerActions,
    selectQueryUuidHistory,
    selectValidQueryArgs,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useQueryExecutor } from '../providers/Explorer/useQueryExecutor';

/**
 * Minimal hook for accessing query results without triggering re-renders
 * on dimension/metric changes.
 *
 * This hook ONLY subscribes to:
 * - validQueryArgs (query execution state)
 * - queryUuidHistory (for query executor)
 * - unpivotedQueryUuidHistory (for unpivoted query executor)
 *
 * It does NOT subscribe to:
 * - metricQuery (dimensions/metrics/tableCalculations)
 * - filters
 * - parameters
 * - etc.
 *
 * This prevents components from re-rendering when dimensions/metrics are toggled.
 */
export const useExplorerQueryResults = () => {
    const dispatch = useExplorerDispatch();

    // Only subscribe to query execution state
    const validQueryArgs = useExplorerSelector(selectValidQueryArgs);
    const queryUuidHistory = useExplorerSelector(selectQueryUuidHistory);

    const setQueryUuidHistory = useCallback(
        (history: string[]) => {
            dispatch(explorerActions.setQueryUuidHistory(history));
        },
        [dispatch],
    );

    // Main query state - no missingRequiredParameters needed for minimal mode
    const [mainQueryExecutor] = useQueryExecutor(
        validQueryArgs,
        null, // missingRequiredParameters not needed
        true,
        queryUuidHistory,
        setQueryUuidHistory,
    );
    const { query, queryResults } = mainQueryExecutor;

    return {
        query,
        queryResults,
    };
};
