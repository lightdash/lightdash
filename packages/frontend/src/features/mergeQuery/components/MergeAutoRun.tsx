import { useEffect, useRef, type FC } from 'react';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';

/**
 * Runs a restored merge once, headlessly.
 *
 * A merge that arrived with the chart has to run itself: without this a saved
 * merged chart opens showing only the primary source's results — the wrong numbers, presented
 * as the chart that was saved. It lives in the main column rather than the
 * sidebar because the saved-chart view opens with the sidebar closed.
 *
 * A restored merge the rules refuse cannot run itself. Saying so is what lets
 * the chart and results stop waiting for a run that will never start.
 */
export const MergeAutoRun: FC = () => {
    const merge = useMergeSafe();
    const { canRun, handleRun, mergeQuery, setupStep, joinKeyErrors, fanOut } =
        useMergeSetup();
    const wasRestored = merge?.wasRestored ?? false;
    const isRunning = merge?.isRunning ?? false;
    const mergeResults = merge?.mergeResults ?? null;
    const refuseRestoredRun = merge?.refuseRestoredRun;
    // Only a built merge can be refused; an incomplete one is still hydrating.
    const isRefused =
        mergeQuery !== null &&
        setupStep === null &&
        (joinKeyErrors.length > 0 || fanOut.length > 0);

    const hasAutoRun = useRef(false);
    useEffect(() => {
        if (!wasRestored || hasAutoRun.current || isRunning) return;
        if (mergeResults) return;
        if (isRefused) {
            refuseRestoredRun?.();
            return;
        }
        if (!canRun) return;
        hasAutoRun.current = true;
        handleRun();
    }, [
        wasRestored,
        canRun,
        isRunning,
        mergeResults,
        handleRun,
        isRefused,
        refuseRestoredRun,
    ]);

    return null;
};
