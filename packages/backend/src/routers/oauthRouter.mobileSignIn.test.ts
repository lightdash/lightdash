import express, { type Request } from 'express';
import { once } from 'node:events';
import { request } from 'node:http';
import { type AddressInfo } from 'node:net';
import { MobileSignInOAuthError } from '../services/MobileSignInService/MobileSignInOAuthError';
import { MobileSignInGrantError } from '../services/OAuthService/managedSignIn/microsoftTokenExchangeGrantType';
import { getClientAddress } from '../utils/clientAddress';
import oauthRouter from './oauthRouter';

type HttpResponse = {
    status: number;
    headers: { get: (name: string) => string | null };
    json: () => Promise<unknown>;
};

const fetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
): Promise<HttpResponse> =>
    new Promise((resolve, reject) => {
        const req = request(
            url,
            { method: init.method, headers: init.headers },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: {
                            get: (name) => {
                                const value = res.headers[name.toLowerCase()];
                                return typeof value === 'string' ? value : null;
                            },
                        },
                        json: async () => JSON.parse(text),
                    });
                });
            },
        );
        req.on('error', reject);
        req.end(init.body);
    });

const startApp = async (services: Record<string, unknown>) => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
        req.services = services as never;
        next();
    });
    app.use('/api/v1/oauth', oauthRouter);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/oauth`;
    return { base, close: () => server.close() };
};

describe('POST /api/v1/oauth/mobile-sign-in/claim', () => {
    it('returns the claim and never caches it', async () => {
        const claim = vi.fn(async () => ({
            instance_url: 'https://app.example.test',
            display_name_masked: 'Te••• U.',
            expires_in: 300,
            interval: 2,
        }));
        const { base, close } = await startApp({
            getMobileSignInService: () => ({
                getClientAddress: (req: Request) => getClientAddress(req, true),
                claim,
            }),
        });
        try {
            const response = await fetch(`${base}/mobile-sign-in/claim`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '203.0.113.7',
                },
                body: JSON.stringify({ code: 'c' }),
            });
            expect(response.status).toBe(200);
            expect(response.headers.get('cache-control')).toBe('no-store');
            expect(await response.json()).toMatchObject({ interval: 2 });
            expect(claim).toHaveBeenCalledWith(
                { code: 'c' },
                expect.objectContaining({ ip: '203.0.113.7' }),
            );
        } finally {
            close();
        }
    });

    it('keys the claim on the rightmost client address, not a prepended one', async () => {
        const claim = vi.fn(async () => ({}));
        const { base, close } = await startApp({
            getMobileSignInService: () => ({
                getClientAddress: (req: Request) => getClientAddress(req, true),
                claim,
            }),
        });
        try {
            await fetch(`${base}/mobile-sign-in/claim`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-forwarded-for': '198.51.100.9, 203.0.113.7',
                },
                body: '{}',
            });
            expect(claim).toHaveBeenCalledWith(
                {},
                expect.objectContaining({ ip: '203.0.113.7' }),
            );
        } finally {
            close();
        }
    });

    it.each([
        [
            new MobileSignInOAuthError('expired_token'),
            400,
            { error: 'expired_token' },
        ],
        [
            new MobileSignInOAuthError('invalid_grant', {
                description: 'code_already_used',
            }),
            400,
            { error: 'invalid_grant', error_description: 'code_already_used' },
        ],
        [
            new MobileSignInOAuthError('invalid_client', { statusCode: 401 }),
            401,
            { error: 'invalid_client' },
        ],
    ])('maps %s', async (error, status, json) => {
        const { base, close } = await startApp({
            getMobileSignInService: () => ({
                getClientAddress: (req: Request) => getClientAddress(req, true),
                claim: async () => {
                    throw error;
                },
            }),
        });
        try {
            const response = await fetch(`${base}/mobile-sign-in/claim`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            expect(response.status).toBe(status);
            expect(await response.json()).toEqual(json);
        } finally {
            close();
        }
    });

    it('sends Retry-After with a 429', async () => {
        const { base, close } = await startApp({
            getMobileSignInService: () => ({
                getClientAddress: (req: Request) => getClientAddress(req, true),
                claim: async () => {
                    throw new MobileSignInOAuthError('rate_limited', {
                        statusCode: 429,
                        retryAfterSeconds: 17,
                    });
                },
            }),
        });
        try {
            const response = await fetch(`${base}/mobile-sign-in/claim`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
            });
            expect(response.status).toBe(429);
            expect(response.headers.get('retry-after')).toBe('17');
            expect(await response.json()).toEqual({ error: 'rate_limited' });
        } finally {
            close();
        }
    });
});

describe('POST /api/v1/oauth/token with a mobile sign-in code', () => {
    it.each([
        [
            new MobileSignInOAuthError('invalid_grant', {
                description: 'wrong_number',
            }),
            400,
            { error: 'invalid_grant', error_description: 'wrong_number' },
            null,
        ],
        [
            new MobileSignInOAuthError('access_denied', {
                description: 'managed_sign_in_required',
            }),
            400,
            {
                error: 'access_denied',
                error_description: 'managed_sign_in_required',
            },
            null,
        ],
        [
            new MobileSignInOAuthError('authorization_pending'),
            400,
            { error: 'authorization_pending' },
            null,
        ],
        [
            new MobileSignInOAuthError('rate_limited', {
                statusCode: 429,
                retryAfterSeconds: 9,
            }),
            429,
            { error: 'rate_limited' },
            '9',
        ],
    ])(
        'answers %s with its own status',
        async (error, status, json, retryAfter) => {
            const { base, close } = await startApp({
                getOauthService: () => ({
                    token: async () => {
                        throw new MobileSignInGrantError(error);
                    },
                }),
            });
            try {
                const response = await fetch(`${base}/token`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                    },
                    body: 'grant_type=x',
                });
                expect(response.status).toBe(status);
                expect(response.headers.get('retry-after')).toBe(retryAfter);
                expect(await response.json()).toEqual(json);
            } finally {
                close();
            }
        },
    );
});
