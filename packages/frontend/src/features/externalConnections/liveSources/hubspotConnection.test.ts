import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { HUBSPOT_TOKEN_FORM } from './hubspotConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('hubspotConnection', () => {
    it('creates one token-authenticated source for deals, contacts and companies', () => {
        expect(HUBSPOT_TOKEN_FORM.account).toBeNull();
        expect(
            toTokenLiveSourceCreatePayload(HUBSPOT_TOKEN_FORM, {
                name: ' HubSpot ',
                accountId: '',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'HubSpot',
            type: 'bearer_token',
            origin: 'https://api.hubapi.com',
            secret: 'token',
            apiSource: { connector: ApiConnectorType.HUBSPOT },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [
                '/crm/v3/properties/deals',
                '/crm/v3/objects/deals/search',
                '/crm/v3/properties/contacts',
                '/crm/v3/objects/contacts/search',
                '/crm/v3/properties/companies',
                '/crm/v3/objects/companies/search',
            ],
        });
    });

    it('names every scope the private app needs', () => {
        expect(HUBSPOT_TOKEN_FORM.description).toContain(
            'crm.objects.companies.read',
        );
    });
});
