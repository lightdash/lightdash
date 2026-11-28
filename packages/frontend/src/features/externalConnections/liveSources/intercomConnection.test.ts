import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { INTERCOM_TOKEN_FORM } from './intercomConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
} from './tokenLiveSource';

describe('intercomConnection', () => {
    it('creates a token source on the region picked', () => {
        expect(
            toTokenLiveSourceCreatePayload(INTERCOM_TOKEN_FORM, {
                name: ' Intercom ',
                accountId: '',
                token: ' token ',
                origin: 'https://api.eu.intercom.io',
            }),
        ).toMatchObject({
            name: 'Intercom',
            type: 'bearer_token',
            origin: 'https://api.eu.intercom.io',
            secret: 'token',
            apiSource: { connector: ApiConnectorType.INTERCOM },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [
                '/conversations/search',
                '/tickets/search',
                '/contacts/search',
                '/admins',
                '/teams',
                '/me',
            ],
        });
    });

    it('defaults to the US region', () => {
        expect(
            toTokenLiveSourceCreatePayload(INTERCOM_TOKEN_FORM, {
                name: 'Intercom',
                accountId: '',
                token: 'token',
            }).origin,
        ).toBe('https://api.intercom.io');
    });

    it('keeps the saved token and region when the token is blank', () => {
        expect(
            toTokenLiveSourceUpdatePayload(INTERCOM_TOKEN_FORM, {
                name: 'Support',
                accountId: '',
                token: ' ',
                origin: 'https://api.au.intercom.io',
            }),
        ).toEqual({
            name: 'Support',
            apiSource: { connector: ApiConnectorType.INTERCOM },
        });
    });
});
