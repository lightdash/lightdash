import {
    ParameterError,
    UnexpectedServerError,
    type ExternalConnectionAuthType,
} from '@lightdash/common';
import { generateObject } from 'ai';
import {
    buildProposalSystemPrompt,
    generateExternalConnectionConfigProposal,
    normalizeProposal,
} from './externalConnectionConfigGenerator';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateObject: vi.fn(),
}));

const modelOptions = {
    model: {
        modelId: 'claude-sonnet-4-5',
        provider: 'anthropic',
    },
} as never;

type RawProposalInput = Parameters<typeof normalizeProposal>[0];

const rawProposal = (
    overrides: Partial<{
        confident: boolean;
        name: string;
        origin: string | null;
        type: ExternalConnectionAuthType;
        apiKeyName: string | null;
        apiKeyLocation: 'header' | 'query' | null;
        oauthScopes: string[] | null;
        customHeaders: Array<{ name: string; value: string }> | null;
        allowedMethods: string[];
        allowedPathPrefixes: string[];
        instructions: string | null;
        credentialGuide: string | null;
        docsUrl: string | null;
        notes: string | null;
    }> = {},
): RawProposalInput =>
    ({
        confident: true,
        name: 'Example API',
        origin: 'https://api.example.com',
        type: 'bearer_token' as ExternalConnectionAuthType,
        apiKeyName: null,
        apiKeyLocation: null,
        oauthScopes: null,
        customHeaders: null,
        allowedMethods: ['GET'],
        allowedPathPrefixes: ['/v1'],
        instructions: null,
        credentialGuide: '1. Create a token in the console',
        docsUrl: 'https://docs.example.com/auth',
        notes: null,
        ...overrides,
    }) as RawProposalInput;

const mockGenerateObject = (objects: unknown[]) => {
    const mock = vi.mocked(generateObject);
    mock.mockReset();
    objects.forEach((object) => {
        mock.mockResolvedValueOnce({
            object,
            usage: { inputTokens: 1, outputTokens: 1 },
        } as never);
    });
    return mock;
};

describe('buildProposalSystemPrompt', () => {
    it('contains the security guardrails', () => {
        const prompt = buildProposalSystemPrompt();
        expect(prompt).toContain('official documented API host');
        expect(prompt).toContain('confident=false');
        expect(prompt).toContain('Least privilege');
        expect(prompt).toContain(
            'NEVER include, invent, or placeholder any credential value',
        );
        expect(prompt).toContain('google_service_account');
        expect(prompt).toContain('client_email');
    });
});

describe('normalizeProposal', () => {
    it('clears type-foreign auth fields and nulls credentialGuide for public APIs', () => {
        const result = normalizeProposal(
            rawProposal({
                type: 'none',
                apiKeyName: 'x-api-key',
                apiKeyLocation: 'header',
                oauthScopes: ['https://example.com/scope'],
                credentialGuide: 'not needed',
                origin: 'https://api.example.com',
            }),
        );
        expect(result.apiKeyName).toBeNull();
        expect(result.apiKeyLocation).toBeNull();
        expect(result.oauthScopes).toBeNull();
        expect(result.credentialGuide).toBeNull();
    });

    it('defaults the api key location to header when missing', () => {
        const result = normalizeProposal(
            rawProposal({
                type: 'api_key',
                apiKeyName: ' x-api-key ',
                apiKeyLocation: null,
            }),
        );
        expect(result.apiKeyName).toBe('x-api-key');
        expect(result.apiKeyLocation).toBe('header');
    });

    it('converts header pairs to a record, dropping blank entries', () => {
        const result = normalizeProposal(
            rawProposal({
                customHeaders: [
                    { name: ' anthropic-version ', value: ' 2023-06-01 ' },
                    { name: '', value: 'orphan' },
                    { name: 'empty-value', value: '  ' },
                ],
            }),
        );
        expect(result.customHeaders).toEqual({
            'anthropic-version': '2023-06-01',
        });
    });

    it('falls back to safe defaults for empty methods and paths', () => {
        const result = normalizeProposal(
            rawProposal({
                allowedMethods: [],
                allowedPathPrefixes: ['v1/messages', '  '],
            }),
        );
        expect(result.allowedMethods).toEqual(['GET']);
        expect(result.allowedPathPrefixes).toEqual(['/v1/messages']);
    });

    it('strips trailing slash from origin and rejects non-https docs urls', () => {
        const result = normalizeProposal(
            rawProposal({
                origin: 'https://api.example.com/',
                docsUrl: 'http://docs.example.com/auth',
            }),
        );
        expect(result.origin).toBe('https://api.example.com');
        expect(result.docsUrl).toBeNull();
    });
});

describe('generateExternalConnectionConfigProposal', () => {
    const description = 'connect to Example';

    it('rejects an unconfident proposal with a friendly error', async () => {
        mockGenerateObject([rawProposal({ confident: false, origin: null })]);

        await expect(
            generateExternalConnectionConfigProposal(modelOptions, description),
        ).rejects.toThrow(ParameterError);
    });

    it('returns a valid proposal without a repair round', async () => {
        const mock = mockGenerateObject([rawProposal()]);

        const result = await generateExternalConnectionConfigProposal(
            modelOptions,
            description,
        );

        expect(result.origin).toBe('https://api.example.com');
        expect(mock).toHaveBeenCalledTimes(1);
    });

    it('repairs an invalid proposal once with the validation error appended', async () => {
        const invalid = rawProposal({ origin: 'https://api.example.com/v1' });
        const mock = mockGenerateObject([invalid, rawProposal()]);

        const result = await generateExternalConnectionConfigProposal(
            modelOptions,
            description,
        );

        expect(result.origin).toBe('https://api.example.com');
        expect(mock).toHaveBeenCalledTimes(2);
        const retryMessages = (mock.mock.calls[1][0] as { messages: unknown[] })
            .messages;
        expect(retryMessages).toEqual(
            expect.arrayContaining([
                { role: 'assistant', content: JSON.stringify(invalid) },
                expect.objectContaining({
                    role: 'user',
                    content: expect.stringContaining('invalid'),
                }),
            ]),
        );
    });

    it('gives up after a failed repair round', async () => {
        const invalid = rawProposal({ origin: 'https://api.example.com/v1' });
        const mock = mockGenerateObject([invalid, invalid]);

        await expect(
            generateExternalConnectionConfigProposal(modelOptions, description),
        ).rejects.toThrow(UnexpectedServerError);
        expect(mock).toHaveBeenCalledTimes(2);
    });
});
