import {
    HYDRA_ACCOUNT_PATH,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_OAUTH_CLIENT_ID,
    HYDRA_OAUTH_CLIENT_SECRET,
    HYDRA_REPORT_PATH,
    type HydraApiSource,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { HYDRA_CODE_TTL_MS } from './oauth';
import { createHydraServer } from './server';

const START = Date.parse('2026-11-23T12:00:00Z');
const REDIRECT = 'https://app.example.com/api/v1/callback';
const VERIFIER = 'a-verifier-that-is-long-enough-for-pkce-0123456789';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

const settingsWith = (
    overrides: Partial<HydraApiSource> = {},
): HydraApiSource => ({ ...HYDRA_DEFAULT_SOURCE, ...overrides });

const buildServer = () => {
    let clock = START;
    const server = createHydraServer({
        now: () => new Date(clock),
        sleep: async (ms) => {
            clock += ms;
        },
        random: () => 0.5,
    });
    const tick = (ms: number) => {
        clock += ms;
    };

    const authorize = ({
        sourceKey = 'source-1',
        settings = settingsWith(),
        subject = 'alice@example.com',
        params = {},
    }: {
        sourceKey?: string;
        settings?: HydraApiSource;
        subject?: string;
        params?: Record<string, string | undefined>;
    } = {}) =>
        server.authorize({
            sourceKey,
            settings,
            subject,
            params: {
                response_type: 'code',
                client_id: HYDRA_OAUTH_CLIENT_ID,
                redirect_uri: REDIRECT,
                state: 'state-1',
                code_challenge: CHALLENGE,
                code_challenge_method: 'S256',
                ...params,
            },
        });

    const getRedirect = (answer: ReturnType<typeof authorize>) => {
        if (answer.kind !== 'redirect') {
            throw new Error(`Expected a redirect, got ${answer.message}`);
        }
        return new URL(answer.location).searchParams;
    };

    const codeFor = (...args: Parameters<typeof authorize>) =>
        getRedirect(authorize(...args)).get('code') ?? '';

    const token = (
        form: Record<string, string>,
        {
            sourceKey = 'source-1',
            settings = settingsWith(),
        }: { sourceKey?: string; settings?: HydraApiSource } = {},
    ) =>
        server.token({
            sourceKey,
            settings,
            form: new URLSearchParams({
                client_id: HYDRA_OAUTH_CLIENT_ID,
                client_secret: HYDRA_OAUTH_CLIENT_SECRET,
                ...form,
            }),
        });

    const exchange = (
        code: string,
        overrides: Record<string, string> = {},
        options: { sourceKey?: string; settings?: HydraApiSource } = {},
    ) =>
        token(
            {
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT,
                code_verifier: VERIFIER,
                ...overrides,
            },
            options,
        );

    const tokensOf = (response: ReturnType<typeof token>) =>
        response.body as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };

    const signIn = (
        subject = 'alice@example.com',
        options: { sourceKey?: string; settings?: HydraApiSource } = {},
    ) => tokensOf(exchange(codeFor({ subject, ...options }), {}, options));

    const refresh = (
        refreshToken: string,
        options: { sourceKey?: string; settings?: HydraApiSource } = {},
    ) =>
        token(
            { grant_type: 'refresh_token', refresh_token: refreshToken },
            options,
        );

    const call = (
        accessToken: string | null,
        {
            sourceKey = 'source-1',
            settings = settingsWith(),
            request = {
                method: 'GET' as const,
                path: HYDRA_ACCOUNT_PATH,
                body: undefined,
            },
        }: {
            sourceKey?: string;
            settings?: HydraApiSource;
            request?: {
                method: 'GET' | 'POST';
                path: string;
                body: unknown;
            };
        } = {},
    ) => server.fetch({ sourceKey, settings, token: accessToken, request });

    return {
        server,
        tick,
        authorize,
        getRedirect,
        codeFor,
        token,
        exchange,
        tokensOf,
        signIn,
        refresh,
        call,
    };
};

const report = (body: Record<string, unknown>) => ({
    method: 'POST' as const,
    path: HYDRA_REPORT_PATH,
    body:
        body.report === 'events'
            ? { startDate: '2026-11-01', endDate: '2026-11-22', ...body }
            : body,
});

describe('Hydra consent screen', () => {
    it('redirects back with a code and the state', () => {
        const { authorize, getRedirect } = buildServer();
        const params = getRedirect(authorize());
        expect(params.get('code')).toMatch(/^hydra-code\./);
        expect(params.get('state')).toBe('state-1');
    });

    it('declines when the settings say so, keeping the state', () => {
        const { authorize, getRedirect } = buildServer();
        const params = getRedirect(
            authorize({ settings: settingsWith({ denyConsent: true }) }),
        );
        expect(params.get('error')).toBe('access_denied');
        expect(params.get('code')).toBeNull();
        expect(params.get('state')).toBe('state-1');
    });

    it('declines a revoked person', () => {
        const { authorize, getRedirect } = buildServer();
        const params = getRedirect(
            authorize({
                settings: settingsWith({
                    revokedViewers: ['alice@example.com'],
                }),
            }),
        );
        expect(params.get('error')).toBe('access_denied');
    });

    it('requires PKCE with S256', () => {
        const { authorize, getRedirect } = buildServer();
        expect(
            getRedirect(
                authorize({ params: { code_challenge: undefined } }),
            ).get('error'),
        ).toBe('invalid_request');
        expect(
            getRedirect(
                authorize({ params: { code_challenge_method: 'plain' } }),
            ).get('error'),
        ).toBe('invalid_request');
    });

    it('refuses an unknown client without redirecting', () => {
        const { authorize } = buildServer();
        expect(authorize({ params: { client_id: 'someone-else' } })).toEqual({
            kind: 'invalid',
            message: 'Unknown client_id',
        });
    });

    it('refuses a redirect URI that is not a URL', () => {
        const { authorize } = buildServer();
        expect(authorize({ params: { redirect_uri: 'not a url' } }).kind).toBe(
            'invalid',
        );
    });
});

describe('Hydra code exchange', () => {
    it('trades a code for a source-bound access and refresh token', () => {
        const { exchange, codeFor, tokensOf } = buildServer();
        const response = exchange(codeFor());
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        const tokens = tokensOf(response);
        expect(tokens.access_token).toMatch(/^hydra-at\./);
        expect(tokens.refresh_token).toMatch(/^hydra-rt\./);
        expect(tokens.expires_in).toBe(3_600);
    });

    it('accepts each code once', () => {
        const { exchange, codeFor } = buildServer();
        const code = codeFor();
        expect(exchange(code).status).toBe(200);
        const replay = exchange(code);
        expect(replay.status).toBe(400);
        expect(replay.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('refuses a code older than a minute', () => {
        const { exchange, codeFor, tick } = buildServer();
        const code = codeFor();
        tick(HYDRA_CODE_TTL_MS + 1);
        expect(exchange(code).body).toMatchObject({
            error: 'invalid_grant',
            error_description: 'The code expired',
        });
    });

    it('refuses a wrong verifier, redirect, source or client secret', () => {
        const { exchange, codeFor, token } = buildServer();
        expect(exchange(codeFor(), { code_verifier: 'wrong' }).status).toBe(
            400,
        );
        expect(
            exchange(codeFor(), { redirect_uri: 'https://evil.example.com' })
                .status,
        ).toBe(400);
        expect(exchange(codeFor(), {}, { sourceKey: 'source-2' }).status).toBe(
            400,
        );
        expect(
            token({
                grant_type: 'authorization_code',
                code: codeFor(),
                client_secret: 'wrong',
            }).body,
        ).toMatchObject({ error: 'invalid_client' });
    });

    it('does not burn a code on a failed exchange', () => {
        const { exchange, codeFor } = buildServer();
        const code = codeFor();
        expect(exchange(code, { code_verifier: 'wrong' }).status).toBe(400);
        expect(exchange(code).status).toBe(200);
    });

    it('refuses a tampered code', () => {
        const { exchange } = buildServer();
        const forged = `hydra-code.${Buffer.from(
            JSON.stringify({ sub: 'mallory' }),
        ).toString('base64url')}`;
        expect(exchange(forged).status).toBe(400);
        expect(exchange('garbage').status).toBe(400);
    });
});

describe('Hydra refresh rotation', () => {
    it('rotates the refresh token on every use', () => {
        const { signIn, refresh, tokensOf } = buildServer();
        const first = signIn();
        const second = tokensOf(refresh(first.refresh_token));
        expect(second.refresh_token).not.toBe(first.refresh_token);
        expect(refresh(second.refresh_token).status).toBe(200);
    });

    it('revokes the whole sign-in when a rotated refresh token comes back', async () => {
        const { signIn, refresh, tokensOf, call } = buildServer();
        const first = signIn();
        const second = tokensOf(refresh(first.refresh_token));
        expect(refresh(first.refresh_token).body).toMatchObject({
            error: 'invalid_grant',
        });
        // The holder of the newest token is signed out too
        expect(refresh(second.refresh_token).status).toBe(400);
        expect((await call(second.access_token)).status).toBe(401);
    });

    it('keeps other sign-ins when one is revoked for reuse', async () => {
        const { signIn, refresh, call } = buildServer();
        const alice = signIn('alice@example.com');
        const bob = signIn('bob@example.com');
        refresh(alice.refresh_token);
        refresh(alice.refresh_token);
        expect((await call(bob.access_token)).status).toBe(200);
    });

    it('refuses a refresh token from another source', () => {
        const { signIn, refresh } = buildServer();
        const tokens = signIn();
        expect(
            refresh(tokens.refresh_token, { sourceKey: 'source-2' }).status,
        ).toBe(400);
    });
});

describe('Hydra calls with a viewer token', () => {
    it('reads the viewer’s own rows, not another viewer’s', async () => {
        const { signIn, call } = buildServer();
        const alice = await call(signIn('alice@example.com').access_token);
        const aliceAgain = await call(signIn('alice@example.com').access_token);
        const bob = await call(signIn('bob@example.com').access_token);
        expect(alice.status).toBe(200);
        expect(alice.body).toEqual(aliceAgain.body);
        expect(alice.body).not.toEqual(bob.body);
    });

    it('refuses a token issued for another source', async () => {
        const { signIn, call } = buildServer();
        const tokens = signIn('alice@example.com', { sourceKey: 'source-1' });
        const response = await call(tokens.access_token, {
            sourceKey: 'source-2',
        });
        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            message: 'The token was issued for another source',
        });
    });

    it('refuses an expired token until it is refreshed', async () => {
        const { signIn, call, tick, refresh, tokensOf } = buildServer();
        const settings = settingsWith({ tokenTtlSeconds: 60 });
        const tokens = signIn('alice@example.com', { settings });
        tick(60_000);
        expect((await call(tokens.access_token, { settings })).status).toBe(
            401,
        );
        const fresh = tokensOf(refresh(tokens.refresh_token, { settings }));
        expect((await call(fresh.access_token, { settings })).status).toBe(200);
    });

    it('revokes one viewer while others keep working', async () => {
        const { signIn, call, refresh } = buildServer();
        const alice = signIn('alice@example.com');
        const bob = signIn('bob@example.com');
        const settings = settingsWith({
            revokedViewers: ['alice@example.com'],
        });
        expect((await call(alice.access_token, { settings })).status).toBe(401);
        expect(refresh(alice.refresh_token, { settings }).status).toBe(400);
        expect((await call(bob.access_token, { settings })).status).toBe(200);
    });

    it('answers 403 only to the viewer who lacks a scope', async () => {
        const { signIn, call } = buildServer();
        const settings = settingsWith({
            viewerScopes: { 'alice@example.com': ['events:read'] },
        });
        const alice = signIn('alice@example.com', { settings });
        const bob = signIn('bob@example.com', { settings });
        const users = report({ report: 'users', metrics: ['user_count'] });
        const refused = await call(alice.access_token, {
            settings,
            request: users,
        });
        expect(refused.status).toBe(403);
        expect(refused.body).toMatchObject({ error: 'insufficient_scope' });
        expect(
            (await call(bob.access_token, { settings, request: users })).status,
        ).toBe(200);
        expect(
            (
                await call(alice.access_token, {
                    settings,
                    request: report({
                        report: 'events',
                        metrics: ['event_count'],
                    }),
                })
            ).status,
        ).toBe(200);
    });

    it('needs revenue:read for the revenue metric', async () => {
        const { signIn, call } = buildServer();
        const settings = settingsWith({
            viewerScopes: { 'alice@example.com': ['events:read'] },
        });
        const alice = signIn('alice@example.com', { settings });
        const response = await call(alice.access_token, {
            settings,
            request: report({ report: 'events', metrics: ['revenue'] }),
        });
        expect(response.status).toBe(403);
    });

    it('keeps reading rows seeded from a shared token', async () => {
        const { call } = buildServer();
        expect((await call('shared-token')).status).toBe(200);
    });

    it('logs whose sign-in made each call, per source', async () => {
        const { server, signIn, call } = buildServer();
        await call(signIn('alice@example.com').access_token);
        await call('shared-token');
        await call('shared-token', { sourceKey: 'source-2' });
        expect(server.getRequestLog('source-1')).toEqual([
            {
                callNumber: 1,
                method: 'GET',
                path: HYDRA_ACCOUNT_PATH,
                subject: 'alice@example.com',
            },
            {
                callNumber: 2,
                method: 'GET',
                path: HYDRA_ACCOUNT_PATH,
                subject: null,
            },
        ]);
        server.reset('source-1');
        expect(server.getRequestLog('source-1')).toEqual([]);
        expect(server.getRequestLog('source-2')).toHaveLength(1);
    });
});
