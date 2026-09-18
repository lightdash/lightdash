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

// This version's own turn left stream evidence, so its transcript is on disk.
export const versionReachedCodingAgent = (
    statusHistory: ReadonlyArray<{ kind: string }>,
): boolean =>
    statusHistory.some(
        (entry) => entry.kind === 'thinking' || entry.kind === 'tool',
    );

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

// First session id in a stream-json stdout; null when no init line was seen.
export const findCodingAgentSessionId = (stdout: string): string | null => {
    for (const line of stdout.split('\n')) {
        const sessionId = parseCodingAgentSessionInit(line);
        if (sessionId !== null) return sessionId;
    }
    return null;
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

/**
 * Estimated context per internal turn at or above which summarizing the
 * session pays for itself. A constant, not configuration: savings are almost
 * flat across thresholds, so this is chosen for how few builds it touches
 * (~6.5%) rather than for money.
 */
export const CODING_AGENT_COMPACTION_TOKEN_THRESHOLD = 200_000;

/**
 * How long after a thread's previous version finished its prompt cache is
 * assumed cold. On a cold cache the whole transcript is re-read anyway, so
 * summarizing it costs only the summary.
 */
export const CODING_AGENT_COLD_CACHE_MS = 60 * 60 * 1000;

/** What the trigger decision for a coding agent turn is made from. */
export type CodingAgentCompactionInput = {
    start: CodingAgentSessionStart;
    // Since the thread's previous version reached a terminal status; null when
    // there is no previous version or it carries no timestamp.
    msSincePreviousVersion: number | null;
    // Total input tokens per internal turn on that previous version; null when
    // its usage was never recorded.
    contextTokensPerTurn: number | null;
    thresholdTokens: number;
};

/**
 * Whether a turn should summarize its own history before it runs. Only a turn
 * that resumes a stored session has a transcript worth summarizing; a cold
 * cache makes the summary nearly free, and the size floor keeps us from
 * spending one to save nothing.
 */
export const shouldCompactCodingAgentSession = ({
    start,
    msSincePreviousVersion,
    contextTokensPerTurn,
    thresholdTokens,
}: CodingAgentCompactionInput): boolean =>
    start.kind === 'resume' &&
    msSincePreviousVersion !== null &&
    msSincePreviousVersion > CODING_AGENT_COLD_CACHE_MS &&
    contextTokensPerTurn !== null &&
    contextTokensPerTurn >= thresholdTokens;

/**
 * Context the model read per internal turn on a previous version: everything
 * that entered the context window (uncached, cache reads, cache writes) over
 * the turns that read it. Null when the version's usage was never recorded or
 * it ran no turns — an unknown estimate must not trigger compaction.
 */
export const codingAgentContextTokensPerTurn = (
    usage: {
        inputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
        numTurns: number;
    } | null,
): number | null => {
    if (usage === null || usage.numTurns <= 0) return null;
    const totalInputTokens =
        usage.inputTokens +
        usage.cacheReadInputTokens +
        usage.cacheCreationInputTokens;
    return totalInputTokens / usage.numTurns;
};

/** What the CLI reported about a `/compact` run. */
export type CodingAgentCompactionOutcome =
    | { result: 'success' }
    | { result: 'failed'; error: string | null };

// Compaction verdict from one CLI status line; null when the line is not one.
const parseCodingAgentCompactionStatus = (
    line: string,
): CodingAgentCompactionOutcome | null => {
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(line);
    } catch {
        return null;
    }
    if (event === null || typeof event !== 'object') return null;
    if (event.type !== 'system' || event.subtype !== 'status') return null;
    if (event.compact_result === 'success') return { result: 'success' };
    if (event.compact_result === 'failed') {
        return {
            result: 'failed',
            // `compact_error` is only emitted on some CLI builds.
            error:
                typeof event.compact_error === 'string'
                    ? event.compact_error
                    : null,
        };
    }
    return null;
};

/**
 * Outcome from the CLI's compaction status event
 * (`{"type":"system","subtype":"status","compact_result":"success"|"failed"}`).
 * Null when the stream carried no such event — the run never got as far as
 * compacting, which the caller treats the same as a failure.
 */
export const findCodingAgentCompactionOutcome = (
    stdout: string,
): CodingAgentCompactionOutcome | null => {
    for (const line of stdout.split('\n')) {
        const outcome = parseCodingAgentCompactionStatus(line);
        if (outcome !== null) return outcome;
    }
    return null;
};
