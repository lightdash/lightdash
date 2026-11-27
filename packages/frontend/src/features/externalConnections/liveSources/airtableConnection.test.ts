import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { AIRTABLE_TOKEN_FORM } from './airtableConnection';
import { toTokenLiveSourceCreatePayload } from './tokenLiveSource';

const BASE = 'appAbCdEfGhIjKlMn';
const TABLE = 'tblAbCdEfGhIjKlMn';

describe('airtableConnection', () => {
    it('reads the base id from a pasted base, table or view URL', () => {
        const { normalize, isValid } = AIRTABLE_TOKEN_FORM.account;
        expect(normalize(` https://airtable.com/${BASE} `)).toBe(BASE);
        expect(
            normalize(
                `https://airtable.com/${BASE}/${TABLE}/viwAbCdEfGhIjKlMn?blocks=hide`,
            ),
        ).toBe(BASE);
        expect(isValid(normalize(BASE))).toBe(true);
        expect(isValid(normalize(TABLE))).toBe(false);
        expect(isValid('Tickets')).toBe(false);
    });

    it('creates a token-authenticated source for the base', () => {
        expect(
            toTokenLiveSourceCreatePayload(AIRTABLE_TOKEN_FORM, {
                name: ' Support ',
                accountId: BASE,
                token: ' pat123 ',
            }),
        ).toMatchObject({
            name: 'Support',
            type: 'bearer_token',
            origin: 'https://api.airtable.com',
            secret: 'pat123',
            apiSource: { connector: ApiConnectorType.AIRTABLE, baseId: BASE },
            allowedMethods: ['GET'],
            allowedPathPrefixes: [
                `/v0/${BASE}/`,
                `/v0/meta/bases/${BASE}/tables`,
            ],
        });
    });
});
