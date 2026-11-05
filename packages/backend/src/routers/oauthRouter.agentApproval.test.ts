import { JWT_HEADER_NAME } from '@lightdash/common';
import express from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import fetch from 'node-fetch';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { type AddressInfo } from 'node:net';
import { fromSession } from '../auth/account/account';
import { defaultSessionUser } from '../auth/account/account.mock';
import { lightdashConfig } from '../config/lightdashConfig';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    AGENT_CONNECTION_REQUEST_PATH,
    parseAgentConnectionApprovalBody,
} from '../controllers/authentication/agentConnectionApproval';
import { RegisterRoutes } from '../generated/routes';
import Logger from '../logging/logger';
import { jwtAuthMiddleware } from '../middlewares/jwtAuthMiddleware';
import { AgentConnectionApprovalRequestError } from '../models/AgentConnectionApprovalRequestModel';
import { AgentConnectionGrantModel } from '../models/AgentConnectionGrantModel';
import { ModelRepository } from '../models/ModelRepository';
import { OAuth2Model } from '../models/OAuth2Model';
import { OAuthService } from '../services/OAuthService/OAuthService';
import { ServiceRepository } from '../services/ServiceRepository';
import oauthRouter from './oauthRouter';

vi.mock('../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...config,
            auth: {
                ...config.auth,
                pat: { ...config.auth.pat, enabled: true },
            },
        },
    };
});

const body = {
    clientId: 'lightdash-cli',
    name: 'review',
    projects: null,
    capabilities: [],
    expiresInSeconds: 86400,
    redirectUri: 'http://localhost:32123/callback',
    state: 's'.repeat(43),
    codeChallenge: 'c'.repeat(43),
    codeChallengeMethod: 'S256',
    resource: lightdashConfigMock.siteUrl,
};
const requestUuid = '11111111-1111-4111-8111-111111111111';
const fixture = async () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const writes: string[] = [];
    const records: Record<string, unknown>[] = [];
    tracker.on.insert(/.*/).response((query) => {
        writes.push(query.sql);
        const columns = query.sql
            .match(/\(([^)]+)\) values/)![1]
            .split(',')
            .map((column) => column.trim().replaceAll('"', ''));
        const literalColumns = columns.filter(
            (column) =>
                column !== 'created_at' && column !== 'request_expires_at',
        );
        const record = Object.fromEntries(
            literalColumns.map((column, i) => [column, query.bindings[i]]),
        );
        records.push(record);
        return [
            {
                ...record,
                agent_connection_approval_request_uuid: requestUuid,
                request_expires_at: new Date(Date.now() + 900000),
            },
        ];
    });
    tracker.on.select('agent_connection_approval_requests').response([]);
    tracker.on
        .select('users')
        .response({ user_uuid: defaultSessionUser.userUuid });
    tracker.on.select('oauth2_clients').response({
        client_id: 'lightdash-cli',
        grants: ['authorization_code', 'refresh_token'],
        redirect_uris: ['http://localhost/callback'],
        scopes: ['read'],
    });
    const logs = ['info', 'warn', 'error', 'debug'].map((level) =>
        vi.spyOn(Logger, level as 'info').mockImplementation(() => Logger),
    );
    vi.spyOn(Logger, 'child').mockReturnValue(Logger);
    const create = vi.spyOn(AgentConnectionGrantModel.prototype, 'create');
    const replace = vi.spyOn(AgentConnectionGrantModel.prototype, 'replace');
    const saveCode = vi.spyOn(OAuth2Model.prototype, 'saveAuthorizationCode');
    const saveToken = vi.spyOn(OAuth2Model.prototype, 'saveToken');
    const authorize = vi.spyOn(OAuthService.prototype, 'authorize');
    const models = new ModelRepository({
        database,
        lightdashConfig: lightdashConfigMock,
        utils: { getEncryptionUtil: () => ({}) } as never,
    });
    const flag = vi
        .spyOn(models.getFeatureFlagModel(), 'get')
        .mockResolvedValue({ enabled: true } as never);
    vi.spyOn(
        models.getUserModel(),
        'findSessionUserAndOrgByUuid',
    ).mockResolvedValue(defaultSessionUser);
    const services = new ServiceRepository({
        context: { lightdashConfig: lightdashConfigMock } as never,
        clients: {} as never,
        models,
        utils: {} as never,
    });
    services.getAgentConnectionApprovalService();
    const ordinaryService = vi.spyOn(services, 'getOauthService');
    const pat = vi.fn().mockResolvedValue(defaultSessionUser);
    vi.spyOn(services, 'getUserService').mockReturnValue({
        loginWithPersonalAccessToken: pat,
    } as never);
    const app = express();
    app.post(AGENT_CONNECTION_REQUEST_PATH, parseAgentConnectionApprovalBody);
    app.use(express.json());
    app.use((req, _res, next) => {
        req.services = services;
        const mode = req.get('x-test-auth') ?? 'session';
        if (mode !== 'signed-out') {
            req.user = defaultSessionUser;
            req.account = fromSession(defaultSessionUser, 'approval-session');
            if (
                mode === 'service-account' ||
                mode === 'embed' ||
                mode === 'oauth'
            )
                req.account = {
                    ...req.account,
                    authentication: {
                        type: {
                            'service-account': 'service-account',
                            embed: 'jwt',
                            oauth: 'oauth',
                        }[mode],
                    },
                } as never;
            if (
                mode !== 'populated-user' &&
                mode !== 'service-account' &&
                mode !== 'embed' &&
                mode !== 'oauth'
            ) {
                req.sessionID = 'approval-session';
                req.session = {
                    passport: { user: defaultSessionUser.userUuid },
                } as never;
            }
        }
        req.isAuthenticated = (() =>
            Boolean(req.user)) as typeof req.isAuthenticated;
        next();
    });
    app.use(jwtAuthMiddleware);
    app.use('/api/v1/oauth', oauthRouter);
    RegisterRoutes(app);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (
        input: unknown = body,
        headers: Record<string, string> = {},
    ) =>
        fetch(`${base}${AGENT_CONNECTION_REQUEST_PATH}`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                origin: lightdashConfigMock.siteUrl,
                ...headers,
            },
            body: typeof input === 'string' ? input : JSON.stringify(input),
        });
    return {
        post,
        records,
        writes,
        flag,
        pat,
        models,
        services,
        base,
        noIssuance: () => {
            expect(ordinaryService).not.toHaveBeenCalled();
            expect(
                JSON.stringify(logs.flatMap((log) => log.mock.calls)),
            ).not.toMatch(/pat-sentinel|proxy-sentinel|verifier-sentinel/);
            for (const spy of [create, replace, saveCode, saveToken, authorize])
                expect(spy).not.toHaveBeenCalled();
            expect(
                writes.filter((sql) =>
                    /agent_connection_grants|oauth2_(authorization_codes|access_tokens|refresh_tokens)/.test(
                        sql,
                    ),
                ),
            ).toEqual([]);
        },
        close: async () => {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
            vi.restoreAllMocks();
            tracker.reset();
            await database.destroy();
        },
    };
};

it('creates exactly one pending row through the real registered route and never issues', async () => {
    const f = await fixture();
    try {
        const response = await f.post();
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({
            status: 'ok',
            results: {
                authorizationUrl: `${body.resource}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                issuer: body.resource,
                resource: body.resource,
                expiresAt: expect.any(String),
            },
        });
        expect(f.writes).toHaveLength(1);
        expect(f.writes[0]).toMatch(
            /^insert into "agent_connection_approval_requests"/,
        );
        expect(f.records[0]).toMatchObject({
            client_id: 'lightdash-cli',
            subject_user_uuid: defaultSessionUser.userUuid,
            organization_uuid: defaultSessionUser.organizationUuid,
        });
        expect(f.records[0]).not.toHaveProperty('decision_consumed_at');
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it('accepts a personal access token without a browser origin', async () => {
    const f = await fixture();
    try {
        const response = await f.post(body, {
            'x-test-auth': 'signed-out',
            authorization: 'ApiKey pat-sentinel',
            origin: '',
        });
        expect(response.status).toBe(200);
        expect(f.pat).toHaveBeenCalledWith('pat-sentinel', expect.any(Object));
        expect(JSON.stringify(f.records)).not.toContain('pat-sentinel');
        expect(await response.text()).not.toContain('pat-sentinel');
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it.each([
    [{ 'x-test-auth': 'signed-out' }, 401, 'authentication_required'],
    [{ 'x-test-auth': 'populated-user' }, 401, 'authentication_required'],
    [{ 'x-test-auth': 'service-account' }, 403, 'person_required'],
    [{ 'x-test-auth': 'embed' }, 403, 'person_required'],
    [{ 'x-test-auth': 'oauth' }, 403, 'person_required'],
    [{ authorization: 'Bearer oauth-sentinel' }, 403, 'person_required'],
    [
        {
            authorization: 'Bearer bound-oauth-sentinel',
            'x-test-auth': 'signed-out',
        },
        403,
        'person_required',
    ],
    [{ authorization: 'ApiKey pat-sentinel' }, 403, 'person_required'],
    [
        { authorization: 'ApiKey a, ApiKey b', 'x-test-auth': 'signed-out' },
        403,
        'person_required',
    ],
    [{ 'x-api-key': 'proxy-sentinel' }, 403, 'person_required'],
    [{ origin: 'https://untrusted.example' }, 403, 'csrf_failed'],
    [{ origin: '' }, 403, 'csrf_failed'],
    [{ origin: 'null' }, 403, 'csrf_failed'],
] as const)(
    'rejects untrusted authentication/origin %j',
    async (headers, status, code) => {
        const f = await fixture();
        try {
            const response = await f.post(body, headers);
            expect(response.status).toBe(status);
            expect(await response.json()).toMatchObject({
                status: 'error',
                error: {
                    statusCode: status,
                    name: 'AgentConnectionApprovalError',
                    code,
                },
            });
            expect(f.records).toEqual([]);
            expect(f.pat).not.toHaveBeenCalled();
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it.each(['invalid-json', 'oversized', 'extra-field', 'wrong-type'])(
    'serializes %s at the route boundary',
    async (kind) => {
        const f = await fixture();
        try {
            const inputs = {
                'invalid-json': '{',
                oversized: `${' '.repeat(65536)}${JSON.stringify(body)}`,
                'extra-field': { ...body, codeVerifier: 'verifier-sentinel' },
                'wrong-type': { ...body, expiresInSeconds: '86400' },
            };
            const response = await f.post(inputs[kind as keyof typeof inputs]);
            expect(response.status).toBe(422);
            const payload = await response.text();
            expect(payload).toContain('"code":"invalid_approval_request"');
            expect(payload).not.toContain('verifier-sentinel');
            expect(f.records).toEqual([]);
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it('returns the feature-disabled error without writing', async () => {
    const f = await fixture();
    try {
        f.flag.mockResolvedValue({ enabled: false } as never);
        const response = await f.post();
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
            error: { code: 'agent_identity_disabled' },
        });
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it('serializes the pending cap and Retry-After through the registered route', async () => {
    const f = await fixture();
    try {
        vi.spyOn(
            f.models.getAgentConnectionApprovalRequestModel(),
            'insertPending',
        ).mockRejectedValue(
            new AgentConnectionApprovalRequestError(
                'pending_request_limit',
                123,
            ),
        );
        const response = await f.post();
        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('123');
        expect(await response.json()).toMatchObject({
            error: { code: 'pending_request_limit' },
        });
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it('refuses an invalid personal access token without falling back to a session', async () => {
    const f = await fixture();
    try {
        f.pat.mockRejectedValue(new Error('pat-sentinel'));
        const response = await f.post(body, {
            'x-test-auth': 'signed-out',
            authorization: 'ApiKey pat-sentinel',
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({
            error: { code: 'authentication_required' },
        });
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it.each(['http://127.0.0.1:32123/callback', 'http://[::1]:32123/callback'])(
    'does not expand the registered loopback host to %s',
    async (redirectUri) => {
        const f = await fixture();
        try {
            const response = await f.post({ ...body, redirectUri });
            expect(response.status).toBe(422);
            expect(await response.json()).toMatchObject({
                error: { code: 'invalid_approval_request' },
            });
            expect(f.records).toEqual([]);
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it.each(['approve', 'deny'] as const)(
    '%s through the real registered review, decision and completion routes never issues',
    async (decision) => {
        const f = await fixture();
        try {
            expect((await f.post()).status).toBe(200);
            const model = f.models.getAgentConnectionApprovalRequestModel();
            const projectUuid = '22222222-2222-4222-8222-222222222222';
            const row = {
                ...f.records[0],
                agent_connection_approval_request_uuid: requestUuid,
                request_expires_at: new Date(Date.now() + 900000),
                requested_projects: [projectUuid],
                requested_capabilities: [],
                displayed_selection: null,
                decision_consumed_at: null,
                callback_consumed_at: null,
                terminal_error: null,
                review_revision: 0,
            };
            vi.spyOn(model, 'findOwned').mockImplementation(
                async () => row as never,
            );
            vi.spyOn(model, 'bindReview').mockImplementation(async (args) => {
                Object.assign(row, {
                    displayed_selection: args.selection,
                    review_revision: 1,
                });
                return row as never;
            });
            vi.spyOn(model, 'sealDecision').mockImplementation(async (args) => {
                const sealed = await args.decide(row as never, {} as never);
                Object.assign(row, {
                    decision_consumed_at: new Date(),
                    terminal_error:
                        sealed.decision === 'approve'
                            ? 'agent_connections_unavailable'
                            : 'access_denied',
                });
                return row as never;
            });
            vi.spyOn(model, 'consumeCallback').mockImplementation(
                async () => row as never,
            );
            vi.spyOn(
                f.services.getAgentConnectionApprovalService(),
                'getReviewAnswer',
            ).mockResolvedValue([
                {
                    projectUuid,
                    name: 'Project',
                    selectable: true,
                    reason: null,
                    capabilities: [],
                },
            ]);
            const handoff = await fetch(
                `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                { redirect: 'manual' },
            );
            expect(handoff.status).toBe(302);
            const path = `${f.base}${AGENT_CONNECTION_REQUEST_PATH}/${requestUuid}`;
            const reviewResponse = await fetch(path);
            expect(reviewResponse.status).toBe(200);
            const review = (await reviewResponse.json()).results;
            expect(review.notice).toBe(
                'Review only. No connection will be created.',
            );
            const response = await fetch(`${path}/decision`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    origin: lightdashConfigMock.siteUrl,
                },
                body: JSON.stringify({
                    decision,
                    revision: review.revision,
                    nonce: review.nonce,
                    projectUuids: [projectUuid],
                    capabilities: [],
                }),
            });
            expect(response.status).toBe(200);
            const completionUrl = new URL(
                (await response.json()).results.completionUrl,
            );
            const completion = await fetch(
                `${f.base}${completionUrl.pathname}`,
                { redirect: 'manual' },
            );
            expect(completion.status).toBe(302);
            const target = new URL(completion.headers.get('location')!);
            expect(`${target.origin}${target.pathname}`).toBe(body.redirectUri);
            expect(Object.fromEntries(target.searchParams)).toEqual({
                error:
                    decision === 'approve'
                        ? 'agent_connections_unavailable'
                        : 'access_denied',
                state: body.state,
                iss: body.resource,
            });
            for (const result of [reviewResponse, response, completion])
                expect(result.headers.get('cache-control')).toBe('no-store');
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it('hands a valid request to the frontend through the real GET authorize route without writes', async () => {
    const f = await fixture();
    try {
        const row = {
            agent_connection_approval_request_uuid: requestUuid,
            subject_user_uuid: defaultSessionUser.userUuid,
            organization_uuid: defaultSessionUser.organizationUuid,
            decision_consumed_at: null,
            callback_consumed_at: null,
        };
        const find = vi
            .spyOn(
                f.models.getAgentConnectionApprovalRequestModel(),
                'findOwned',
            )
            .mockResolvedValue(row as never);
        const response = await fetch(
            `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
            { redirect: 'manual' },
        );
        expect(response.status).toBe(302);
        expect(
            new URL(response.headers.get('location')!).pathname +
                new URL(response.headers.get('location')!).search,
        ).toBe(`/agent/connection-approval?request=${requestUuid}`);
        expect(find).toHaveBeenCalledExactlyOnceWith({
            requestUuid,
            organizationUuid: defaultSessionUser.organizationUuid,
            subjectUserUuid: defaultSessionUser.userUuid,
        });
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it.each(['GET', 'POST'])(
    'refuses every failed %s hand-off without ordinary authorization',
    async (method) => {
        const f = await fixture();
        try {
            const find = vi.spyOn(
                f.models.getAgentConnectionApprovalRequestModel(),
                'findOwned',
            );
            await (
                [
                    'approval_request_not_found',
                    'approval_request_expired',
                    'approval_forbidden',
                    'approval_request_consumed',
                ] as const
            ).reduce(async (previous, code) => {
                await previous;
                find.mockRejectedValue(
                    new AgentConnectionApprovalRequestError(code),
                );
                const response = await fetch(
                    `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                    { method, redirect: 'manual' },
                );
                expect(response.status).toBe(
                    {
                        approval_request_not_found: 404,
                        approval_request_expired: 410,
                        approval_forbidden: 403,
                        approval_request_consumed: 409,
                    }[code],
                );
                expect(await response.json()).toMatchObject({
                    error: { code },
                });
            }, Promise.resolve());
            await Promise.all(
                [
                    `agent_request=${requestUuid}&agent_request=${requestUuid}`,
                    `agent_request=${requestUuid}&redirect_uri=http://localhost:32123/callback`,
                    `agent_request=${requestUuid}&state=attacker`,
                    'agent_request=unknown',
                ].map(async (query) => {
                    const response = await fetch(
                        `${f.base}/api/v1/oauth/authorize?${query}`,
                        { method, redirect: 'manual' },
                    );
                    expect(response.status).toBe(422);
                }),
            );
            expect(f.records).toEqual([]);
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it.each(['GET', 'POST'])(
    'refuses a consumed row returned by findOwned for %s',
    async (method) => {
        const f = await fixture();
        try {
            vi.spyOn(
                f.models.getAgentConnectionApprovalRequestModel(),
                'findOwned',
            ).mockResolvedValue({
                decision_consumed_at: new Date(),
                callback_consumed_at: null,
            } as never);
            const response = await fetch(
                `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                { method, redirect: 'manual' },
            );
            expect(response.status).toBe(409);
            expect(await response.json()).toMatchObject({
                error: { code: 'approval_request_consumed' },
            });
            expect(f.records).toEqual([]);
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it.each(['signed-out', 'populated-user'])(
    'requires a passport browser session for %s and returns only the opaque URL through login',
    async (mode) => {
        const f = await fixture();
        try {
            const find = vi.spyOn(
                f.models.getAgentConnectionApprovalRequestModel(),
                'findOwned',
            );
            const response = await fetch(
                `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                { headers: { 'x-test-auth': mode }, redirect: 'manual' },
            );
            expect(response.status).toBe(302);
            const location = new URL(response.headers.get('location')!);
            expect(location.pathname).toBe('/login');
            expect(location.searchParams.get('redirect')).toBe(
                `/api/v1/oauth/authorize?agent_request=${requestUuid}`,
            );
            expect(find).not.toHaveBeenCalled();
            expect(f.records).toEqual([]);
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it('accepts POST with only the opaque request body and refuses a duplicated query/body locator', async () => {
    const f = await fixture();
    try {
        vi.spyOn(
            f.models.getAgentConnectionApprovalRequestModel(),
            'findOwned',
        ).mockResolvedValue({
            decision_consumed_at: null,
            callback_consumed_at: null,
        } as never);
        await Promise.all(
            [false, true].map(async (duplicate) => {
                const response = await fetch(
                    `${f.base}/api/v1/oauth/authorize${duplicate ? `?agent_request=${requestUuid}` : ''}`,
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ agent_request: requestUuid }),
                        redirect: 'manual',
                    },
                );
                expect(response.status).toBe(duplicate ? 422 : 302);
            }),
        );
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it('fails closed if the authorize flag lookup throws', async () => {
    const f = await fixture();
    try {
        f.flag.mockRejectedValue(new Error('lookup failed'));
        const response = await fetch(
            `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
            { redirect: 'manual' },
        );
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({
            error: { code: 'internal_error' },
        });
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it('carries an opaque signed-out login through a default-off instance for a scoped rollout', async () => {
    const f = await fixture();
    try {
        f.flag.mockResolvedValue({ enabled: false } as never);
        const response = await fetch(
            `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
            { headers: { 'x-test-auth': 'signed-out' }, redirect: 'manual' },
        );
        expect(response.status).toBe(302);
        expect(
            new URL(response.headers.get('location')!).searchParams.get(
                'redirect',
            ),
        ).toBe(`/api/v1/oauth/authorize?agent_request=${requestUuid}`);
        expect(f.records).toEqual([]);
        f.noIssuance();
    } finally {
        await f.close();
    }
});

it.each(
    ['create', 'review', 'decision', 'completion', 'authorize'].flatMap(
        (route) =>
            [
                [JWT_HEADER_NAME, 'embed-sentinel'],
                [JWT_HEADER_NAME, ''],
                [
                    'Authorization',
                    '',
                    'Authorization',
                    'Bearer credential-sentinel',
                ],
            ].map((credentialHeaders) => ({ route, credentialHeaders })),
    ),
)(
    'refuses credential ambiguity on $route: $credentialHeaders',
    async ({ route, credentialHeaders }) => {
        const f = await fixture();
        try {
            const paths: Record<string, string> = {
                create: AGENT_CONNECTION_REQUEST_PATH,
                authorize: `/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                review: `${AGENT_CONNECTION_REQUEST_PATH}/${requestUuid}`,
                decision: `${AGENT_CONNECTION_REQUEST_PATH}/${requestUuid}/decision`,
                completion: `${AGENT_CONNECTION_REQUEST_PATH}/${requestUuid}/completion`,
            };
            const path = paths[route];
            const method =
                route === 'create' || route === 'decision' ? 'POST' : 'GET';
            {
                const result = await new Promise<{
                    status: number;
                    body: string;
                }>((resolve, reject) => {
                    const call = httpRequest(
                        `${f.base}${path}`,
                        {
                            method,
                            headers: [
                                'Host',
                                new URL(f.base).host,
                                'Content-Type',
                                'application/json',
                                'Origin',
                                new URL(lightdashConfigMock.siteUrl).origin,
                                'Cookie',
                                'connect.sid=session-sentinel',
                                ...credentialHeaders,
                            ],
                        },
                        (response) => {
                            const chunks: Buffer[] = [];
                            response.on('data', (chunk: Buffer) =>
                                chunks.push(chunk),
                            );
                            response.on('end', () =>
                                resolve({
                                    status: response.statusCode!,
                                    body: Buffer.concat(chunks).toString(),
                                }),
                            );
                        },
                    );
                    call.on('error', reject);
                    call.end(
                        method === 'POST' ? JSON.stringify(body) : undefined,
                    );
                });
                expect({
                    route,
                    credentialHeaders,
                    status: result.status,
                }).toEqual({ route, credentialHeaders, status: 403 });
            }
            expect(f.pat).not.toHaveBeenCalled();
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it.each(['signed-out', 'service-account', 'embed', 'oauth'])(
    'refuses an existing %s principal or actual embed header before PAT replacement',
    async (mode) => {
        const f = await fixture();
        try {
            const response = await f.post(body, {
                'x-test-auth': mode,
                authorization: 'ApiKey pat-sentinel',
                ...(mode === 'signed-out'
                    ? { [JWT_HEADER_NAME]: 'embed-sentinel' }
                    : {}),
            });
            expect(response.status).toBe(403);
            expect(f.pat).not.toHaveBeenCalled();
            expect(f.records).toEqual([]);
            f.noIssuance();
        } finally {
            await f.close();
        }
    },
);

it.each(['session', 'signed-out'])(
    'keeps the canonical instance sub-path for a %s hand-off',
    async (mode) => {
        const previous = lightdashConfig.siteUrl;
        lightdashConfig.siteUrl = 'https://example.test/team///';
        const f = await fixture();
        try {
            vi.spyOn(
                f.models.getAgentConnectionApprovalRequestModel(),
                'findOwned',
            ).mockResolvedValue({
                agent_connection_approval_request_uuid: requestUuid,
                subject_user_uuid: defaultSessionUser.userUuid,
                organization_uuid: defaultSessionUser.organizationUuid,
                decision_consumed_at: null,
                callback_consumed_at: null,
            } as never);
            const response = await fetch(
                `${f.base}/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                {
                    headers: { 'x-test-auth': mode },
                    redirect: 'manual',
                },
            );
            expect(response.status).toBe(302);
            const location = new URL(response.headers.get('location')!);
            if (mode === 'session') {
                expect(location.pathname + location.search).toBe(
                    `/team/agent/connection-approval?request=${requestUuid}`,
                );
            } else {
                expect(location.pathname).toBe('/team/login');
                expect(location.searchParams.get('redirect')).toBe(
                    `/team/api/v1/oauth/authorize?agent_request=${requestUuid}`,
                );
            }
            f.noIssuance();
        } finally {
            lightdashConfig.siteUrl = previous;
            await f.close();
        }
    },
);
