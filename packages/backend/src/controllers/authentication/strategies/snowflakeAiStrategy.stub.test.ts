import {
    AgentIdentityConnectEntryPoint,
    AgentIdentityConnectFailureReason,
    WarehouseTypes,
} from '@lightdash/common';
import { type Request, type Response } from 'express';
import passport from 'passport';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    startStub,
    type SnowflakeAiStub,
} from '../../../../../api-tests/stub/snowflake-ai-stub';
import { snowflakeAgentClientMock } from '../../../services/AiAccessService/SnowflakeAgentClientResolver.mock';

const settings = vi.hoisted(() => ({ url: '' }));
vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'http://lightdash.example',
            license: { licenseKey: 'test-license' },
        },
    };
});

type Strategy = ReturnType<
    (typeof import('./snowflakeAiStrategy'))['createSnowflakeAiPassportStrategy']
>;
const resolvedClient = () => ({
    ...snowflakeAgentClientMock,
    account: 'stub',
    clientId: 'stub-client',
    clientSecret: 'stub-secret',
    accessUrl: settings.url,
    authorizationEndpoint: `${settings.url}/oauth/authorize`,
    tokenEndpoint: `${settings.url}/oauth/token-request`,
});

describe('Snowflake AI strategy against the real OAuth and SDK stub', () => {
    let stub: SnowflakeAiStub;
    let strategy: Strategy;
    beforeAll(async () => {
        vi.unstubAllGlobals();
        stub = await startStub();
        settings.url = stub.url;
        const { AiAccessService } =
            await import('../../../services/AiAccessService/AiAccessService');
        vi.spyOn(
            AiAccessService.prototype,
            'resolveSnowflakeAgentClient',
        ).mockImplementation(async () => resolvedClient());
        strategy = (
            await import('./snowflakeAiStrategy')
        ).createSnowflakeAiPassportStrategy(resolvedClient());
    });
    afterAll(async () => {
        await stub?.close();
        vi.restoreAllMocks();
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
                    getAiAccessService: () => ({
                        assertFeatureEnabled,
                        resolveSnowflakeAgentClient: async () =>
                            resolvedClient(),
                    }),
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

    it.each([
        ['agent', null],
        ['plain-code', AgentIdentityConnectFailureReason.NOT_AGENT_SESSION],
    ])(
        'records the %s outcome through the login handlers',
        async (code, failureReason) => {
            const {
                storeAgentConnectAttempt,
                authenticateAgentConnect,
                agentConnectCallback,
            } = await import('../agentConnectAnalytics');
            const { storeAgentConnectRedirect } =
                await import('../agentConnectRedirect');
            const { AiAccessService } =
                await import('../../../services/AiAccessService/AiAccessService');
            const analytics = { track: vi.fn() };
            const service = new AiAccessService({
                agentActionLogModel: {
                    insert: vi.fn().mockResolvedValue(undefined),
                },
                analytics,
                featureFlagModel: {
                    get: vi.fn(async () => ({ enabled: true })),
                },
            } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
            const upsertAiSnowflakeCredential = vi.fn(async () => undefined);
            const req = {
                user: { userUuid: 'user-uuid', organizationUuid: 'org-uuid' },
                query: {
                    entryPoint: AgentIdentityConnectEntryPoint.MCP_CONNECT_LINK,
                    redirect: '/agent-connected',
                },
                session: {},
                services: {
                    getAiAccessService: () => service,
                    getUserService: () => ({ upsertAiSnowflakeCredential }),
                },
            } as unknown as Request;
            const next = vi.fn();
            storeAgentConnectRedirect(req, {} as Response, next);
            await storeAgentConnectAttempt(req, {} as Response, next);
            const attempt = req.agentConnectAttempt!;
            passport.use('snowflake-ai', strategy);
            try {
                const authorizeUrl = await new Promise<string>(
                    (resolve, reject) => {
                        let location = '';
                        authenticateAgentConnect(
                            req,
                            {
                                setHeader: (key: string, value: string) => {
                                    if (key === 'Location') location = value;
                                },
                                end: () => resolve(location),
                            } as unknown as Response,
                            reject,
                        );
                    },
                );
                const authorize = await fetch(authorizeUrl, {
                    redirect: 'manual',
                });
                expect(authorize.status).toBe(302);
                const callbackUrl = new URL(authorize.headers.get('location')!);
                if (code === 'plain-code')
                    callbackUrl.searchParams.set('code', code);
                req.query = Object.fromEntries(callbackUrl.searchParams);
                const redirect = await new Promise<string>(
                    (resolve, reject) => {
                        agentConnectCallback(
                            req,
                            { redirect: resolve } as unknown as Response,
                            reject,
                        );
                    },
                );
                expect(redirect).toBe(
                    `http://lightdash.example/agent-connected${failureReason ? '?error=not_agent_session' : ''}`,
                );
                expect(analytics.track.mock.calls).toEqual([
                    [
                        {
                            userId: 'user-uuid',
                            event: 'agent_identity.connect_started',
                            properties: {
                                ...attempt,
                                warehouseType: WarehouseTypes.SNOWFLAKE,
                            },
                        },
                    ],
                    [
                        {
                            userId: 'user-uuid',
                            event: failureReason
                                ? 'agent_identity.connect_failed'
                                : 'agent_identity.connected',
                            properties: {
                                ...attempt,
                                warehouseType: WarehouseTypes.SNOWFLAKE,
                                failureReason,
                            },
                        },
                    ],
                ]);
                expect(req.session.agentConnectAttempts).toEqual({});
                expect(upsertAiSnowflakeCredential).toHaveBeenCalledTimes(
                    failureReason ? 0 : 1,
                );
            } finally {
                passport.unuse('snowflake-ai');
            }
        },
    );

    it('correlates a denied older start and a successful newer start over HTTP', async () => {
        const {
            storeAgentConnectAttempt,
            authenticateAgentConnect,
            agentConnectCallback,
        } = await import('../agentConnectAnalytics');
        const { storeAgentConnectRedirect } =
            await import('../agentConnectRedirect');
        const { AiAccessService } =
            await import('../../../services/AiAccessService/AiAccessService');
        const analytics = { track: vi.fn() };
        const service = new AiAccessService({
            agentActionLogModel: {
                insert: vi.fn().mockResolvedValue(undefined),
            },
            analytics,
            featureFlagModel: { get: vi.fn(async () => ({ enabled: true })) },
        } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
        const upsertAiSnowflakeCredential = vi.fn(async () => undefined);
        const session = {};
        const start = async (entryPoint: AgentIdentityConnectEntryPoint) => {
            const req = {
                user: { userUuid: 'user-uuid', organizationUuid: 'org-uuid' },
                query: { entryPoint, redirect: '/agent-connected' },
                session,
                services: {
                    getAiAccessService: () => service,
                    getUserService: () => ({ upsertAiSnowflakeCredential }),
                },
            } as unknown as Request;
            storeAgentConnectRedirect(req, {} as Response, vi.fn());
            await storeAgentConnectAttempt(req, {} as Response, vi.fn());
            const attempt = req.agentConnectAttempt!;
            const authorizeUrl = await new Promise<string>(
                (resolve, reject) => {
                    let location = '';
                    authenticateAgentConnect(
                        req,
                        {
                            setHeader: (key: string, value: string) => {
                                if (key === 'Location') location = value;
                            },
                            end: () => resolve(location),
                        } as unknown as Response,
                        reject,
                    );
                },
            );
            const response = await fetch(authorizeUrl, { redirect: 'manual' });
            expect(response.status).toBe(302);
            const callbackUrl = new URL(response.headers.get('location')!);
            return { req, attempt, callbackUrl };
        };
        const callback = (req: Request) =>
            new Promise<string>((resolve, reject) => {
                agentConnectCallback(
                    req,
                    { redirect: resolve } as unknown as Response,
                    reject,
                );
            });
        passport.use('snowflake-ai', strategy);
        try {
            const first = await start(AgentIdentityConnectEntryPoint.CHAT_CARD);
            const second = await start(
                AgentIdentityConnectEntryPoint.MCP_CONNECT_LINK,
            );
            first.req.query = {
                error: 'access_denied',
                state: first.callbackUrl.searchParams.get('state')!,
            };
            expect(await callback(first.req)).toBe(
                'http://lightdash.example/agent-connected?error=sign_in_failed',
            );
            second.req.query = Object.fromEntries(
                second.callbackUrl.searchParams,
            );
            expect(await callback(second.req)).toBe(
                'http://lightdash.example/agent-connected',
            );
            expect(analytics.track.mock.calls.map(([event]) => event)).toEqual([
                ...[first, second].map(({ attempt }) => ({
                    userId: 'user-uuid',
                    event: 'agent_identity.connect_started',
                    properties: {
                        ...attempt,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    },
                })),
                {
                    userId: 'user-uuid',
                    event: 'agent_identity.connect_failed',
                    properties: {
                        ...first.attempt,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                        failureReason:
                            AgentIdentityConnectFailureReason.ACCESS_DENIED,
                    },
                },
                {
                    userId: 'user-uuid',
                    event: 'agent_identity.connected',
                    properties: {
                        ...second.attempt,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                        failureReason: null,
                    },
                },
            ]);
            expect(upsertAiSnowflakeCredential).toHaveBeenCalledOnce();
            expect(second.req.session.agentConnectAttempts).toEqual({});
            await callback(second.req);
            expect(analytics.track).toHaveBeenCalledTimes(4);
            expect(upsertAiSnowflakeCredential).toHaveBeenCalledOnce();
        } finally {
            passport.unuse('snowflake-ai');
        }
    });

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
            { organizationUuid: 'org-uuid', clientVersion: null },
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
