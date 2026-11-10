import {
    ApiConnectorType,
    ParameterError,
    type CreateExternalConnection,
    type ExternalConnectionApiSource,
} from '@lightdash/common';
import {
    getGa4MetadataPath,
    getGa4ReportPath,
} from '../../../services/QuerySourceService/api/google/Ga4Connector';
import { GOOGLE_TOKEN_URL } from '../../../services/QuerySourceService/api/google/googleSignIn';
import { getSearchConsoleQueryPath } from '../../../services/QuerySourceService/api/google/SearchConsoleConnector';
import {
    validateApiSourceConnection,
    withApiSourceAccessRules,
} from './apiSourceConnection';
import { buildOutboundUrl, normalizeAndValidatePath } from './proxyValidation';

const posthog: ExternalConnectionApiSource = {
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
    it('limits a PostHog connection to its query and property endpoints', () => {
        expect(withApiSourceAccessRules(config())).toMatchObject({
            allowedPathPrefixes: [
                '/api/projects/303731/query/',
                '/api/projects/303731/property_definitions/',
            ],
            allowedMethods: ['POST', 'GET'],
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

describe('Search Console connections', () => {
    const searchConsole = (
        siteUrl: string,
        overrides: Partial<CreateExternalConnection> = {},
    ) =>
        withApiSourceAccessRules(
            config({
                type: 'oauth_authorization_code',
                origin: 'https://searchconsole.googleapis.com',
                oauthTokenUrl: GOOGLE_TOKEN_URL,
                apiSource: {
                    connector: ApiConnectorType.SEARCH_CONSOLE,
                    siteUrl,
                },
                ...overrides,
            }),
        );

    it.each(['https://lightdash.com/', 'sc-domain:lightdash.com'])(
        'sends a query for %s to Google with the site encoded once',
        (siteUrl) => {
            const { allowedPathPrefixes, origin } = searchConsole(siteUrl);
            const path = normalizeAndValidatePath(
                getSearchConsoleQueryPath(siteUrl),
                allowedPathPrefixes,
            );
            expect(buildOutboundUrl(origin, path, undefined)).toBe(
                `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
                    siteUrl,
                )}/searchAnalytics/query`,
            );
        },
    );

    it('accepts a signed-in site', () => {
        expect(() =>
            validateApiSourceConnection(
                searchConsole('https://lightdash.com/'),
            ),
        ).not.toThrow();
    });

    it.each([
        [searchConsole('lightdash.com'), 'must look like'],
        [
            searchConsole('sc-domain:lightdash.com', {
                origin: 'https://example.com',
            }),
            'must use https://searchconsole.googleapis.com',
        ],
        [
            searchConsole('sc-domain:lightdash.com', {
                type: 'bearer_token',
                oauthTokenUrl: null,
            }),
            'signing in with Google',
        ],
    ])('refuses %#', (connection, message) => {
        expect(() => validateApiSourceConnection(connection)).toThrow(message);
    });
});

describe('Google Analytics connections', () => {
    const ga4 = (
        propertyId: string,
        overrides: Partial<CreateExternalConnection> = {},
    ) =>
        withApiSourceAccessRules(
            config({
                type: 'oauth_authorization_code',
                origin: 'https://analyticsdata.googleapis.com',
                oauthTokenUrl: GOOGLE_TOKEN_URL,
                apiSource: { connector: ApiConnectorType.GA4, propertyId },
                ...overrides,
            }),
        );

    it('sends reports and metadata reads only to the connected property', () => {
        const { allowedPathPrefixes, allowedMethods, origin } = ga4('123456');
        expect(allowedMethods).toEqual(['POST', 'GET']);
        expect(
            buildOutboundUrl(
                origin,
                normalizeAndValidatePath(
                    getGa4MetadataPath('123456'),
                    allowedPathPrefixes,
                ),
                undefined,
            ),
        ).toBe(
            'https://analyticsdata.googleapis.com/v1beta/properties/123456/metadata',
        );
        const path = normalizeAndValidatePath(
            getGa4ReportPath('123456'),
            allowedPathPrefixes,
        );
        expect(buildOutboundUrl(origin, path, undefined)).toBe(
            'https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport',
        );
        expect(() =>
            normalizeAndValidatePath(
                getGa4ReportPath('654321'),
                allowedPathPrefixes,
            ),
        ).toThrow();
    });

    it('accepts a signed-in property', () => {
        expect(() => validateApiSourceConnection(ga4('123456'))).not.toThrow();
    });

    it.each([
        [ga4('properties/123456'), 'must be a number'],
        [
            ga4('123456', { origin: 'https://example.com' }),
            'must use https://analyticsdata.googleapis.com',
        ],
        [
            ga4('123456', { type: 'bearer_token', oauthTokenUrl: null }),
            'signing in with Google',
        ],
    ])('refuses %#', (connection, message) => {
        expect(() => validateApiSourceConnection(connection)).toThrow(message);
    });
});

describe('Google Ads connections', () => {
    const apiSource = {
        connector: ApiConnectorType.GOOGLE_ADS,
        customerId: '1234567890',
        loginCustomerId: '9876543210',
    } as const;
    const valid = {
        apiSource,
        type: 'oauth_authorization_code' as const,
        origin: 'https://googleads.googleapis.com',
        oauthTokenUrl: 'https://oauth2.googleapis.com/token',
    };

    it('reaches only the read-only search endpoint of its account', () => {
        expect(withApiSourceAccessRules({ apiSource })).toMatchObject({
            allowedPathPrefixes: ['/v26/customers/1234567890/googleAds:search'],
            allowedMethods: ['POST'],
            customHeaders: { 'login-customer-id': '9876543210' },
        });
    });

    it('sends no manager header for an account reached directly', () => {
        expect(
            withApiSourceAccessRules({
                apiSource: { ...apiSource, loginCustomerId: null },
            }),
        ).toMatchObject({ customHeaders: null });
    });

    it('accepts a signed-in source', () => {
        expect(() => validateApiSourceConnection(valid)).not.toThrow();
    });

    it.each([
        [
            'a short customer id',
            { apiSource: { ...apiSource, customerId: '123' } },
        ],
        [
            'a dashed manager id',
            {
                apiSource: {
                    ...apiSource,
                    loginCustomerId: '987-654-3210',
                },
            },
        ],
        ['another origin', { origin: 'https://example.com' }],
        ['another sign-in', { type: 'bearer_token' as const }],
    ])('refuses %s', (_, override) => {
        expect(() =>
            validateApiSourceConnection({ ...valid, ...override }),
        ).toThrow(ParameterError);
    });
});
