import { describe, expect, it } from 'vitest';
import {
    isOpenWorkspace,
    isPullRequestOpen,
    pullRequestStateOf,
    type SemanticStudioWorkspace,
} from './semanticStudio';

const pullRequest = (
    state: NonNullable<SemanticStudioWorkspace['pullRequest']>['state'],
) => ({ url: 'https://github.com/o/r/pull/12', state });

const workspace = (
    overrides: Partial<SemanticStudioWorkspace> = {},
): Pick<SemanticStudioWorkspace, 'finishedAt' | 'pullRequest'> => ({
    pullRequest: null,
    finishedAt: null,
    ...overrides,
});

describe('isPullRequestOpen', () => {
    it('counts an open or unchecked pull request as open, and nothing else', () => {
        expect(isPullRequestOpen(pullRequest('open'))).toBe(true);
        expect(isPullRequestOpen(pullRequest(null))).toBe(true);
        expect(isPullRequestOpen(pullRequest('merged'))).toBe(false);
        expect(isPullRequestOpen(pullRequest('closed'))).toBe(false);
        expect(isPullRequestOpen(null)).toBe(false);
    });
});

describe('isOpenWorkspace', () => {
    it('keeps a draft and work in review, including a pull request not checked yet', () => {
        expect(isOpenWorkspace(workspace())).toBe(true);
        expect(
            isOpenWorkspace(workspace({ pullRequest: pullRequest('open') })),
        ).toBe(true);
        expect(
            isOpenWorkspace(workspace({ pullRequest: pullRequest(null) })),
        ).toBe(true);
    });

    it('drops finished, merged and closed work', () => {
        expect(isOpenWorkspace(workspace({ finishedAt: new Date() }))).toBe(
            false,
        );
        expect(
            isOpenWorkspace(workspace({ pullRequest: pullRequest('merged') })),
        ).toBe(false);
        expect(
            isOpenWorkspace(workspace({ pullRequest: pullRequest('closed') })),
        ).toBe(false);
    });
});

describe('pullRequestStateOf', () => {
    it('reads merged first, then open, else closed', () => {
        expect(pullRequestStateOf({ state: 'closed', merged: true })).toBe(
            'merged',
        );
        expect(pullRequestStateOf({ state: 'open', merged: false })).toBe(
            'open',
        );
        expect(pullRequestStateOf({ state: 'closed', merged: false })).toBe(
            'closed',
        );
    });
});
