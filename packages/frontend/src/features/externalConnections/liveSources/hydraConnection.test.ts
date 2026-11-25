import { HYDRA_DEFAULT_SOURCE } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { HYDRA_TOKEN_FORM } from './hydraConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('hydraConnection', () => {
    it('creates a source with the default settings', () => {
        expect(
            toTokenLiveSourceCreatePayload(HYDRA_TOKEN_FORM, {
                name: ' Hydra ',
                accountId: '',
                token: ' alice ',
            }),
        ).toMatchObject({
            name: 'Hydra',
            type: 'bearer_token',
            origin: 'https://hydra.invalid',
            secret: 'alice',
            apiSource: HYDRA_DEFAULT_SOURCE,
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: ['/v1/report', '/v1/account'],
        });
    });
});
