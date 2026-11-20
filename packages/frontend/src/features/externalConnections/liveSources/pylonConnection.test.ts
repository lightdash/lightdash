import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { PYLON_TOKEN_FORM } from './pylonConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
} from './tokenLiveSource';

describe('pylonConnection', () => {
    it('creates a token-authenticated source with no account to pick', () => {
        expect(
            toTokenLiveSourceCreatePayload(PYLON_TOKEN_FORM, {
                name: ' Pylon ',
                accountId: '',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'Pylon',
            type: 'bearer_token',
            origin: 'https://api.usepylon.com',
            secret: 'token',
            apiSource: { connector: ApiConnectorType.PYLON },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [
                '/issues/search',
                '/accounts/search',
                '/contacts/search',
                '/users',
            ],
        });
    });

    it('keeps the saved token when the field is blank', () => {
        expect(
            toTokenLiveSourceUpdatePayload(PYLON_TOKEN_FORM, {
                name: 'Support',
                accountId: '',
                token: ' ',
            }),
        ).toEqual({
            name: 'Support',
            apiSource: { connector: ApiConnectorType.PYLON },
        });
    });
});
