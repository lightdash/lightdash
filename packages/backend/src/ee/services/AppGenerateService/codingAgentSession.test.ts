import { describe, expect, it } from 'vitest';
import {
    CODING_AGENT_COMPACTION_NARRATION,
    codingAgentContextTokensPerTurn,
    codingAgentRetryStart,
    codingAgentSessionFlags,
    codingAgentSessionUsageDelta,
    CodingAgentSessionUsageLedger,
    decideCodingAgentSessionStart,
    findCodingAgentCompactionOutcome,
    findCodingAgentSessionId,
    isCodingAgentSessionLostFailure,
    parseCodingAgentSessionInit,
    shouldCompactCodingAgentSession,
    versionCompactedCodingAgentSession,
    versionReachedCodingAgent,
    type CodingAgentCompactionInput,
    type CodingAgentSessionStart,
    type CodingAgentSessionUsageSnapshot,
    type CodingAgentThreadState,
} from './codingAgentSession';

// What the CLI reports on the second run of a session: this run's own token
// counts and turns, but cost, API time and per-model tokens since the
// session began.
const SECOND_RUN_RESULT = {
    inputTokens: 40,
    outputTokens: 2_000,
    cacheReadInputTokens: 300_000,
    cacheCreationInputTokens: 9_000,
    cacheCreation1hInputTokens: 9_000,
    cacheCreation5mInputTokens: 0,
    numTurns: 3,
    durationApiMs: 133_000,
    costUsd: 0.65,
    modelUsage: {
        'claude-sonnet-5': {
            inputTokens: 60,
            outputTokens: 12_000,
            cacheReadInputTokens: 1_550_000,
            cacheCreationInputTokens: 60_000,
        },
    },
};

const AFTER_FIRST_RUN: CodingAgentSessionUsageSnapshot = {
    sessionId: 'session-1',
    costUsd: 0.56,
    durationApiMs: 117_000,
    modelUsage: {
        'claude-sonnet-5': {
            inputTokens: 20,
            outputTokens: 10_000,
            cacheReadInputTokens: 1_250_000,
            cacheCreationInputTokens: 51_000,
        },
    },
};

describe('decideCodingAgentSessionStart', () => {
    it.each<[string, CodingAgentThreadState, CodingAgentSessionStart]>([
        [
            'stored session id: resume it',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: true,
                codingAgentSessionId: 'session-1',
            },
            { kind: 'resume', sessionId: 'session-1' },
        ],
        [
            'stored session id on a fresh sandbox: still resume, the runner falls back if it is gone',
            {
                sandboxWasResumed: false,
                threadHasVersionThatReachedAgent: true,
                codingAgentSessionId: 'session-1',
            },
            { kind: 'resume', sessionId: 'session-1' },
        ],
        [
            'stored session id but no version reached the agent (first build failed after init): resume',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: false,
                codingAgentSessionId: 'session-1',
            },
            { kind: 'resume', sessionId: 'session-1' },
        ],
        [
            'no id, resumed sandbox, thread already ran the agent (backfilled thread 1): continue',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: true,
                codingAgentSessionId: null,
            },
            { kind: 'continue' },
        ],
        [
            'no id, resumed sandbox, freshly cleared thread: new',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: false,
                codingAgentSessionId: null,
            },
            { kind: 'new' },
        ],
        [
            'no id, fresh sandbox, thread already ran the agent: new',
            {
                sandboxWasResumed: false,
                threadHasVersionThatReachedAgent: true,
                codingAgentSessionId: null,
            },
            { kind: 'new' },
        ],
        [
            'no id, fresh sandbox, fresh thread: new',
            {
                sandboxWasResumed: false,
                threadHasVersionThatReachedAgent: false,
                codingAgentSessionId: null,
            },
            { kind: 'new' },
        ],
    ])('%s', (_name, state, expected) => {
        expect(decideCodingAgentSessionStart(state)).toEqual(expected);
    });
});

describe('codingAgentSessionFlags', () => {
    it('resumes a session by id', () => {
        expect(
            codingAgentSessionFlags({
                kind: 'resume',
                sessionId: 'f228a01a-fef5-4872-a344-1d875e934fcf',
            }),
        ).toBe('--resume f228a01a-fef5-4872-a344-1d875e934fcf -p');
    });

    it('continues the transcript on disk', () => {
        expect(codingAgentSessionFlags({ kind: 'continue' })).toBe(
            '--continue -p',
        );
    });

    it('starts a new session', () => {
        expect(codingAgentSessionFlags({ kind: 'new' })).toBe('-p');
    });
});

describe('parseCodingAgentSessionInit', () => {
    // Condensed from real CLI stream-json output.
    const initLine =
        '{"type":"system","subtype":"init","cwd":"/app","session_id":"f228a01a-fef5-4872-a344-1d875e934fcf","tools":["Read","Write"],"model":"claude-sonnet-4-5"}';

    it('returns the session id of the init event', () => {
        expect(parseCodingAgentSessionInit(initLine)).toEqual({
            sessionId: 'f228a01a-fef5-4872-a344-1d875e934fcf',
            cliVersion: null,
        });
    });

    it('returns the CLI version when the init event carries one', () => {
        expect(
            parseCodingAgentSessionInit(
                '{"type":"system","subtype":"init","session_id":"f228a01a-fef5-4872-a344-1d875e934fcf","claude_code_version":"2.1.272"}',
            ),
        ).toEqual({
            sessionId: 'f228a01a-fef5-4872-a344-1d875e934fcf',
            cliVersion: '2.1.272',
        });
    });

    it('treats an empty CLI version as absent', () => {
        expect(
            parseCodingAgentSessionInit(
                '{"type":"system","subtype":"init","session_id":"f228a01a-fef5-4872-a344-1d875e934fcf","claude_code_version":""}',
            ),
        ).toEqual({
            sessionId: 'f228a01a-fef5-4872-a344-1d875e934fcf',
            cliVersion: null,
        });
    });

    it.each<[string, string]>([
        [
            'a hook event that also carries a session id',
            '{"type":"system","subtype":"hook_started","hook_name":"SessionStart:startup","session_id":"f228a01a-fef5-4872-a344-1d875e934fcf"}',
        ],
        [
            'a status event',
            '{"type":"system","subtype":"status","status":null,"session_id":"f228a01a-fef5-4872-a344-1d875e934fcf"}',
        ],
        [
            'the result event',
            '{"type":"result","subtype":"success","is_error":false,"session_id":"f228a01a-fef5-4872-a344-1d875e934fcf"}',
        ],
        [
            'an assistant message',
            '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]},"session_id":"f228a01a-fef5-4872-a344-1d875e934fcf"}',
        ],
        [
            'an init event without a session id',
            '{"type":"system","subtype":"init","cwd":"/app"}',
        ],
        [
            'an init event whose session id is not a plain token',
            '{"type":"system","subtype":"init","session_id":"abc; rm -rf /"}',
        ],
        ['a non-JSON line', 'Loading…'],
        ['a JSON scalar', '"init"'],
        ['a JSON null', 'null'],
    ])('returns null for %s', (_name, line) => {
        expect(parseCodingAgentSessionInit(line)).toBeNull();
    });
});

describe('versionReachedCodingAgent', () => {
    it('is true once the version logged a thinking or tool entry', () => {
        expect(
            versionReachedCodingAgent([
                { kind: 'stage' },
                { kind: 'thinking' },
            ]),
        ).toBe(true);
        expect(versionReachedCodingAgent([{ kind: 'tool' }])).toBe(true);
    });

    it('is false for stage entries alone', () => {
        expect(
            versionReachedCodingAgent([{ kind: 'stage' }, { kind: 'stage' }]),
        ).toBe(false);
        expect(versionReachedCodingAgent([])).toBe(false);
    });
});

describe('findCodingAgentSessionId', () => {
    it('returns the init event session id from a stream-json stdout', () => {
        const stdout = [
            '{"type":"system","subtype":"hook_started","session_id":"aaaa"}',
            '{"type":"system","subtype":"init","cwd":"/app","session_id":"f228a01a-fef5-4872-a344-1d875e934fcf"}',
            '{"type":"result","subtype":"success","session_id":"f228a01a-fef5-4872-a344-1d875e934fcf"}',
        ].join('\n');
        expect(findCodingAgentSessionId(stdout)).toBe(
            'f228a01a-fef5-4872-a344-1d875e934fcf',
        );
    });

    it('is null without an init event', () => {
        expect(findCodingAgentSessionId('plain text\n{"type":"result"}')).toBe(
            null,
        );
    });
});

describe('isCodingAgentSessionLostFailure', () => {
    const resume: CodingAgentSessionStart = {
        kind: 'resume',
        sessionId: '00000000-0000-0000-0000-000000000000',
    };
    // Real CLI output for `claude --resume <unknown id> -p` (exit 1): the
    // message is on stderr and in the result event's `errors`.
    const lostStderr =
        'No conversation found with session ID: 00000000-0000-0000-0000-000000000000\n';
    const lostStdout =
        '{"type":"result","subtype":"error_during_execution","is_error":true,"num_turns":0,"session_id":"00000000-0000-0000-0000-000000000000","errors":["No conversation found with session ID: 00000000-0000-0000-0000-000000000000"]}\n';

    it('recognises the CLI refusing an unknown session on stderr', () => {
        expect(
            isCodingAgentSessionLostFailure(resume, {
                stderr: lostStderr,
                stdout: '',
            }),
        ).toBe(true);
    });

    it('recognises the CLI refusing an unknown session in the result event only', () => {
        expect(
            isCodingAgentSessionLostFailure(resume, {
                stderr: '',
                stdout: lostStdout,
            }),
        ).toBe(true);
    });

    it('is false for a resumed turn that failed for another reason', () => {
        expect(
            isCodingAgentSessionLostFailure(resume, {
                stderr: 'ThrottlingException: Too many requests',
                stdout: '{"type":"result","is_error":true,"api_error_status":429,"result":"API Error: 429"}',
            }),
        ).toBe(false);
    });

    it.each<CodingAgentSessionStart>([{ kind: 'new' }, { kind: 'continue' }])(
        'is false when the turn did not resume a session ($kind)',
        (start) => {
            expect(
                isCodingAgentSessionLostFailure(start, {
                    stderr: lostStderr,
                    stdout: lostStdout,
                }),
            ).toBe(false);
        },
    );
});

describe('codingAgentRetryStart', () => {
    it('resumes the session learned from the failed attempt', () => {
        expect(
            codingAgentRetryStart({
                start: { kind: 'new' },
                learnedSessionId: 'session-2',
                sawStreamEvent: true,
            }),
        ).toEqual({ kind: 'resume', sessionId: 'session-2' });
    });

    it('continues the transcript when the failed attempt streamed but no id was learned', () => {
        expect(
            codingAgentRetryStart({
                start: { kind: 'new' },
                learnedSessionId: null,
                sawStreamEvent: true,
            }),
        ).toEqual({ kind: 'continue' });
    });

    it('keeps a new start when the CLI died before streaming anything', () => {
        expect(
            codingAgentRetryStart({
                start: { kind: 'new' },
                learnedSessionId: null,
                sawStreamEvent: false,
            }),
        ).toEqual({ kind: 'new' });
    });

    it('keeps resuming the same session when the resumed attempt streamed', () => {
        expect(
            codingAgentRetryStart({
                start: { kind: 'resume', sessionId: 'session-1' },
                learnedSessionId: null,
                sawStreamEvent: true,
            }),
        ).toEqual({ kind: 'resume', sessionId: 'session-1' });
    });

    it('keeps continuing when a continued attempt streamed', () => {
        expect(
            codingAgentRetryStart({
                start: { kind: 'continue' },
                learnedSessionId: null,
                sawStreamEvent: true,
            }),
        ).toEqual({ kind: 'continue' });
    });
});

describe('shouldCompactCodingAgentSession', () => {
    const RESUME: CodingAgentSessionStart = {
        kind: 'resume',
        sessionId: 'session-1',
    };
    const decide = (over: Partial<CodingAgentCompactionInput>) =>
        shouldCompactCodingAgentSession({
            start: RESUME,
            contextTokensPerTurn: 250_000,
            thresholdTokens: 200_000,
            ...over,
        });

    it('compacts a big session it picks up', () => {
        expect(decide({})).toBe(true);
    });

    it('does not compact a small session', () => {
        expect(decide({ contextTokensPerTurn: 40_000 })).toBe(false);
    });

    it('treats exactly the threshold as big enough', () => {
        expect(decide({ contextTokensPerTurn: 200_000 })).toBe(true);
        expect(decide({ contextTokensPerTurn: 199_999 })).toBe(false);
    });

    it('does not compact when the previous version recorded no usage', () => {
        expect(decide({ contextTokensPerTurn: null })).toBe(false);
    });

    it.each<[string, CodingAgentSessionStart]>([
        ['a new session', { kind: 'new' }],
        ['a continued session', { kind: 'continue' }],
    ])('does not compact %s', (_name, start) => {
        expect(decide({ start })).toBe(false);
    });
});

describe('codingAgentContextTokensPerTurn', () => {
    it('counts everything that entered the context window, per turn', () => {
        expect(
            codingAgentContextTokensPerTurn({
                inputTokens: 1_000,
                cacheReadInputTokens: 300_000,
                cacheCreationInputTokens: 99_000,
                numTurns: 4,
            }),
        ).toBe(100_000);
    });

    it('is unknown when the version recorded no usage', () => {
        expect(codingAgentContextTokensPerTurn(null)).toBeNull();
    });

    it('is unknown when the version ran no turns', () => {
        expect(
            codingAgentContextTokensPerTurn({
                inputTokens: 10,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
                numTurns: 0,
            }),
        ).toBeNull();
    });
});

describe('findCodingAgentCompactionOutcome', () => {
    const statusLine = (fields: Record<string, unknown>) =>
        JSON.stringify({
            type: 'system',
            subtype: 'status',
            session_id: 'session-1',
            ...fields,
        });

    it('reads a successful compaction', () => {
        const stdout = [
            statusLine({ status: 'compacting' }),
            statusLine({ status: null, compact_result: 'success' }),
        ].join('\n');
        expect(findCodingAgentCompactionOutcome(stdout)).toEqual({
            result: 'success',
        });
    });

    it('reads a failure with the reason the CLI gave', () => {
        const stdout = [
            statusLine({ status: 'compacting' }),
            statusLine({
                status: null,
                compact_result: 'failed',
                compact_error: 'Not enough messages to compact.',
            }),
        ].join('\n');
        expect(findCodingAgentCompactionOutcome(stdout)).toEqual({
            result: 'failed',
            error: 'Not enough messages to compact.',
        });
    });

    it('reads a failure that came with no reason', () => {
        expect(
            findCodingAgentCompactionOutcome(
                statusLine({ status: null, compact_result: 'failed' }),
            ),
        ).toEqual({ result: 'failed', error: null });
    });

    it('is unknown when the run never reported a verdict', () => {
        const stdout = [
            '',
            'not json',
            JSON.stringify({ type: 'system', subtype: 'init' }),
            statusLine({ status: 'compacting' }),
        ].join('\n');
        expect(findCodingAgentCompactionOutcome(stdout)).toBeNull();
    });
});

describe('versionCompactedCodingAgentSession', () => {
    const entry = (kind: string, message: string) => ({
        kind,
        message,
        timestamp: '2026-09-18T00:00:00.000Z',
    });

    it('recognises a version an earlier attempt already summarized', () => {
        expect(
            versionCompactedCodingAgentSession([
                entry('stage', 'Loading your data models'),
                entry('stage', CODING_AGENT_COMPACTION_NARRATION),
                entry('thinking', 'Reading the chart code'),
            ]),
        ).toBe(true);
    });

    it('does not mistake the agent quoting the narration for the stage', () => {
        expect(
            versionCompactedCodingAgentSession([
                entry('thinking', CODING_AGENT_COMPACTION_NARRATION),
            ]),
        ).toBe(false);
    });

    it('is false for a version that never compacted', () => {
        expect(
            versionCompactedCodingAgentSession([
                entry('stage', 'Loading your data models'),
            ]),
        ).toBe(false);
    });
});

describe('codingAgentSessionUsageDelta', () => {
    it('takes the first run of a session as reported', () => {
        const { usage, snapshot } = codingAgentSessionUsageDelta({
            sessionId: 'session-1',
            result: SECOND_RUN_RESULT,
            previous: null,
        });

        expect(usage).toEqual(SECOND_RUN_RESULT);
        expect(snapshot).toEqual({
            sessionId: 'session-1',
            costUsd: 0.65,
            durationApiMs: 133_000,
            modelUsage: SECOND_RUN_RESULT.modelUsage,
        });
    });

    it("keeps only the resumed run's share of the session totals", () => {
        const { usage, snapshot } = codingAgentSessionUsageDelta({
            sessionId: 'session-1',
            result: SECOND_RUN_RESULT,
            previous: AFTER_FIRST_RUN,
        });

        expect(usage.costUsd).toBeCloseTo(0.09);
        expect(usage.durationApiMs).toBe(16_000);
        expect(usage.modelUsage).toEqual({
            'claude-sonnet-5': {
                inputTokens: 40,
                outputTokens: 2_000,
                cacheReadInputTokens: 300_000,
                cacheCreationInputTokens: 9_000,
            },
        });
        // The token counts and turns on the result were already this run's.
        expect(usage.cacheReadInputTokens).toBe(300_000);
        expect(usage.outputTokens).toBe(2_000);
        expect(usage.numTurns).toBe(3);
        // The snapshot carries the CLI's totals, not the share.
        expect(snapshot.costUsd).toBe(0.65);
    });

    it('takes a run on a different session as reported', () => {
        const { usage } = codingAgentSessionUsageDelta({
            sessionId: 'session-2',
            result: SECOND_RUN_RESULT,
            previous: AFTER_FIRST_RUN,
        });

        expect(usage).toEqual(SECOND_RUN_RESULT);
    });

    it('takes a run whose totals fell below the snapshot as reported', () => {
        const { usage } = codingAgentSessionUsageDelta({
            sessionId: 'session-1',
            result: { ...SECOND_RUN_RESULT, costUsd: 0.1 },
            previous: AFTER_FIRST_RUN,
        });

        expect(usage.costUsd).toBe(0.1);
        expect(usage.durationApiMs).toBe(133_000);
    });

    it('drops a model the resumed run never called', () => {
        const { usage } = codingAgentSessionUsageDelta({
            sessionId: 'session-1',
            result: {
                ...SECOND_RUN_RESULT,
                modelUsage: {
                    ...AFTER_FIRST_RUN.modelUsage,
                    'claude-haiku-4-5': {
                        inputTokens: 5,
                        outputTokens: 50,
                        cacheReadInputTokens: 0,
                        cacheCreationInputTokens: 0,
                    },
                },
            },
            previous: AFTER_FIRST_RUN,
        });

        expect(usage.modelUsage).toEqual({
            'claude-haiku-4-5': {
                inputTokens: 5,
                outputTokens: 50,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
            },
        });
    });

    it('omits the per-model split when nothing is left of it', () => {
        const { usage } = codingAgentSessionUsageDelta({
            sessionId: 'session-1',
            result: {
                ...SECOND_RUN_RESULT,
                modelUsage: AFTER_FIRST_RUN.modelUsage ?? undefined,
            },
            previous: AFTER_FIRST_RUN,
        });

        expect(usage.modelUsage).toBeUndefined();
    });
});

describe('CodingAgentSessionUsageLedger', () => {
    it('charges each run its own share and persists the totals after every run', () => {
        const persisted: CodingAgentSessionUsageSnapshot[] = [];
        const ledger = new CodingAgentSessionUsageLedger(AFTER_FIRST_RUN, (s) =>
            persisted.push(s),
        );

        const second = ledger.record('session-1', SECOND_RUN_RESULT);
        const third = ledger.record('session-1', {
            ...SECOND_RUN_RESULT,
            costUsd: 1.79,
            durationApiMs: 344_000,
        });

        expect(second.costUsd).toBeCloseTo(0.09);
        expect(third.costUsd).toBeCloseTo(1.14);
        expect(third.durationApiMs).toBe(211_000);
        expect(persisted.map((s) => s.costUsd)).toEqual([0.65, 1.79]);
    });

    it('starts over when a thread has no snapshot yet', () => {
        const ledger = new CodingAgentSessionUsageLedger(null, () => {});

        expect(ledger.record('session-1', SECOND_RUN_RESULT).costUsd).toBe(
            0.65,
        );
    });
});
