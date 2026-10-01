import { GitHost } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getEmptyGitHostDraft,
    toGitHostCredentials,
} from './semanticLayerStepState';

describe('getEmptyGitHostDraft', () => {
    it('starts on the GitHub App when the instance can install it', () => {
        expect(getEmptyGitHostDraft(true).githubMethod).toBe('installation');
    });

    it('starts on an access token when the instance has no GitHub App', () => {
        expect(getEmptyGitHostDraft(false).githubMethod).toBe('token');
    });
});

describe('toGitHostCredentials for GitHub', () => {
    it('uses a token from a draft without the GitHub App', () => {
        expect(
            toGitHostCredentials(
                GitHost.GITHUB,
                { ...getEmptyGitHostDraft(false), token: ' ghp_token ' },
                false,
            ),
        ).toEqual({
            host: GitHost.GITHUB,
            method: 'token',
            token: 'ghp_token',
        });
    });

    it('waits for the GitHub App installation', () => {
        expect(
            toGitHostCredentials(
                GitHost.GITHUB,
                getEmptyGitHostDraft(true),
                false,
            ),
        ).toBeNull();
    });
});
