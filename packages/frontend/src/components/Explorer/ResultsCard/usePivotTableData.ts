import type {
    ItemsMap,
    PivotData,
    ReadyQueryResultsPage,
    ResultRow,
} from '@lightdash/common';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import { useEffect, useMemo, useRef, useState } from 'react';

const createWorker = createWorkerFactory(
    () => import('@lightdash/common/src/pivot/pivotQueryResults'),
);

type UsePivotTableDataArgs = {
    enabled: boolean;
    rows: ResultRow[];
    pivotDetails: ReadyQueryResultsPage['pivotDetails'] | undefined;
    columnOrder: string[];
    getField: (fieldId: string) => ItemsMap[string] | undefined;
    getFieldLabel: (fieldId: string | null | undefined) => string | undefined;
};

type PivotTableDataState = {
    isLoading: boolean;
    data: PivotData | undefined;
    error: Error | undefined;
};

/**
 * Hook to convert SQL-pivoted query results to PivotData format for the PivotTable component.
 * Uses a web worker to perform the conversion off the main thread.
 *
 * The async web worker call requires state management for loading/error/data.
 * We use useEffect here because the worker call is a side effect that produces
 * a result asynchronously - this is the appropriate pattern for async operations
 * that aren't data fetching (where useQuery would be more appropriate).
 */
export function usePivotTableData({
    enabled,
    rows,
    pivotDetails,
    columnOrder,
    getField,
    getFieldLabel,
}: UsePivotTableDataArgs): PivotTableDataState {
    const worker = useWorker(createWorker);
    const [state, setState] = useState<PivotTableDataState>({
        isLoading: false,
        data: undefined,
        error: undefined,
    });

    // Track the current request to handle race conditions
    const requestIdRef = useRef(0);

    // Memoize the worker input to avoid unnecessary recalculations
    const workerInput = useMemo(() => {
        if (!enabled || !pivotDetails || rows.length === 0) {
            return null;
        }
        return {
            rows,
            pivotDetails,
            pivotConfig: {
                metricsAsRows: false,
                columnTotals: false,
                rowTotals: false,
                hiddenMetricFieldIds: [] as string[],
                columnOrder,
            },
            getField,
            getFieldLabel,
            groupedSubtotals: undefined,
        };
    }, [enabled, rows, pivotDetails, columnOrder, getField, getFieldLabel]);

    useEffect(() => {
        // Reset state when inputs become invalid
        if (!workerInput) {
            setState({
                isLoading: false,
                data: undefined,
                error: undefined,
            });
            return;
        }

        // Increment request ID to track this specific request
        const currentRequestId = ++requestIdRef.current;

        setState((prev) => ({
            ...prev,
            isLoading: true,
            error: undefined,
        }));

        worker
            .convertSqlPivotedRowsToPivotData(workerInput)
            .then((data) => {
                // Only update state if this is still the current request
                if (currentRequestId === requestIdRef.current) {
                    setState({
                        isLoading: false,
                        data,
                        error: undefined,
                    });
                }
            })
            .catch((e) => {
                // Only update state if this is still the current request
                if (currentRequestId === requestIdRef.current) {
                    setState({
                        isLoading: false,
                        data: undefined,
                        error: e instanceof Error ? e : new Error(String(e)),
                    });
                }
            });
    }, [worker, workerInput]);

    return state;
}
