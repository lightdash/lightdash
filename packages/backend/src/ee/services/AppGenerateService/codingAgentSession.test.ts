import { describe, expect, it } from 'vitest';
import {
    codingAgentRetryStart,
    codingAgentSessionFlags,
    decideCodingAgentSessionStart,
    findCodingAgentSessionId,
    isCodingAgentSessionLostFailure,
    parseCodingAgentSessionInit,
    versionReachedCodingAgent,
    type CodingAgentSessionStart,
    type CodingAgentThreadState,
} from './codingAgentSession';

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
        expect(parseCodingAgentSessionInit(initLine)).toBe(
            'f228a01a-fef5-4872-a344-1d875e934fcf',
        );
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
