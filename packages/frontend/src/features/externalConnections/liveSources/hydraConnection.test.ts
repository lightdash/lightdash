import { ApiConnectorType, HYDRA_DEFAULT_SETTINGS } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { HYDRA_TOKEN_FORM } from './hydraConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
} from './tokenLiveSource';

describe('hydraConnection', () => {
    it('creates a source with the default behaviour when it is left blank', () => {
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
            apiSource: HYDRA_DEFAULT_SETTINGS,
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: ['/v1/report', '/v1/account'],
        });
    });

    it('reads the behaviour line into settings', () => {
        expect(
            toTokenLiveSourceUpdatePayload(HYDRA_TOKEN_FORM, {
                name: 'Hydra',
                accountId: 'latencyMs=500, retryAfterEvery=3 failAuth=true',
                token: '',
            }),
        ).toEqual({
            name: 'Hydra',
            apiSource: {
                ...HYDRA_DEFAULT_SETTINGS,
                latencyMs: 500,
                retryAfterEvery: 3,
                failAuth: true,
            },
        });
    });

    it('shows a saved source behaviour in full and checks edits', () => {
        const line = HYDRA_TOKEN_FORM.getAccountId({
            apiSource: {
                ...HYDRA_DEFAULT_SETTINGS,
                connector: ApiConnectorType.HYDRA,
                errorRate: 0.5,
            },
        } as Parameters<typeof HYDRA_TOKEN_FORM.getAccountId>[0]);
        expect(line).toContain('errorRate=0.5');
        expect(HYDRA_TOKEN_FORM.account.isValid(line)).toBe(true);
        expect(HYDRA_TOKEN_FORM.account.isValid('errorRate=2')).toBe(false);
        expect(HYDRA_TOKEN_FORM.account.isValid('speed=fast')).toBe(false);
    });
});
