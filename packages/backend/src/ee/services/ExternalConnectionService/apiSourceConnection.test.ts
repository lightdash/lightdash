import {
    ApiConnectorType,
    ParameterError,
    type CreateExternalConnection,
} from '@lightdash/common';
import {
    validateApiSourceConnection,
    withApiSourceAccessRules,
} from './apiSourceConnection';

const posthog = {
    connector: ApiConnectorType.POSTHOG,
    projectId: '303731',
};

const config = (
    overrides: Partial<CreateExternalConnection> = {},
): CreateExternalConnection => ({
    name: 'Product analytics',
    type: 'bearer_token',
    origin: 'https://eu.posthog.com',
    allowedPathPrefixes: ['/'],
    allowedMethods: ['GET', 'POST', 'DELETE'],
    allowedContentTypes: ['*/*'],
    apiSource: posthog,
    ...overrides,
});

describe('withApiSourceAccessRules', () => {
    it('limits a PostHog connection to its query endpoint', () => {
        expect(withApiSourceAccessRules(config())).toMatchObject({
            allowedPathPrefixes: ['/api/projects/303731/query/'],
            allowedMethods: ['POST'],
            allowedContentTypes: ['application/json'],
            timeoutMs: 45_000,
            responseMaxBytes: 25 * 1024 * 1024,
        });
    });

    it('leaves other connections untouched', () => {
        const plain = config({ apiSource: null });
        expect(withApiSourceAccessRules(plain)).toBe(plain);
    });
});

describe('validateApiSourceConnection', () => {
    it('accepts a PostHog connection in either region', () => {
        expect(() => validateApiSourceConnection(config())).not.toThrow();
        expect(() =>
            validateApiSourceConnection(
                config({ origin: 'https://us.posthog.com/' }),
            ),
        ).not.toThrow();
    });

    it.each([
        [
            'a non-numeric project id',
            { apiSource: { ...posthog, projectId: '../1' } },
        ],
        ['another host', { origin: 'https://posthog.example.com' }],
        ['another auth type', { type: 'api_key' as const }],
    ])('rejects %s', (_, overrides) => {
        expect(() => validateApiSourceConnection(config(overrides))).toThrow(
            ParameterError,
        );
    });

    it('ignores connections that are not api sources', () => {
        expect(() =>
            validateApiSourceConnection(
                config({ apiSource: null, origin: 'https://example.com' }),
            ),
        ).not.toThrow();
    });
});
