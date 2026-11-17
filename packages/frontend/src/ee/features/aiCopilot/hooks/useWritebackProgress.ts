import { useEffect, useRef, useState } from 'react';
import {
    formatElapsed,
    getWritebackStepIndex,
    initialStepTimes,
    recordStepTimes,
    WRITEBACK_STEPS,
    type StepTimes,
} from '../components/ChatElements/ToolCalls/writebackProgress';
import { useWritebackRunStatus } from './useWritebackRunStatus';

/** How long ago `startedAt` was, ticking each second; null without a start. */
export const useElapsed = (startedAt: string | null): string | null => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!startedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [startedAt]);
    return startedAt
        ? formatElapsed(now - new Date(startedAt).getTime())
        : null;
};

export type WritebackProgress = {
    /** The step it is on, or was on when it ended. */
    step: number;
    /** `done` opened or updated the pull request; `stopped` failed or was cancelled. */
    state: 'running' | 'done' | 'stopped';
};

/** The step a background dbt change is on, read from its run. */
export const useWritebackProgress = (
    projectUuid: string,
    aiWritebackRunUuid: string | null,
): WritebackProgress => {
    const { data } = useWritebackRunStatus(projectUuid, aiWritebackRunUuid);
    // An ended run no longer says which step it was on, so the last one seen is kept.
    const lastStep = useRef(0);
    const step = data ? getWritebackStepIndex(data.status) : 0;
    if (step !== null) lastStep.current = step;
    if (!data || step !== null) return { step: step ?? 0, state: 'running' };
    return data.status === 'ready'
        ? { step: WRITEBACK_STEPS.length, state: 'done' }
        : { step: lastStep.current, state: 'stopped' };
};

/** When each step of a run was seen to start, for the times shown beside finished steps. */
export const useStepTimes = (
    { step, state }: WritebackProgress,
    runStartedAt: string | null,
): StepTimes => {
    const [times, setTimes] = useState(() => initialStepTimes(runStartedAt));
    useEffect(() => {
        setTimes((previous) =>
            recordStepTimes(previous, { step, state }, Date.now()),
        );
    }, [step, state]);
    return times;
};
