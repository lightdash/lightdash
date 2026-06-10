import cors from 'cors';
import { type Request, type Response } from 'express';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import {
    createCorsOptionsDelegate,
    invalidateCorsPolicyCache,
} from './CorsPolicy';

const getCorsHeaders = async ({
    origin,
    method = 'GET',
    dbAllowedDomains,
    dbError,
    envAllowedDomains = [],
    envEnabled = true,
}: {
    origin?: string;
    method?: string;
    dbAllowedDomains: string[];
    dbError?: Error;
    envAllowedDomains?: string[];
    envEnabled?: boolean;
}) => {
    invalidateCorsPolicyCache();
    const organizationSettingsModel = {
        getAllEnabledCorsAllowedDomains: jest.fn(async () => {
            if (dbError) {
                throw dbError;
            }
            return dbAllowedDomains;
        }),
    } as unknown as OrganizationSettingsModel;
    const lightdashConfig = {
        ...lightdashConfigMock,
        siteUrl: 'https://lightdash.example.com',
        security: {
            ...lightdashConfigMock.security,
            crossOriginResourceSharingPolicy: {
                enabled: envEnabled,
                allowedDomains: envAllowedDomains,
            },
        },
    };

    const headers = new Map<string, string>();
    const req = {
        method,
        headers: {
            ...(origin ? { origin } : {}),
            'access-control-request-method': 'GET',
        },
    } as unknown as Request;
    const next = jest.fn();

    let res!: Response;
    await new Promise<void>((resolve, reject) => {
        res = {
            getHeader: jest.fn((key: string) => headers.get(key)),
            setHeader: jest.fn((key: string, value: string) => {
                headers.set(key, value);
            }),
            end: jest.fn(() => resolve()),
        } as unknown as Response;

        cors(
            createCorsOptionsDelegate({
                lightdashConfig,
                organizationSettingsModel,
            }),
        )(req, res, (error?: unknown) => {
            if (error) reject(error);
            next(error);
            resolve();
        });
    });

    return { headers, res, next, organizationSettingsModel };
};

describe('CorsPolicy', () => {
    afterEach(() => {
        invalidateCorsPolicyCache();
    });

    test('allows exact origins from enabled org CORS settings', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://app.example.com',
            dbAllowedDomains: ['https://app.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'https://app.example.com',
        );
    });

    test('does not load org CORS settings when request has no origin header', async () => {
        const { headers, organizationSettingsModel } = await getCorsHeaders({
            dbAllowedDomains: ['https://app.example.com'],
            envAllowedDomains: ['https://env.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
        expect(
            organizationSettingsModel.getAllEnabledCorsAllowedDomains,
        ).not.toHaveBeenCalled();
    });

    test('allows regex origins from enabled org CORS settings', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://embed.example.com',
            dbAllowedDomains: ['/^https:\\/\\/.*\\.example\\.com$/'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'https://embed.example.com',
        );
    });

    test('allows wildcard subdomain origins from enabled org CORS settings', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://embed.example.com',
            dbAllowedDomains: ['*.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'https://embed.example.com',
        );
    });

    test('wildcard origins do not include the apex domain or a different protocol', async () => {
        const { headers: apexHeaders } = await getCorsHeaders({
            origin: 'https://example.com',
            dbAllowedDomains: ['*.example.com'],
        });
        expect(apexHeaders.get('Access-Control-Allow-Origin')).toBeUndefined();

        const { headers: protocolHeaders } = await getCorsHeaders({
            origin: 'http://embed.example.com',
            dbAllowedDomains: ['*.example.com'],
        });
        expect(
            protocolHeaders.get('Access-Control-Allow-Origin'),
        ).toBeUndefined();
    });

    test('wildcard origins can specify http and a port', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'http://embed.example.com:3000',
            dbAllowedDomains: ['http://*.example.com:3000'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'http://embed.example.com:3000',
        );
    });

    test('allows env configured origins when env CORS is enabled', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://env.example.com',
            dbAllowedDomains: [],
            envEnabled: true,
            envAllowedDomains: ['https://env.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'https://env.example.com',
        );
    });

    test('falls back to env configured origins when org CORS settings cannot be loaded', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://env.example.com',
            dbAllowedDomains: ['https://app.example.com'],
            dbError: new Error('column "cors_allowed_domains" does not exist'),
            envAllowedDomains: ['https://env.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'https://env.example.com',
        );

        const { headers: orgOnlyHeaders } = await getCorsHeaders({
            origin: 'https://app.example.com',
            dbAllowedDomains: ['https://app.example.com'],
            dbError: new Error('column "cors_allowed_domains" does not exist'),
            envAllowedDomains: ['https://env.example.com'],
        });
        expect(
            orgOnlyHeaders.get('Access-Control-Allow-Origin'),
        ).toBeUndefined();
    });

    test('skips org CORS entries that cannot be compiled without dropping other origins', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://env.example.com',
            dbAllowedDomains: [
                undefined,
                'https://app.example.com',
            ] as unknown as string[],
            envAllowedDomains: ['https://env.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBe(
            'https://env.example.com',
        );

        const { headers: orgHeaders } = await getCorsHeaders({
            origin: 'https://app.example.com',
            dbAllowedDomains: [
                undefined,
                'https://app.example.com',
            ] as unknown as string[],
            envAllowedDomains: ['https://env.example.com'],
        });
        expect(orgHeaders.get('Access-Control-Allow-Origin')).toBe(
            'https://app.example.com',
        );
    });

    test('falls back to env configured origins when the dynamic policy fails unexpectedly', async () => {
        const now = jest.spyOn(Date, 'now').mockImplementation(() => {
            throw new Error('clock failed');
        });

        try {
            const { headers } = await getCorsHeaders({
                origin: 'https://env.example.com',
                dbAllowedDomains: ['https://app.example.com'],
                envAllowedDomains: ['https://env.example.com'],
            });
            expect(headers.get('Access-Control-Allow-Origin')).toBe(
                'https://env.example.com',
            );
        } finally {
            now.mockRestore();
        }
    });

    test('does not allow org or env origins when global CORS is disabled', async () => {
        const { headers, organizationSettingsModel } = await getCorsHeaders({
            origin: 'https://app.example.com',
            dbAllowedDomains: ['https://app.example.com'],
            envEnabled: false,
            envAllowedDomains: ['https://app.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
        expect(
            organizationSettingsModel.getAllEnabledCorsAllowedDomains,
        ).not.toHaveBeenCalled();
    });

    test('does not allow unknown origins', async () => {
        const { headers } = await getCorsHeaders({
            origin: 'https://unknown.example.com',
            dbAllowedDomains: ['https://app.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
    });

    test('OPTIONS preflight still short-circuits for denied origins', async () => {
        const { headers, res, next } = await getCorsHeaders({
            origin: 'https://unknown.example.com',
            method: 'OPTIONS',
            dbAllowedDomains: ['https://app.example.com'],
        });
        expect(headers.get('Access-Control-Allow-Origin')).toBeUndefined();
        expect(headers.get('Access-Control-Allow-Methods')).toBe(
            'OPTIONS, GET, HEAD, PUT, PATCH, POST, DELETE',
        );
        expect(res.end).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
