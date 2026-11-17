import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { GITHUB_TOKEN_FORM } from './githubConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('githubConnection', () => {
    it('accepts owner/name or a pasted repository URL', () => {
        const { normalize, isValid } = GITHUB_TOKEN_FORM.account;
        expect(normalize('https://github.com/lightdash/lightdash.git')).toBe(
            'lightdash/lightdash',
        );
        expect(isValid(normalize(' lightdash/lightdash/ '))).toBe(true);
        expect(isValid('lightdash')).toBe(false);
        expect(isValid('lightdash/..')).toBe(false);
    });

    it('creates a token-authenticated source for the repository', () => {
        expect(
            toTokenLiveSourceCreatePayload(GITHUB_TOKEN_FORM, {
                name: ' GitHub ',
                accountId: 'lightdash/lightdash',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'GitHub',
            type: 'bearer_token',
            origin: 'https://api.github.com',
            secret: 'token',
            apiSource: {
                connector: ApiConnectorType.GITHUB,
                owner: 'lightdash',
                repo: 'lightdash',
            },
            allowedMethods: ['GET'],
            allowedPathPrefixes: [
                '/search/issues',
                '/repos/lightdash/lightdash/stats/contributors',
            ],
        });
    });
});
