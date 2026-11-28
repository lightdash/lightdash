import { scrubSecrets } from './scrubSecrets';

describe('scrubSecrets', () => {
    it('redacts Airtable personal access tokens', () => {
        const token = `patAbCdEfGhIjKlMn.${'a1'.repeat(32)}`;
        expect(scrubSecrets(`Airtable token ${token} was refused`)).toBe(
            'Airtable token [redacted] was refused',
        );
    });
});
