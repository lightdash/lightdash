import { normalizeAiMcpOAuthClientCredentials } from './mcpServerCredentials';

describe('normalizeAiMcpOAuthClientCredentials', () => {
    it('returns null when no client credentials are provided', () => {
        expect(normalizeAiMcpOAuthClientCredentials(null)).toBeNull();
        expect(normalizeAiMcpOAuthClientCredentials(undefined)).toBeNull();
        expect(
            normalizeAiMcpOAuthClientCredentials({
                clientId: '  ',
                clientSecret: '',
            }),
        ).toBeNull();
    });

    it('keeps a client ID without a secret as a public client', () => {
        expect(
            normalizeAiMcpOAuthClientCredentials({ clientId: ' client ' }),
        ).toEqual({ clientId: 'client' });
        expect(
            normalizeAiMcpOAuthClientCredentials({
                clientId: 'client',
                clientSecret: '   ',
            }),
        ).toEqual({ clientId: 'client' });
    });

    it('keeps a client ID with a secret as a confidential client', () => {
        expect(
            normalizeAiMcpOAuthClientCredentials({
                clientId: ' client ',
                clientSecret: ' secret ',
            }),
        ).toEqual({ clientId: 'client', clientSecret: 'secret' });
    });

    it('rejects a secret without a client ID', () => {
        expect(() =>
            normalizeAiMcpOAuthClientCredentials({ clientSecret: 'secret' }),
        ).toThrow('OAuth client secret requires a client ID');
    });
});
