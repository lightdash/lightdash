import { Ability } from '@casl/ability';
import {
    AiAccessRefusalReason,
    AgentCapability as C,
    LightdashMode,
    type SessionUser,
} from '@lightdash/common';
import express from 'express';
import fetch, { type RequestInit } from 'node-fetch';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type AddressInfo } from 'node:net';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    AGENT_CONNECTION_REQUEST_PATH,
    parseAgentConnectionApprovalBody,
} from '../../../controllers/authentication/agentConnectionApproval';
import { RegisterRoutes } from '../../../generated/routes';
import Logger from '../../../logging/logger';
import {
    expressWinstonMiddleware,
    expressWinstonPreResponseMiddleware,
} from '../../../logging/winston';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import { ModelRepository } from '../../../models/ModelRepository';
import { OAuth2Model } from '../../../models/OAuth2Model';
import oauthRouter from '../../../routers/oauthRouter';
import { OAuthService } from '../../../services/OAuthService/OAuthService';
import { ServiceRepository } from '../../../services/ServiceRepository';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...config,
            mode: LightdashMode.DEFAULT,
            auth: {
                ...config.auth,
                pat: { ...config.auth.pat, enabled: true },
            },
        },
    };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const table = 'agent_connection_approval_requests';
const projectA = '11111111-1111-4111-8111-111111111111';
const projectB = '22222222-2222-4222-8222-222222222222';
const { origin } = new URL(lightdashConfigMock.siteUrl);
const issuer = lightdashConfigMock.siteUrl.replace(/\/+$/, '');
const input = {
    clientId: 'lightdash-cli',
    name: 'review',
    projects: null,
    capabilities: [C.Query, C.DeployUpload],
    expiresInSeconds: 3600,
    redirectUri: 'http://localhost:32123/callback',
    state: 's'.repeat(43),
    codeChallenge: 'c'.repeat(43),
    codeChallengeMethod: 'S256',
    resource: issuer,
};

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Decision HTTP fixture' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'Approval', last_name: 'Subject' } as never)
        .returning('*');
    const person: SessionUser = {
        ...defaultSessionUser,
        ability: new Ability([{ action: 'manage', subject: 'all' }]),
        userUuid: user.user_uuid,
        userId: user.user_id,
        organizationUuid: org.organization_uuid,
    };
    const other = { ...person, userUuid: randomUUID() };
    const models = new ModelRepository({
        database,
        lightdashConfig: lightdashConfigMock,
        utils: { getEncryptionUtil: () => ({}) } as never,
    });
    vi.spyOn(
        models.getUserModel(),
        'findSessionUserAndOrgByUuid',
    ).mockImplementation(async (uuid) =>
        uuid === person.userUuid ? person : other,
    );
    const flags = vi
        .spyOn(models.getFeatureFlagModel(), 'get')
        .mockResolvedValue({ enabled: true } as never);
    const projects = vi
        .spyOn(models.getProjectModel(), 'getAllByOrganizationUuid')
        .mockResolvedValue([
            { projectUuid: projectA, name: 'Project A', slug: 'a' },
            { projectUuid: projectB, name: 'Project B', slug: 'b' },
        ] as never);
    vi.spyOn(
        models.getAgentConnectionApprovalReadModel(),
        'getScheduledRefreshProjectUuids',
    ).mockResolvedValue([]);
    const services = new ServiceRepository({
        context: { lightdashConfig: lightdashConfigMock } as never,
        models,
        clients: {} as never,
        utils: {} as never,
    });
    const denied = new Set<string>();
    vi.spyOn(
        services.getAgentPermissionService(),
        'evaluateOperations',
    ).mockImplementation(async ({ operations }) =>
        operations.map((op) =>
            denied.has(`${op.projectUuid}:${op.key}`)
                ? ({
                      allowed: false,
                      reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                      policyLayer: 'org_ceiling',
                  } as never)
                : null,
        ),
    );
    const pat = vi.fn().mockResolvedValue(person);
    vi.spyOn(services, 'getUserService').mockReturnValue({
        loginWithPersonalAccessToken: pat,
    } as never);
    const writes = [
        vi.spyOn(AgentConnectionGrantModel.prototype, 'create'),
        vi.spyOn(AgentConnectionGrantModel.prototype, 'replace'),
        vi.spyOn(OAuthService.prototype, 'authorize'),
        vi.spyOn(OAuth2Model.prototype, 'saveAuthorizationCode'),
        vi.spyOn(OAuth2Model.prototype, 'saveToken'),
    ];
    const logs = (['info', 'warn', 'error', 'debug'] as const).map((level) =>
        vi.spyOn(Logger, level).mockImplementation(() => Logger),
    );
    vi.spyOn(Logger, 'child').mockReturnValue(Logger);
    const httpLogs = vi.spyOn(Logger, 'log').mockImplementation(() => Logger);
    const app = express();
    app.post(AGENT_CONNECTION_REQUEST_PATH, parseAgentConnectionApprovalBody);
    app.post(
        `${AGENT_CONNECTION_REQUEST_PATH}/:requestUuid/decision`,
        parseAgentConnectionApprovalBody,
    );
    app.use(express.json());
    app.use((req, _res, next) => {
        req.services = services;
        const auth = req.get('x-test-auth') ?? 'session';
        if (auth !== 'signed-out') {
            req.user = req.get('x-test-other') ? other : person;
            req.sessionID = req.get('x-test-session') ?? 'decision-session';
            req.account = fromSession(req.user, req.sessionID);
            req.session = { passport: { user: req.user.userUuid } } as never;
            if (auth !== 'session')
                req.account = {
                    ...req.account,
                    authentication: { type: auth },
                } as never;
            if (auth === 'populated-user') {
                req.session = {} as never;
                req.account = fromSession(req.user, req.sessionID);
            }
        }
        req.isAuthenticated = (() =>
            Boolean(req.user)) as typeof req.isAuthenticated;
        next();
    });
    app.use(expressWinstonPreResponseMiddleware);
    app.use(expressWinstonMiddleware);
    app.use('/api/v1/oauth', oauthRouter);
    RegisterRoutes(app);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const responses: string[] = [];
    const call = async (path: string, init: RequestInit = {}) => {
        const response = await fetch(`${base}${path}`, {
            ...init,
            redirect: 'manual',
        });
        const text = await response.text();
        responses.push(text);
        expect(response.headers.get('cache-control')).toBe('no-store');
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = null;
        }
        return {
            status: response.status,
            payload,
            location: response.headers.get('location'),
            text,
        };
    };
    const create = async (
        overrides = {},
        headers: Record<string, string> = {},
    ) => {
        const response = await call(AGENT_CONNECTION_REQUEST_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin, ...headers },
            body: JSON.stringify({ ...input, ...overrides }),
        });
        expect(response.status).toBe(200);
        return new URL(
            response.payload.results.authorizationUrl,
        ).searchParams.get('agent_request')!;
    };
    const path = (uuid: string) => `${AGENT_CONNECTION_REQUEST_PATH}/${uuid}`;
    const review = async (uuid: string) => {
        const response = await call(path(uuid));
        expect(response.status).toBe(200);
        return response.payload.results;
    };
    const decide = (
        uuid: string,
        displayed: { revision: number; nonce: string },
        overrides = {},
        headers: Record<string, string> = {},
    ) =>
        call(`${path(uuid)}/decision`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin, ...headers },
            body: JSON.stringify({
                decision: 'approve',
                revision: displayed.revision,
                nonce: displayed.nonce,
                projectUuids: [projectA, projectB],
                capabilities: [C.Query, C.DeployUpload],
                ...overrides,
            }),
        });
    const row = (uuid: string) =>
        database(table)
            .where({ agent_connection_approval_request_uuid: uuid })
            .first();
    const counts = () =>
        Promise.all(
            (
                [
                    'agent_connection_grants',
                    'oauth2_authorization_codes',
                    'oauth2_access_tokens',
                    'oauth2_refresh_tokens',
                ] as const
            ).map(
                async (name) =>
                    (await database(name).count('* as count').first())!.count,
            ),
        );
    const before = await counts();
    return {
        call,
        httpLogs,
        create,
        review,
        decide,
        path,
        row,
        denied,
        flags,
        projects,
        complete: (uuid: string, headers: Record<string, string> = {}) =>
            call(`${path(uuid)}/completion`, { headers }),
        close: async () => {
            try {
                expect(await counts()).toEqual(before);
                for (const write of writes)
                    expect(write).not.toHaveBeenCalled();
                const rows = await database(table).where({
                    subject_user_uuid: person.userUuid,
                });
                for (const response of responses) {
                    let payload;
                    try {
                        payload = JSON.parse(response);
                    } catch {
                        payload = null;
                    }
                    const nonce =
                        payload?.results?.nonce ??
                        payload?.error?.review?.nonce;
                    if (nonce) {
                        expect(JSON.stringify(rows)).not.toContain(nonce);
                        expect(
                            JSON.stringify([
                                ...logs.flatMap((log) => log.mock.calls),
                                ...httpLogs.mock.calls,
                            ]),
                        ).not.toContain(nonce);
                    }
                }
                for (const value of [
                    JSON.stringify(rows),
                    JSON.stringify(responses),
                    JSON.stringify([
                        ...logs.flatMap((log) => log.mock.calls),
                        ...httpLogs.mock.calls,
                    ]),
                ])
                    expect(value).not.toMatch(
                        /pat-sentinel|proxy-sentinel|verifier-sentinel/,
                    );
            } finally {
                await new Promise<void>((resolve, reject) => {
                    server.close((error) =>
                        error ? reject(error) : resolve(),
                    );
                });
                vi.restoreAllMocks();
            }
        },
    };
};

it.each(['approve', 'deny'] as const)(
    '%s follows the real registered routes, seals only the pending row and delivers the exact stored callback once',
    async (decision) => {
        const f = await fixture();
        try {
            const uuid = await f.create(
                {},
                {
                    authorization: 'ApiKey pat-sentinel',
                    'x-test-auth': 'signed-out',
                },
            );
            const handoff = await f.call(
                `/api/v1/oauth/authorize?agent_request=${uuid}`,
            );
            expect(handoff.status).toBe(302);
            expect(new URL(handoff.location!).searchParams.get('request')).toBe(
                uuid,
            );
            const displayed = await f.review(uuid);
            expect(displayed).toMatchObject({
                request: {
                    name: 'review',
                    clientLabel: 'CLI',
                    expiresInSeconds: 3600,
                    expiresAt: expect.any(String),
                },
                notice: 'Review only. No connection will be created.',
                revision: 1,
            });
            expect(displayed.projects).toHaveLength(2);
            const bound = await f.row(uuid);
            expect(bound!.csrf_hash).toEqual(
                createHash('sha256').update(displayed.nonce).digest(),
            );
            expect(bound!.review_session_hash).toEqual(
                createHash('sha256').update('decision-session').digest(),
            );
            expect(JSON.stringify(bound)).not.toContain(displayed.nonce);
            expect(JSON.stringify(bound)).not.toContain('decision-session');
            const response = await f.decide(uuid, displayed, { decision });
            expect(response.status).toBe(200);
            expect(response.payload).toEqual({
                status: 'ok',
                results: {
                    completionUrl: `${issuer}${f.path(uuid)}/completion`,
                },
            });
            const sealed = await f.row(uuid);
            expect(sealed!.decision_consumed_at).toBeInstanceOf(Date);
            expect(sealed!.terminal_error).toBe(
                decision === 'approve'
                    ? 'agent_connections_unavailable'
                    : 'access_denied',
            );
            expect(sealed!.approved_selection).toEqual(
                decision === 'deny'
                    ? null
                    : {
                          approvedProjectUuids: [projectA, projectB],
                          approvedCapabilities: [C.Query, C.DeployUpload],
                          resourceConstraints: {
                              version: 2,
                              projectCapabilities: {
                                  [projectA]: [C.Query, C.DeployUpload],
                                  [projectB]: [C.Query, C.DeployUpload],
                              },
                          },
                      },
            );
            expect(sealed!.review_revision).toBeGreaterThan(0);
            expect(sealed!.approved_at).toEqual(
                decision === 'approve' ? sealed!.decision_consumed_at : null,
            );
            expect(sealed!.approval_policy_version).toBe(
                decision === 'approve' ? 1 : null,
            );
            expect(sealed!.callback_consumed_at).toBeNull();
            for (const refused of [
                await f.call(f.path(uuid)),
                await f.decide(uuid, displayed, { decision }),
            ]) {
                expect(refused).toMatchObject({
                    status: 409,
                    payload: { error: { code: 'approval_request_consumed' } },
                });
            }
            const completion = await f.complete(uuid);
            expect(completion.status).toBe(302);
            const callback = new URL(completion.location!);
            expect(`${callback.origin}${callback.pathname}`).toBe(
                input.redirectUri,
            );
            expect([...callback.searchParams]).toEqual([
                [
                    'error',
                    decision === 'approve'
                        ? 'agent_connections_unavailable'
                        : 'access_denied',
                ],
                ['state', input.state],
                ['iss', issuer],
            ]);
            expect(callback.searchParams.has('code')).toBe(false);
            expect(callback.searchParams.has('grant_uuid')).toBe(false);
            const captured = JSON.stringify(f.httpLogs.mock.calls);
            for (const value of [
                uuid,
                input.state,
                input.codeChallenge,
                displayed.nonce,
                'pat-sentinel',
                'proxy-sentinel',
                'verifier-sentinel',
            ])
                expect(captured).not.toContain(value);
            const httpEntries = f.httpLogs.mock.calls.map(
                ([entry]) =>
                    entry as unknown as {
                        level: string;
                        includesResponse: boolean;
                    },
            );
            expect(
                httpEntries.filter(
                    (entry) =>
                        entry.level === 'http' &&
                        entry.includesResponse === false,
                ).length,
            ).toBeGreaterThanOrEqual(5);
            expect(
                httpEntries.filter(
                    (entry) =>
                        entry.level === 'http' &&
                        entry.includesResponse === true,
                ).length,
            ).toBeGreaterThanOrEqual(5);

            for (const refused of [
                await f.call(f.path(uuid)),
                await f.decide(uuid, displayed, { decision }),
                await f.complete(uuid),
            ]) {
                expect(refused).toMatchObject({
                    status: 409,
                    payload: { error: { code: 'approval_request_consumed' } },
                });
            }
            expect((await f.row(uuid))!.callback_consumed_at).toBeInstanceOf(
                Date,
            );
            expect((await f.decide(uuid, displayed, { decision })).status).toBe(
                409,
            );
        } finally {
            await f.close();
        }
    },
);

it.each([
    ['missing nonce', { nonce: undefined }, {}, 403, 'csrf_failed'],
    ['wrong nonce', { nonce: 'x'.repeat(43) }, {}, 403, 'csrf_failed'],
    ['stale revision', { revision: 0 }, {}, 409, 'approval_selection_changed'],
    [
        'foreign origin',
        {},
        { origin: 'https://foreign.example' },
        403,
        'csrf_failed',
    ],
    ['missing origin', {}, { origin: '' }, 403, 'csrf_failed'],
    ['null origin', {}, { origin: 'null' }, 403, 'csrf_failed'],
    ['wrong person', {}, { 'x-test-other': 'true' }, 403, 'approval_forbidden'],
    [
        'wrong session',
        {},
        { 'x-test-session': 'different' },
        403,
        'csrf_failed',
    ],
    [
        'foreign project',
        { projectUuids: [randomUUID()] },
        {},
        422,
        'invalid_approval_request',
    ],
    [
        'unrequested capability',
        { capabilities: [C.Administration] },
        {},
        422,
        'invalid_approval_request',
    ],
    ['no project', { projectUuids: [] }, {}, 422, 'invalid_approval_request'],
    [
        'extra field',
        { codeVerifier: 'verifier-sentinel' },
        {},
        422,
        'invalid_approval_request',
    ],
    [
        'PAT',
        {},
        { authorization: 'ApiKey pat-sentinel' },
        403,
        'browser_session_required',
    ],
    [
        'OAuth bearer',
        {},
        { authorization: 'Bearer token' },
        403,
        'browser_session_required',
    ],
    [
        'service account',
        {},
        { 'x-test-auth': 'service-account' },
        403,
        'browser_session_required',
    ],
    [
        'OAuth account',
        {},
        { 'x-test-auth': 'oauth' },
        403,
        'browser_session_required',
    ],
    [
        'PAT account',
        {},
        { 'x-test-auth': 'pat' },
        403,
        'browser_session_required',
    ],
    [
        'proxy credential',
        {},
        { 'x-api-key': 'proxy-sentinel' },
        403,
        'browser_session_required',
    ],
    [
        'populated user only',
        {},
        { 'x-test-auth': 'populated-user' },
        401,
        'authentication_required',
    ],
] as const)(
    'refuses decision: %s without sealing',
    async (_name, body, headers, status, code) => {
        const f = await fixture();
        try {
            const uuid = await f.create();
            const displayed = await f.review(uuid);
            const before = await f.row(uuid);
            const response = await f.decide(uuid, displayed, body, headers);
            expect(response.status).toBe(status);
            expect(response.payload.error.code).toBe(code);
            if (code === 'csrf_failed')
                expect(response.payload.error.message).toBe(
                    'The request could not be verified. Reload the page and try again.',
                );
            if (code === 'browser_session_required')
                expect(response.payload.error.message).toBe(
                    'A signed-in browser session is required.',
                );
            expect(await f.row(uuid)).toEqual(before);
        } finally {
            await f.close();
        }
    },
);

it('rejects projects and capabilities absent from the displayed answer or request', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create({ projects: [projectA] });
        f.denied.add(`${projectA}:${C.DeployUpload}`);
        const displayed = await f.review(uuid);
        expect(
            (
                await f.decide(uuid, displayed, {
                    projectUuids: [projectB],
                    capabilities: [],
                })
            ).status,
        ).toBe(422);
        expect(
            (
                await f.decide(uuid, displayed, {
                    projectUuids: [projectA],
                    capabilities: [C.DeployUpload],
                })
            ).status,
        ).toBe(422);
        expect((await f.row(uuid))!.decision_consumed_at).toBeNull();
    } finally {
        await f.close();
    }
});

it('caps later permission growth at each displayed project and allows empty capabilities', async () => {
    const f = await fixture();
    try {
        f.denied.add(`${projectA}:${C.DeployUpload}`);
        const uuid = await f.create();
        const displayed = await f.review(uuid);
        f.denied.clear();
        expect((await f.decide(uuid, displayed)).status).toBe(200);
        expect(
            (await f.row(uuid))!.approved_selection!.resourceConstraints
                .projectCapabilities,
        ).toEqual({
            [projectA]: [C.Query],
            [projectB]: [C.Query, C.DeployUpload],
        });
        const emptyUuid = await f.create();
        expect(
            (
                await f.decide(emptyUuid, await f.review(emptyUuid), {
                    capabilities: [],
                })
            ).status,
        ).toBe(200);
        expect(
            (await f.row(emptyUuid))!.approved_selection!.resourceConstraints
                .projectCapabilities,
        ).toEqual({ [projectA]: [], [projectB]: [] });
    } finally {
        await f.close();
    }
});

it('returns a narrowed review and new nonce after shrink, rolls back the decision and accepts a renewed selection', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const displayed = await f.review(uuid);
        f.denied.add(`${projectA}:${C.Query}`);
        const response = await f.decide(uuid, displayed);
        expect(response.status).toBe(409);
        expect(response.payload.error.code).toBe('approval_selection_changed');
        const fresh = response.payload.error.review;
        expect(fresh.revision).toBe(displayed.revision + 1);
        expect(fresh.nonce).not.toBe(displayed.nonce);
        expect(
            fresh.projects[0].capabilities.find(
                (c: { capability: C }) => c.capability === C.Query,
            ).visibility,
        ).toBe('blocked');
        expect((await f.row(uuid))!.decision_consumed_at).toBeNull();
        expect((await f.row(uuid))!.approved_selection).toBeNull();
        expect((await f.decide(uuid, fresh)).status).toBe(200);
        expect(
            (await f.row(uuid))!.approved_selection!.resourceConstraints
                .projectCapabilities[projectA],
        ).toEqual([C.DeployUpload]);
    } finally {
        await f.close();
    }
});

it('refuses expired review, decision and completion on the database clock', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const displayed = await f.review(uuid);
        await migrated
            .database(table)
            .where({ agent_connection_approval_request_uuid: uuid })
            .update({
                created_at: migrated.database.raw(
                    "clock_timestamp() - interval '16 minutes'",
                ),
                request_expires_at: migrated.database.raw(
                    "clock_timestamp() - interval '1 minute'",
                ),
            });
        for (const response of [
            await f.call(f.path(uuid)),
            await f.decide(uuid, displayed),
            await f.complete(uuid),
        ]) {
            expect(response.status).toBe(410);
            expect(response.payload.error.code).toBe(
                'approval_request_expired',
            );
        }
        expect((await f.row(uuid))!.decision_consumed_at).toBeNull();
    } finally {
        await f.close();
    }
});

it('requires the owner for review and completion and a decision before completion; refuses a corrupt stored redirect', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const before = await f.row(uuid);
        const wrong = await f.call(f.path(uuid), {
            headers: { 'x-test-other': 'true' },
        });
        expect(wrong.status).toBe(403);
        expect(wrong.payload).toEqual({
            status: 'error',
            error: {
                statusCode: 403,
                name: 'AgentConnectionApprovalError',
                code: 'approval_forbidden',
                message: 'Sign in with the account that started this request.',
            },
        });
        expect(await f.row(uuid)).toEqual(before);
        expect(await f.complete(uuid)).toMatchObject({
            status: 409,
            payload: {
                error: {
                    code: 'approval_not_decided',
                    message: 'This approval request has not been decided yet.',
                },
            },
        });
        const displayed = await f.review(uuid);
        expect(await f.complete(uuid)).toMatchObject({
            status: 409,
            payload: { error: { code: 'approval_not_decided' } },
        });
        expect((await f.decide(uuid, displayed)).status).toBe(200);
        const sealed = await f.row(uuid);
        expect(
            (await f.complete(uuid, { 'x-test-other': 'true' })).status,
        ).toBe(403);
        expect(await f.row(uuid)).toEqual(sealed);
        await migrated
            .database(table)
            .where({ agent_connection_approval_request_uuid: uuid })
            .update({ redirect_uri: 'https://foreign.example/callback' });
        const invalid = await f.complete(uuid);
        expect(invalid.status).toBe(422);
        expect(invalid.payload.error.code).toBe('invalid_approval_request');
        expect(invalid.location).toBeNull();
        expect((await f.row(uuid))!.callback_consumed_at).toBeNull();
    } finally {
        await f.close();
    }
});

it.each(['person', 'organisation'] as const)(
    'all new routes refuse a disabled %s flag without writes',
    async (scope) => {
        const f = await fixture();
        try {
            const uuid = await f.create();
            const displayed = await f.review(uuid);
            const before = await f.row(uuid);
            f.flags.mockImplementation(
                async (args) =>
                    ({
                        enabled:
                            scope === 'person'
                                ? !args.user?.userUuid
                                : Boolean(args.user?.userUuid),
                    }) as never,
            );
            for (const response of [
                await f.call(f.path(uuid)),
                await f.decide(uuid, displayed),
                await f.complete(uuid),
            ]) {
                expect(response.status).toBe(403);
                expect(response.payload.error.code).toBe(
                    'agent_identity_disabled',
                );
            }
            expect(await f.row(uuid)).toEqual(before);
        } finally {
            await f.close();
        }
    },
);

it.each(['approve', 'deny'] as const)(
    'two HTTP clients race Approve/%s and exactly one wins',
    async (otherDecision) => {
        const f = await fixture();
        try {
            const uuid = await f.create();
            const displayed = await f.review(uuid);
            const results = await Promise.all([
                f.decide(uuid, displayed),
                f.decide(uuid, displayed, { decision: otherDecision }),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
            expect(
                results.find((r) => r.status === 409)!.payload.error.code,
            ).toBe('approval_request_consumed');
            const callbacks = await Promise.all([
                f.complete(uuid),
                f.complete(uuid),
            ]);
            expect(callbacks.map((r) => r.status).sort()).toEqual([302, 409]);
        } finally {
            await f.close();
        }
    },
);

it.each([
    'session-missing',
    'pat',
    'service-account',
    'oauth',
    'proxy',
] as const)('review and completion refuse %s credentials', async (kind) => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const before = await f.row(uuid);
        let headers: Record<string, string> = { 'x-test-auth': kind };
        if (kind === 'session-missing')
            headers = { 'x-test-auth': 'signed-out' };
        if (kind === 'proxy') headers = { 'x-api-key': 'proxy-sentinel' };
        const responses = await Promise.all(
            [f.path(uuid), `${f.path(uuid)}/completion`].map((path) =>
                f.call(path, { headers }),
            ),
        );
        for (const response of responses) {
            expect(response.status).toBe(
                kind === 'session-missing' ? 401 : 403,
            );
            expect(response.payload.error.code).toBe(
                kind === 'session-missing'
                    ? 'authentication_required'
                    : 'browser_session_required',
            );
        }
        expect(await f.row(uuid)).toEqual(before);
    } finally {
        await f.close();
    }
});

it.each(['not-a-uuid', '11111111-1111-1111-8111-111111111111'])(
    'invalid UUID path %s uses the local serializer on every route',
    async (uuid) => {
        const f = await fixture();
        try {
            for (const response of [
                await f.call(f.path(uuid)),
                await f.decide(uuid, { nonce: 'n'.repeat(43), revision: 1 }),
                await f.complete(uuid),
            ]) {
                expect(response.status).toBe(422);
                expect(response.payload.error.code).toBe(
                    'invalid_approval_request',
                );
            }
        } finally {
            await f.close();
        }
    },
);

it.each([
    { projectUuids: ['11111111-1111-1111-8111-111111111111'] },
    { nonce: `${'n'.repeat(43)}\n` },
    { revision: '1' },
    { revision: -1 },
    { capabilities: ['unknown'] },
    { projectUuids: [projectA, projectA] },
    { capabilities: [C.Query, C.Query] },
    { redirectUri: 'https://foreign.example' },
])('invalid decision fields %j use only the local serializer', async (body) => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const displayed = await f.review(uuid);
        const response = await f.decide(uuid, displayed, body);
        expect(response.status).toBe(422);
        expect(response.payload.error.code).toBe('invalid_approval_request');
        expect((await f.row(uuid))!.decision_consumed_at).toBeNull();
    } finally {
        await f.close();
    }
});

it('a new display rotates the nonce; loss of a displayed project yields a narrowed review; completion ignores supplied callback fields', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const old = await f.review(uuid);
        const displayed = await f.review(uuid);
        expect(displayed.nonce).not.toBe(old.nonce);
        expect(displayed.revision).toBe(old.revision + 1);
        expect((await f.decide(uuid, old)).payload.error.code).toBe(
            'csrf_failed',
        );
        f.projects.mockResolvedValue([
            { projectUuid: projectA, name: 'A', slug: 'a' },
        ] as never);
        const narrowed = await f.decide(uuid, displayed);
        expect(narrowed.status).toBe(409);
        expect(
            narrowed.payload.error.review.projects.map(
                (p: { projectUuid: string }) => p.projectUuid,
            ),
        ).toEqual([projectA]);
        expect(
            (
                await f.decide(uuid, narrowed.payload.error.review, {
                    projectUuids: [projectA],
                })
            ).status,
        ).toBe(200);
        const response = await f.call(
            `${f.path(uuid)}/completion?redirect_uri=https://foreign.example&state=attacker&iss=attacker&code=attacker`,
        );
        expect(response.status).toBe(302);
        const callback = new URL(response.location!);
        expect(`${callback.origin}${callback.pathname}`).toBe(
            input.redirectUri,
        );
        expect([...callback.searchParams]).toEqual([
            ['error', 'agent_connections_unavailable'],
            ['state', input.state],
            ['iss', issuer],
        ]);
    } finally {
        await f.close();
    }
});

it('shrink in one project never offers growth in another on the renewed review', async () => {
    const f = await fixture();
    try {
        f.denied.add(`${projectA}:${C.DeployUpload}`);
        const uuid = await f.create();
        const displayed = await f.review(uuid);
        f.denied.clear();
        f.denied.add(`${projectB}:${C.Query}`);
        const changed = await f.decide(uuid, displayed);
        expect(changed.status).toBe(409);
        const fresh = changed.payload.error.review;
        expect(
            fresh.projects[0].capabilities.find(
                (c: { capability: C }) => c.capability === C.DeployUpload,
            ),
        ).toMatchObject({ visibility: 'blocked', reasonCode: 'not_reviewed' });
        expect((await f.decide(uuid, fresh)).status).toBe(200);
        expect(
            (await f.row(uuid))!.approved_selection!.resourceConstraints
                .projectCapabilities,
        ).toEqual({ [projectA]: [C.Query], [projectB]: [C.DeployUpload] });
    } finally {
        await f.close();
    }
});

it('a person can deny an empty answer without selecting any projects or capabilities', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        f.projects.mockResolvedValue([]);
        const displayed = await f.review(uuid);
        expect(displayed.projects).toEqual([]);
        expect(
            (
                await f.decide(uuid, displayed, {
                    decision: 'deny',
                    projectUuids: [],
                    capabilities: [],
                })
            ).status,
        ).toBe(200);
        expect(
            new URL((await f.complete(uuid)).location!).searchParams.get(
                'error',
            ),
        ).toBe('access_denied');
    } finally {
        await f.close();
    }
});

it.each([
    'http://localhost:0/callback',
    'http://localhost:65536/callback',
    'http://user@localhost:32123/callback',
    'http://localhost:32123/callback?code=attacker',
    'http://localhost:32123/callback#fragment',
    'http://localhost:32123/other',
    'http://localhost:32123/callback\n',
])(
    'completion refuses corrupt stored URI %j before consuming delivery',
    async (redirectUri) => {
        const f = await fixture();
        try {
            const uuid = await f.create();
            expect((await f.decide(uuid, await f.review(uuid))).status).toBe(
                200,
            );
            await migrated
                .database(table)
                .where({ agent_connection_approval_request_uuid: uuid })
                .update({ redirect_uri: redirectUri });
            const response = await f.complete(uuid);
            expect(response.status).toBe(422);
            expect(response.payload.error.code).toBe(
                'invalid_approval_request',
            );
            expect(response.location).toBeNull();
            expect((await f.row(uuid))!.callback_consumed_at).toBeNull();
        } finally {
            await f.close();
        }
    },
);

it('serializes unknown requests and flag lookup failures locally on all three routes', async () => {
    const f = await fixture();
    try {
        const uuid = randomUUID();
        const decision = { nonce: 'n'.repeat(43), revision: 1 };
        for (const response of [
            await f.call(f.path(uuid)),
            await f.decide(uuid, decision),
            await f.complete(uuid),
        ]) {
            expect(response.status).toBe(404);
            expect(response.payload.error.code).toBe(
                'approval_request_not_found',
            );
        }
        f.flags.mockRejectedValue(new Error('private failure detail'));
        for (const response of [
            await f.call(f.path(uuid)),
            await f.decide(uuid, decision),
            await f.complete(uuid),
        ]) {
            expect(response.status).toBe(500);
            expect(response.payload.error.code).toBe('internal_error');
            expect(response.text).not.toContain('private failure detail');
        }
    } finally {
        await f.close();
    }
});

it('rejects malformed and oversized decision JSON and an absent Origin without writing', async () => {
    const f = await fixture();
    try {
        const uuid = await f.create();
        const displayed = await f.review(uuid);
        const before = await f.row(uuid);
        for (const response of await Promise.all(
            ['{', `${' '.repeat(65537)}{}`].map((body) =>
                f.call(`${f.path(uuid)}/decision`, {
                    method: 'POST',
                    headers: { origin, 'content-type': 'application/json' },
                    body,
                }),
            ),
        )) {
            expect(response.status).toBe(422);
            expect(response.payload.error.code).toBe(
                'invalid_approval_request',
            );
        }
        const noOrigin = await f.call(`${f.path(uuid)}/decision`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                decision: 'approve',
                nonce: displayed.nonce,
                revision: displayed.revision,
                projectUuids: [projectA],
                capabilities: [],
            }),
        });
        expect(noOrigin.status).toBe(403);
        expect(noOrigin.payload.error.code).toBe('csrf_failed');
        expect(await f.row(uuid)).toEqual(before);
    } finally {
        await f.close();
    }
});
