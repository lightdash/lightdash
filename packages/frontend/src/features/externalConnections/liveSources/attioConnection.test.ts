import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { ATTIO_TOKEN_FORM } from './attioConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('attioConnection', () => {
    it('accepts an object slug', () => {
        const { account } = ATTIO_TOKEN_FORM;
        if (!account) throw new Error('Attio asks for an object');
        const { normalize, isValid } = account;
        expect(normalize(' Deals ')).toBe('deals');
        expect(isValid('custom_object_1')).toBe(true);
        expect(isValid('deals/view')).toBe(false);
        expect(isValid('')).toBe(false);
    });

    it('creates a token-authenticated source for the object', () => {
        expect(
            toTokenLiveSourceCreatePayload(ATTIO_TOKEN_FORM, {
                name: ' Attio deals ',
                accountId: 'deals',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'Attio deals',
            type: 'bearer_token',
            origin: 'https://api.attio.com',
            secret: 'token',
            apiSource: { connector: ApiConnectorType.ATTIO, object: 'deals' },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [
                '/v2/objects/deals/attributes',
                '/v2/objects/deals/records/query',
            ],
        });
    });
});
