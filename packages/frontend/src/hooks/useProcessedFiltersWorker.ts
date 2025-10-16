import { useEffect, useMemo, useRef, useState } from 'react';
import type {
    FiltersWorkerInput,
    FiltersWorkerOutput,
} from '../workers/filtersWorker';
import { filtersWorkerManager } from '../workers/filtersWorkerManager';

type WorkerRequest = {
    type: 'process';
    reqId: number;
    payload: FiltersWorkerInput;
};

type WorkerResponse =
    | {
          type: 'result';
          reqId: number;
          processed: FiltersWorkerOutput;
      }
    | {
          type: 'error';
          reqId: number;
          message: string;
      };

/**
 * Hook to process filters in a Web Worker with race protection
 * Uses singleton worker manager for eager initialization
 * @param input - Filter processing input
 * @param enabled - Whether to process (default true for pre-warming)
 * @returns Processed filters and loading state
 */
export function useProcessedFiltersWorker(
    input: FiltersWorkerInput,
    enabled = true,
) {
    const [result, setResult] = useState<FiltersWorkerOutput | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const currentReqIdRef = useRef(0);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Process filters whenever input changes
    useEffect(() => {
        const worker = filtersWorkerManager.getWorker();
        if (!enabled || !worker) return;

        const currentReqId = filtersWorkerManager.getNextReqId();
        currentReqIdRef.current = currentReqId;

        setIsProcessing(true);

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set timeout for worker response
        timeoutRef.current = setTimeout(() => {
            console.warn('[FiltersWorkerHook] Timeout - no response after 5s');
            setIsProcessing(false);
        }, 5000);

        const handleMessage = (e: MessageEvent<WorkerResponse>) => {
            const response = e.data;

            // Ignore stale responses
            if (response.reqId !== currentReqId) {
                console.log(
                    '[FiltersWorkerHook] Ignoring stale response:',
                    response.reqId,
                    'current:',
                    currentReqId,
                );
                return;
            }

            // Clear timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            if (response.type === 'result') {
                console.log(
                    '[FiltersWorkerHook] Received result for reqId:',
                    response.reqId,
                );
                setResult(response.processed);
                setIsProcessing(false);
            } else if (response.type === 'error') {
                console.error(
                    '[FiltersWorkerHook] Worker error:',
                    response.message,
                );
                setIsProcessing(false);
            }
        };

        worker.addEventListener('message', handleMessage);

        const request: WorkerRequest = {
            type: 'process',
            reqId: currentReqId,
            payload: input,
        };

        console.log('[FiltersWorkerHook] Sending request:', currentReqId);
        worker.postMessage(request);

        return () => {
            worker.removeEventListener('message', handleMessage);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [input, enabled]);

    return useMemo(
        () => ({
            processedFilters: result,
            isProcessing,
        }),
        [result, isProcessing],
    );
}
