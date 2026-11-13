import {
    assertUnreachable,
    type AiWritebackRunStatus,
} from '@lightdash/common';

/** What a person sees a background dbt change doing, in the order it happens. */
export const WRITEBACK_STEPS = [
    'Setting up',
    'Copying your project',
    'Making the change',
    'Opening the pull request',
] as const;

/** The step a run still going is on, counted from zero; null once it has ended. */
export const getWritebackStepIndex = (
    status: AiWritebackRunStatus,
): number | null => {
    switch (status) {
        case 'pending':
        case 'install':
        case 'sandbox':
            return 0;
        case 'clone':
            return 1;
        case 'agent':
            return 2;
        case 'commit':
        case 'push':
        case 'pull_request':
            return 3;
        case 'ready':
        case 'error':
        case 'cancelled':
            return null;
        default:
            return assertUnreachable(status, 'Unknown writeback run status');
    }
};

/** Elapsed time as m:ss. */
export const formatElapsed = (ms: number): string => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** A short duration: seconds under a minute, else minutes and seconds. */
export const formatDuration = (ms: number): string => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

/** When each step was seen to start, and when the run was seen to end. */
export type StepTimes = {
    startedAt: (number | null)[];
    endedAt: number | null;
    /** The step last seen; null before the first look. */
    seenStep: number | null;
};

export const initialStepTimes = (runStartedAt: string | null): StepTimes => ({
    startedAt: WRITEBACK_STEPS.map((_, index) =>
        index === 0 && runStartedAt ? new Date(runStartedAt).getTime() : null,
    ),
    endedAt: null,
    seenStep: null,
});

/**
 * Records a step change seen at `now`. A step already under way at the first
 * look keeps an unknown start, so no duration is made up for it.
 */
export const recordStepTimes = (
    times: StepTimes,
    { step, state }: { step: number; state: 'running' | 'done' | 'stopped' },
    now: number,
): StepTimes => {
    let next = times;
    if (times.seenStep === null) {
        next = { ...next, seenStep: step };
    } else if (step !== times.seenStep && step < WRITEBACK_STEPS.length) {
        const startedAt = [...next.startedAt];
        startedAt[step] = startedAt[step] ?? now;
        next = { ...next, startedAt, seenStep: step };
    }
    if (state !== 'running' && next.endedAt === null) {
        next = { ...next, endedAt: now };
    }
    return next;
};

/** How long a finished step took, when both its start and end were seen. */
export const stepDuration = (
    times: StepTimes,
    index: number,
): number | null => {
    const start = times.startedAt[index];
    const end = times.startedAt[index + 1] ?? times.endedAt;
    return start !== null && start !== undefined && end !== null
        ? end - start
        : null;
};
