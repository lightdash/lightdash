import { redactWebhookIdentity } from './MicrosoftTeamsClient';

describe('redactWebhookIdentity', () => {
    const teamsWebhookUrl =
        'https://outlook.office.com/webhook/abc123def456-uuid-shape/IncomingWebhook/secrettoken/uuid?key=hunter2';
    const powerAutomateUrl =
        'https://prod-12.region.logic.azure.com:443/workflows/abcdef/triggers/manual/paths/invoke?api-version=2016-06-01&sp=/triggers/manual/run&sv=1.0&sig=longSecretSignature';

    it('redacts a real-shape Teams webhook URL without leaking path or query secrets', () => {
        const result = redactWebhookIdentity(teamsWebhookUrl);

        expect(result.startsWith('outlook.office.com/')).toBe(true);
        expect(result).not.toContain('abc123def456');
        expect(result).not.toContain('secrettoken');
        expect(result).not.toContain('hunter2');
        expect(result).not.toContain('IncomingWebhook');
        expect(result).not.toContain('uuid');
        expect(result).not.toContain('key=');
        expect(result).not.toContain('?');
        expect(result).toMatch(/^outlook\.office\.com\/…[a-f0-9]{12}$/);
    });

    it('redacts a Power Automate Workflows URL without leaking sig token or query secrets', () => {
        const result = redactWebhookIdentity(powerAutomateUrl);

        expect(result.startsWith('prod-12.region.logic.azure.com/')).toBe(true);
        expect(result).not.toContain('longSecretSignature');
        expect(result).not.toContain('sig=');
        expect(result).not.toContain('sp=');
        expect(result).not.toContain('sv=');
        expect(result).not.toContain('api-version');
        expect(result).not.toContain('abcdef');
        expect(result).not.toContain('?');
        expect(result).toMatch(
            /^prod-12\.region\.logic\.azure\.com\/…[a-f0-9]{12}$/,
        );
    });

    it('produces the same hash for the same path (deterministic)', () => {
        const first = redactWebhookIdentity(teamsWebhookUrl);
        const second = redactWebhookIdentity(teamsWebhookUrl);
        expect(first).toBe(second);
    });

    it('produces different hashes for different paths on the same host', () => {
        const urlA =
            'https://outlook.office.com/webhook/path-a/IncomingWebhook/tokenA/uuidA';
        const urlB =
            'https://outlook.office.com/webhook/path-b/IncomingWebhook/tokenB/uuidB';

        const resultA = redactWebhookIdentity(urlA);
        const resultB = redactWebhookIdentity(urlB);

        expect(resultA).not.toBe(resultB);
        expect(resultA.startsWith('outlook.office.com/')).toBe(true);
        expect(resultB.startsWith('outlook.office.com/')).toBe(true);
    });

    it('returns the literal "invalid-url" string for malformed input without throwing', () => {
        expect(() => redactWebhookIdentity('not-a-url')).not.toThrow();
        expect(redactWebhookIdentity('not-a-url')).toBe('invalid-url');
    });
});
