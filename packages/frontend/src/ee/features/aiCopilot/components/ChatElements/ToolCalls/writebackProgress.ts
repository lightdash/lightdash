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
