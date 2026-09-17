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
export type CodingAgentSessionStart =
    | { kind: 'resume'; sessionId: string }
    | { kind: 'continue' }
    | { kind: 'new' };

export const decideCodingAgentSessionStart = (
    state: CodingAgentThreadState,
): CodingAgentSessionStart => {
    if (state.codingAgentSessionId !== null) {
        return { kind: 'resume', sessionId: state.codingAgentSessionId };
    }
    return state.sandboxWasResumed && state.threadHasVersionThatReachedAgent
        ? { kind: 'continue' }
        : { kind: 'new' };
};

/** Where a turn reports what it learned about the thread's session. */
export type CodingAgentSessionHooks = {
    // The turn's init event when the turn did not resume a stored id;
    // `replacing` names the stored id when that id was just found lost.
    onSessionStarted: (
        sessionId: string,
        replacing: string | null,
    ) => Promise<void>;
    onSessionLost: (sessionId: string) => void;
};

/** Session flags for `claude <flags> ...` in print mode. */
export const codingAgentSessionFlags = (
    start: CodingAgentSessionStart,
): string => {
    switch (start.kind) {
        case 'resume':
            return `--resume ${start.sessionId} -p`;
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

// Session ids are spliced into a shell command, so only accept the CLI's
// uuid-like shape.
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

// Session id from the CLI's `system`/`init` stream-json line; null otherwise.
export const parseCodingAgentSessionInit = (line: string): string | null => {
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(line);
    } catch {
        return null;
    }
    if (event === null || typeof event !== 'object') return null;
    if (event.type !== 'system' || event.subtype !== 'init') return null;
    const sessionId = event.session_id;
    return typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId)
        ? sessionId
        : null;
};

// The CLI's message when `--resume <id>` names a session it cannot find. It
// appears on stderr and in the final result event's `errors` list.
const SESSION_LOST_SIGNAL = 'No conversation found with session ID';

// A resumed turn failed because the sandbox no longer has that session.
export const isCodingAgentSessionLostFailure = (
    start: CodingAgentSessionStart,
    output: { stderr: string; stdout: string },
): boolean =>
    start.kind === 'resume' &&
    `${output.stderr}\n${output.stdout}`.includes(SESSION_LOST_SIGNAL);

// How a retried attempt starts: resume a learned id, else continue a
// transcript any stream event proved exists, else the original start.
export const codingAgentRetryStart = (args: {
    start: CodingAgentSessionStart;
    learnedSessionId: string | null;
    sawStreamEvent: boolean;
}): CodingAgentSessionStart => {
    if (args.learnedSessionId !== null) {
        return { kind: 'resume', sessionId: args.learnedSessionId };
    }
    if (args.sawStreamEvent && args.start.kind === 'new') {
        return { kind: 'continue' };
    }
    return args.start;
};
