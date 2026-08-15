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
 */
export const MergeAutoRun: FC = () => {
    const merge = useMergeSafe();
    const { canRun, handleRun } = useMergeSetup();
    const wasRestored = merge?.wasRestored ?? false;
    const isRunning = merge?.isRunning ?? false;
    const mergeResults = merge?.mergeResults ?? null;

    const hasAutoRun = useRef(false);
    useEffect(() => {
        if (!wasRestored || hasAutoRun.current || isRunning) return;
        if (!canRun || mergeResults) return;
        hasAutoRun.current = true;
        handleRun();
    }, [wasRestored, canRun, isRunning, mergeResults, handleRun]);

    return null;
};
