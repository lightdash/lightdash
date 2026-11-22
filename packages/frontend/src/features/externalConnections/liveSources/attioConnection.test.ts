import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { ATTIO_TOKEN_FORM } from './attioConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

describe('attioConnection', () => {
    it('asks for the token only', () => {
        expect(ATTIO_TOKEN_FORM.account).toBeNull();
    });

    it('creates a token-authenticated source for every standard object', () => {
        expect(
            toTokenLiveSourceCreatePayload(ATTIO_TOKEN_FORM, {
                name: ' Attio ',
                accountId: '',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'Attio',
            type: 'bearer_token',
            origin: 'https://api.attio.com',
            secret: 'token',
            apiSource: { connector: ApiConnectorType.ATTIO },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: [
                '/v2/objects/companies/attributes',
                '/v2/objects/companies/records/query',
                '/v2/objects/people/attributes',
                '/v2/objects/people/records/query',
                '/v2/objects/deals/attributes',
                '/v2/objects/deals/records/query',
                '/v2/objects/users/attributes',
                '/v2/objects/users/records/query',
                '/v2/objects/workspaces/attributes',
                '/v2/objects/workspaces/records/query',
                '/v2/workspace_members',
            ],
        });
    });
});
