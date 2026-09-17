import { assertUnreachable } from '@lightdash/common';

/** What is known about the data app thread a coding agent turn runs in. */
export type CodingAgentThreadState = {
    // The sandbox, and with it the agent transcript on disk, survived from
    // the previous turn.
    sandboxWasResumed: boolean;
    // An earlier version in the thread ran the coding agent, so the transcript
    // on disk belongs to this thread and not to a cleared one.
    threadHasVersionThatReachedAgent: boolean;
    // Session id stored on the thread; null until a turn records one.
    codingAgentSessionId: string | null;
};

/** How the CLI turn is started. */
export type CodingAgentSessionStart = { kind: 'continue' } | { kind: 'new' };

export const decideCodingAgentSessionStart = (
    state: CodingAgentThreadState,
): CodingAgentSessionStart =>
    state.sandboxWasResumed && state.threadHasVersionThatReachedAgent
        ? { kind: 'continue' }
        : { kind: 'new' };

/** Session flags for `claude <flags> ...` in print mode. */
export const codingAgentSessionFlags = (
    start: CodingAgentSessionStart,
): string => {
    switch (start.kind) {
        case 'continue':
            return '--continue -p';
        case 'new':
            return '-p';
        default:
            return assertUnreachable(
                start,
                'Unknown coding agent session start',
            );
    }
};
