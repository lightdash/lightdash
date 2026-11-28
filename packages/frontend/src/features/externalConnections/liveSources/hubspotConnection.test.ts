import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { HUBSPOT_TOKEN_FORM } from './hubspotConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('hubspotConnection', () => {
    it('creates one token-authenticated source for every CRM object', () => {
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
                '/crm/v3/properties/tickets',
                '/crm/v3/objects/tickets/search',
                '/crm/v3/properties/leads',
                '/crm/v3/objects/leads/search',
                '/crm/v3/pipelines/deals',
                '/crm/v3/pipelines/tickets',
                '/crm/v3/schemas',
            ],
        });
    });

    it('names every scope the private app needs', () => {
        expect(
            LIVE_INTEGRATION_CATALOG[ApiConnectorType.HUBSPOT].scopes,
        ).toEqual(
            expect.arrayContaining([
                'crm.objects.companies.read',
                'tickets',
                'crm.objects.leads.read',
            ]),
        );
    });
});
