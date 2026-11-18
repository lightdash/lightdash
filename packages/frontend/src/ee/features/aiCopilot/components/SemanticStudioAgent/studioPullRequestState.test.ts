import { describe, expect, it } from 'vitest';
import { resolveStudioPullRequestState } from './studioPullRequestState';

describe('resolveStudioPullRequestState', () => {
    it.each(['merged', 'closed'] as const)(
        'keeps stored %s over stale open checks',
        (state) => {
            expect(
                resolveStudioPullRequestState(state, {
                    merged: false,
                    state: 'open',
                }),
            ).toBe(state);
        },
    );
    it('uses terminal checks over an open workspace', () => {
        expect(
            resolveStudioPullRequestState('open', {
                merged: true,
                state: 'closed',
            }),
        ).toBe('merged');
        expect(
            resolveStudioPullRequestState('open', {
                merged: false,
                state: 'closed',
            }),
        ).toBe('closed');
    });
    it('defaults to open without either source', () => {
        expect(resolveStudioPullRequestState(null, null)).toBe('open');
    });
});
