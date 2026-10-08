import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    startStub,
    type SnowflakeAiStub,
} from '../../../../../api-tests/stub/snowflake-ai-stub';

const settings = vi.hoisted(() => ({ url: '' }));
vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'http://lightdash.example',
            license: { licenseKey: 'test-license' },
            auth: {
                snowflakeAi: {
                    account: 'stub',
                    clientId: 'stub-client',
                    clientSecret: 'stub-secret',
                    authorizationEndpoint: `${settings.url}/oauth/authorize`,
                    tokenEndpoint: `${settings.url}/oauth/token-request`,
                    callbackPath: '/oauth/redirect/snowflake-ai',
                },
            },
        },
    };
});

type Strategy = NonNullable<
    (typeof import('./snowflakeAiStrategy'))['snowflakeAiPassportStrategy']
>;

describe('Snowflake AI strategy against the real OAuth and SDK stub', () => {
    let stub: SnowflakeAiStub;
    let strategy: Strategy;
    beforeAll(async () => {
        vi.unstubAllGlobals();
        stub = await startStub();
        settings.url = stub.url;
        strategy = (await import('./snowflakeAiStrategy'))
            .snowflakeAiPassportStrategy!;
    });
    afterAll(async () => {
        await stub?.close();
    });

    const signIn = async (code?: string) => {
        const instance = Object.create(strategy);
        const session = {};
        const user = { userUuid: 'user-uuid', organizationUuid: 'org-uuid' };
        const upsertAiSnowflakeCredential = vi.fn<
            (
                user: unknown,
                refreshToken: string,
                expiresAt: Date | null,
            ) => Promise<void>
        >(async () => undefined);
        const assertFeatureEnabled = vi.fn(async () => undefined);
        const authorizeUrl = await new Promise<string>((resolve, reject) => {
            instance.redirect = resolve;
            instance.error = reject;
            instance.authenticate(
                { query: {}, session },
                { scope: ['refresh_token'] },
            );
        });
        const authorize = await fetch(authorizeUrl, { redirect: 'manual' });
        expect(authorize.status).toBe(302);
        const callbackUrl = new URL(authorize.headers.get('location')!);
        if (code) callbackUrl.searchParams.set('code', code);
        const result = await new Promise<{
            error: unknown;
            authenticatedUser?: unknown;
        }>((resolve) => {
            instance.success = (authenticatedUser: unknown) =>
                resolve({ error: null, authenticatedUser });
            instance.error = (error: unknown) => resolve({ error });
            instance.fail = (error: unknown) => resolve({ error });
            instance.authenticate({
                query: Object.fromEntries(callbackUrl.searchParams),
                session,
                user,
                services: {
                    getAiAccessService: () => ({ assertFeatureEnabled }),
                    getUserService: () => ({ upsertAiSnowflakeCredential }),
                },
            });
        });
        return {
            ...result,
            user,
            upsertAiSnowflakeCredential,
            assertFeatureEnabled,
        };
    };

    it('exchanges the auto-approved code, verifies the session, and rotates refresh tokens', async () => {
        const before = Date.now();
        const result = await signIn();
        expect(result.error).toBeNull();
        expect(result.authenticatedUser).toEqual(result.user);
        expect(result.assertFeatureEnabled).toHaveBeenCalledExactlyOnceWith(
            result.user,
        );
        expect(
            result.upsertAiSnowflakeCredential,
        ).toHaveBeenCalledExactlyOnceWith(
            result.user,
            expect.stringMatching(/^refresh-/),
            expect.any(Date),
        );
        const expiresAt = result.upsertAiSnowflakeCredential.mock.calls[0][2]!;
        expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7776000000);
        expect(expiresAt.getTime()).toBeLessThanOrEqual(
            Date.now() + 7776000000,
        );
        const refreshToken =
            result.upsertAiSnowflakeCredential.mock.calls[0][1];
        const refreshed = await fetch(`${stub.url}/oauth/token-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from('stub-client:stub-secret').toString('base64')}`,
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }),
        });
        expect(refreshed.status).toBe(200);
        const tokens = (await refreshed.json()) as { refresh_token: string };
        expect(tokens).toMatchObject({
            access_token: expect.stringMatching(/^agent-/),
            refresh_token: expect.stringMatching(/^refresh-/),
            token_type: 'Bearer',
            expires_in: 600,
            refresh_token_expires_in: 7776000,
            scope: 'refresh_token',
            username: 'stub',
        });
        expect(tokens.refresh_token).not.toBe(refreshToken);
    });

    it.each(['expiring-code', 'revoking-code'])(
        'stores the expiry and token returned for %s',
        async (code) => {
            const before = Date.now();
            const result = await signIn(code);
            expect(result.error).toBeNull();
            const [, refreshToken, expiresAt] =
                result.upsertAiSnowflakeCredential.mock.calls[0];
            const lifetime = code === 'expiring-code' ? 1000 : 7776000000;
            expect(expiresAt!.getTime()).toBeGreaterThanOrEqual(
                before + lifetime,
            );
            expect(expiresAt!.getTime()).toBeLessThanOrEqual(
                Date.now() + lifetime,
            );
            if (code === 'revoking-code') {
                expect(refreshToken).toMatch(/^revoked/);
                const refreshed = await fetch(
                    `${stub.url}/oauth/token-request`,
                    {
                        method: 'POST',
                        body: new URLSearchParams({
                            grant_type: 'refresh_token',
                            refresh_token: refreshToken,
                        }),
                    },
                );
                expect(refreshed.status).toBe(400);
                expect(await refreshed.json()).toEqual({
                    error: 'invalid_grant',
                });
            }
        },
    );

    it('refuses a non-agent OAuth session without saving credentials', async () => {
        const result = await signIn('plain-code');
        expect(result.error).toMatchObject({
            name: 'ForbiddenError',
            message: expect.stringContaining('not an agent session'),
        });
        expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
    });

    it('refuses a revoked authorization code without saving credentials', async () => {
        const result = await signIn('revoked-code');
        expect(result.error).toMatchObject({ code: 'invalid_grant' });
        expect(result.upsertAiSnowflakeCredential).not.toHaveBeenCalled();
        const refreshed = await fetch(`${stub.url}/oauth/token-request`, {
            method: 'POST',
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: 'revoked-refresh',
            }),
        });
        expect(refreshed.status).toBe(400);
        expect(await refreshed.json()).toEqual({ error: 'invalid_grant' });
    });
});
