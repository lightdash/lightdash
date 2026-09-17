import { describe, expect, it } from 'vitest';
import {
    codingAgentSessionFlags,
    decideCodingAgentSessionStart,
    type CodingAgentSessionStart,
    type CodingAgentThreadState,
} from './codingAgentSession';

describe('decideCodingAgentSessionStart', () => {
    it.each<[string, CodingAgentThreadState, CodingAgentSessionStart]>([
        [
            'resumed sandbox, thread already ran the agent: continue',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: true,
                codingAgentSessionId: null,
            },
            { kind: 'continue' },
        ],
        [
            'resumed sandbox, freshly cleared thread: new',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: false,
                codingAgentSessionId: null,
            },
            { kind: 'new' },
        ],
        [
            'fresh sandbox, thread already ran the agent: new',
            {
                sandboxWasResumed: false,
                threadHasVersionThatReachedAgent: true,
                codingAgentSessionId: null,
            },
            { kind: 'new' },
        ],
        [
            'fresh sandbox, fresh thread: new',
            {
                sandboxWasResumed: false,
                threadHasVersionThatReachedAgent: false,
                codingAgentSessionId: null,
            },
            { kind: 'new' },
        ],
        [
            'a stored session id does not change the decision yet',
            {
                sandboxWasResumed: true,
                threadHasVersionThatReachedAgent: false,
                codingAgentSessionId: 'session-1',
            },
            { kind: 'new' },
        ],
    ])('%s', (_name, state, expected) => {
        expect(decideCodingAgentSessionStart(state)).toEqual(expected);
    });
});

describe('codingAgentSessionFlags', () => {
    it('continues the transcript on disk', () => {
        expect(codingAgentSessionFlags({ kind: 'continue' })).toBe(
            '--continue -p',
        );
    });

    it('starts a new session', () => {
        expect(codingAgentSessionFlags({ kind: 'new' })).toBe('-p');
    });
});
