import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { HUBSPOT_TOKEN_FORM } from './hubspotConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('hubspotConnection', () => {
    it('accepts deals, contacts and companies only', () => {
        const { account } = HUBSPOT_TOKEN_FORM;
        if (!account) throw new Error('HubSpot asks for an object');
        const { normalize, isValid } = account;
        expect(normalize(' Deals ')).toBe('deals');
        expect(isValid('contacts')).toBe(true);
        expect(isValid('companies')).toBe(true);
        expect(isValid('tickets')).toBe(false);
        expect(isValid('')).toBe(false);
    });

    it('creates a token-authenticated source for the object', () => {
        expect(
            toTokenLiveSourceCreatePayload(HUBSPOT_TOKEN_FORM, {
                name: ' HubSpot deals ',
                accountId: 'deals',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'HubSpot deals',
            type: 'bearer_token',
            origin: 'https://api.hubapi.com',
            secret: 'token',
            apiSource: { connector: ApiConnectorType.HUBSPOT, object: 'deals' },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [
                '/crm/v3/properties/deals',
                '/crm/v3/objects/deals/search',
            ],
        });
    });
});
