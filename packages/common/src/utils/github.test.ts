import { describe, expect, it } from 'vitest';
import { validateGithubToken } from './github';

describe('validateGithubToken', () => {
    it.each([
        'ghp_token',
        'github_pat_token',
        'gho_token',
        'ghs_token',
        'ghu_token',
    ])('accepts the GitHub token family %s', (token) => {
        expect(validateGithubToken(token)).toEqual([true, undefined]);
    });

    it('allows an empty token for public repositories', () => {
        expect(validateGithubToken('')).toEqual([true, undefined]);
    });

    it('names every supported prefix when rejecting a token', () => {
        expect(validateGithubToken('invalid')).toEqual([
            false,
            'GitHub token should start with "github_pat_", "ghp_", "gho_", "ghs_", or "ghu_"',
        ]);
    });
});
