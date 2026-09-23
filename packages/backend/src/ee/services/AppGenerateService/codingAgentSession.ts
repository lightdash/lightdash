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

export type CodingAgentSessionInit = {
    sessionId: string;
    // Null on CLIs that predate `claude_code_version` in the init event.
    cliVersion: string | null;
};

// The `system` stream-json event with the given subtype; null otherwise.
const parseCodingAgentSystemEvent = (
    line: string,
    subtype: string,
): Record<string, unknown> | null => {
    let event: unknown;
    try {
        event = JSON.parse(line);
    } catch {
        return null;
    }
    if (event === null || typeof event !== 'object') return null;
    const record = event as Record<string, unknown>;
    return record.type === 'system' && record.subtype === subtype
        ? record
        : null;
};

// Session id + CLI version from the `system`/`init` line; null otherwise.
export const parseCodingAgentSessionInit = (
    line: string,
): CodingAgentSessionInit | null => {
    const event = parseCodingAgentSystemEvent(line, 'init');
    if (event === null) return null;
    const sessionId = event.session_id;
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
        return null;
    }
    const version = event.claude_code_version;
    return {
        sessionId,
        cliVersion:
            typeof version === 'string' && version.length > 0 ? version : null,
    };
};

// First init event in a stream-json stdout; null when none was seen.
export const findCodingAgentSessionInit = (
    stdout: string,
): CodingAgentSessionInit | null => {
    for (const line of stdout.split('\n')) {
        const init = parseCodingAgentSessionInit(line);
        if (init !== null) return init;
    }
    return null;
};

export const findCodingAgentSessionId = (stdout: string): string | null =>
    findCodingAgentSessionInit(stdout)?.sessionId ?? null;

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

// Persisted on the version, so a retry can tell an earlier attempt already compacted.
export const CODING_AGENT_COMPACTION_NARRATION = 'Catching up on earlier work';

export const versionCompactedCodingAgentSession = (
    statusHistory: ReadonlyArray<{ kind: string; message: string }>,
): boolean =>
    statusHistory.some(
        (entry) =>
            entry.kind === 'stage' &&
            entry.message === CODING_AGENT_COMPACTION_NARRATION,
    );

// Context regrows ~10k tokens per version after a summary, so a thread
// compacts about every ten versions once it first crosses this.
export const CODING_AGENT_COMPACTION_TOKEN_THRESHOLD = 200_000;

/** What the trigger decision for a coding agent turn is made from. */
export type CodingAgentCompactionInput = {
    start: CodingAgentSessionStart;
    // Total input tokens per internal turn on the thread's previous version;
    // null when there is none or its usage was never recorded.
    contextTokensPerTurn: number | null;
    thresholdTokens: number;
};

// Whether a turn should summarize its own history before it runs: only a
// resumed session, only above the size floor. Warm or cold: cache reads
// on a big transcript cost more over a thread than one summary does.
export const shouldCompactCodingAgentSession = ({
    start,
    contextTokensPerTurn,
    thresholdTokens,
}: CodingAgentCompactionInput): boolean =>
    start.kind === 'resume' &&
    contextTokensPerTurn !== null &&
    contextTokensPerTurn >= thresholdTokens;

// Null when unknown, which must never trigger compaction.
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
    const event = parseCodingAgentSystemEvent(line, 'status');
    if (event === null) return null;
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

// Null when the run never reported a `compact_result` status event.
export const findCodingAgentCompactionOutcome = (
    stdout: string,
): CodingAgentCompactionOutcome | null => {
    for (const line of stdout.split('\n')) {
        const outcome = parseCodingAgentCompactionStatus(line);
        if (outcome !== null) return outcome;
    }
    return null;
};
