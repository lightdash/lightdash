import {
    AgentCapability,
    FeatureFlags,
    LightdashMode,
} from '@lightdash/common';
import { type Request, type RequestHandler, type Response } from 'express';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import passport from 'passport';
import { fromApiKey } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { AgentConnectionGrantService } from '../../auth/agentConnectionGrants/AgentConnectionGrantService';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { authenticateServiceAccount } from '../../ee/authentication';
import { AgentConnectionGrantModel } from '../../models/AgentConnectionGrantModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type UserModel } from '../../models/UserModel';
import { OAuthService } from '../../services/OAuthService/OAuthService';
import {
    allowApiKeyAuthentication,
    allowApiKeyAuthenticationIfPresent,
    allowOauthAuthentication,
} from './middlewares';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));
const setup = () => {
    const grant = grantFixture();
    const user = {
        ...defaultSessionUser,
        userUuid: 'user',
        organizationUuid: 'org',
    };
    const token = {
        accessToken: 'token',
        scope: ['read'],
        agentConnectionGrantUuid: 'grant',
        familyUuid: 'family',
        resource: grant.resource,
        client: { id: 'client' },
        user,
    };
    const deps = {
        model: {
            findActive: vi.fn().mockResolvedValue(grant),
            touchLastUsed: vi.fn().mockResolvedValue(undefined),
        },
        featureFlags: {
            get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
                enabled: featureFlagId === FeatureFlags.AgentIdentity,
            })),
        },
        resourceResolver: {
            resolveDeploySession: vi.fn().mockResolvedValue({
                projectUuid: grant.approvedProjectUuids[0],
                userUuid: user.userUuid,
            }),
            resolveProjectUuid: vi
                .fn()
                .mockImplementation(async (_org, uuid) => uuid),
            resolveResourceProjectUuid: vi.fn().mockResolvedValue(null),
        },
    };
    const service = new AgentConnectionGrantService(deps);
    const permissions = {
        isManaged: vi.fn().mockResolvedValue(false),
        assertOperation: vi.fn(),
        resolveResourceProjectUuid: vi.fn(),
    };
    const handler = Object.defineProperty(() => {}, 'name', {
        value: 'ProjectController_getProject',
    });
    const oauth = {
        authenticate: vi.fn().mockResolvedValue(token),
        getSiteUrl: () => grant.resource,
        isAccessTokenBoundToGrant: vi.fn().mockResolvedValue(false),
    };
    const req = {
        headers: { authorization: 'Bearer token' },
        method: 'GET',
        query: {},
        body: {},
        params: { projectUuid: grant.approvedProjectUuids[0] },
        baseUrl: '',
        route: {
            path: '/api/v1/projects/:projectUuid',
            stack: [{ handle: handler }],
        },
        isAuthenticated: () => false,
        services: {
            getOauthService: () => oauth,
            getUserService: () => ({ findSessionUser: async () => user }),
            getFeatureFlagService: () => deps.featureFlags,
            getAgentPermissionService: () => permissions,
            getAgentConnectionGrantService: () => service,
        },
    } as unknown as Request;
    const downstream = vi.fn();
    let status = 200;
    const run = (middleware: RequestHandler) =>
        new Promise<{ status: number; body?: unknown; error?: unknown }>(
            (resolve) => {
                status = 200;
                const res = {
                    locals: {},
                    status: (value: number) => {
                        status = value;
                        return res;
                    },
                    json: (body: unknown) => resolve({ status, body }),
                    set: vi.fn(),
                } as unknown as Response;
                req.res = res;
                middleware(req, res, (error) => {
                    if (error === undefined) downstream();
                    resolve({ status, error });
                });
            },
        );
    return {
        grant,
        user,
        token,
        deps,
        permissions,
        req,
        run,
        oauth,
        downstream,
    };
};
beforeEach(() => vi.clearAllMocks());
it.each([allowApiKeyAuthentication, allowOauthAuthentication])(
    'fails closed without fallback when disabled',
    async (middleware) => {
        const { deps, run, req } = setup();
        deps.featureFlags.get.mockResolvedValue({ enabled: false });
        expect(await run(middleware)).toEqual({
            status: 401,
            body: { error: 'invalid_token' },
        });
        expect(req.account).toBeUndefined();
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
        expect(passport.authenticate).not.toHaveBeenCalled();
    },
);
it('refuses an inactive grant', async () => {
    const { deps, run } = setup();
    deps.model.findActive.mockResolvedValue(null);
    expect(await run(allowApiKeyAuthentication)).toMatchObject({ status: 401 });
});
it.each(['subjectUserUuid', 'organizationUuid', 'clientId', 'resource'])(
    'refuses %s mismatch',
    async (field) => {
        const { grant, run } = setup();
        Object.assign(grant, { [field]: 'other' });
        expect(await run(allowApiKeyAuthentication)).toMatchObject({
            status: 401,
        });
    },
);
it('puts validated metadata on the account in OAuth log and legacy org mode', async () => {
    const { req, run, grant } = setup();
    expect(await run(allowApiKeyAuthentication)).toEqual({
        status: 200,
        error: undefined,
    });
    expect(req.account?.authentication).toMatchObject({
        agentConnectionGrant: {
            grantUuid: 'grant',
            revision: 1,
            approvedProjectUuids: grant.approvedProjectUuids,
        },
    });
});
it('enforces the grant before the legacy return, even after the org allows more', async () => {
    const { req, run, permissions } = setup();
    req.params.projectUuid = 'outside';
    const check = async (managed: boolean) => {
        permissions.isManaged.mockResolvedValue(managed);
        expect((await run(allowApiKeyAuthentication)).error).toMatchObject({
            message: expect.stringContaining('project'),
        });
    };
    await check(false);
    await check(true);
    expect(permissions.assertOperation).not.toHaveBeenCalled();
});
it.each([
    'ProjectController.createPreview',
    'organizationRouter POST /projects/precompiled',
    'unknown',
])('denies %s in legacy/log mode', async (operation) => {
    const { req, run } = setup();
    if (operation.startsWith('organizationRouter')) {
        req.baseUrl = '/api/v1/org';
        req.method = 'POST';
        req.route = { path: '/projects/precompiled', stack: [] };
    } else
        req.route.stack[0].handle = Object.defineProperty(() => {}, 'name', {
            value: operation.replace('.', '_'),
        });
    expect((await run(allowApiKeyAuthentication)).error).toBeDefined();
});
it.each([null, undefined])(
    'unbound OAuth %s stays a person',
    async (binding) => {
        const { req, token, run, deps } = setup();
        token.agentConnectionGrantUuid = binding as unknown as string;
        expect((await run(allowApiKeyAuthentication)).error).toBeUndefined();
        expect(req.account?.authentication).toMatchObject({
            agentConnectionGrant: null,
        });
        expect(deps.model.findActive).not.toHaveBeenCalled();
    },
);
it('a normal PAT account remains unchanged', async () => {
    const { req, user, run, deps } = setup();
    req.account = fromApiKey(user, 'pat');
    req.headers.authorization = 'ApiKey pat';
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    expect(await run(allowApiKeyAuthentication)).toEqual({
        status: 200,
        error: undefined,
    });
    expect(req.account.authentication.type).toBe('pat');
    expect(deps.featureFlags.get).not.toHaveBeenCalled();
});

it('enforces OAuth wire scopes on a bound unchecked operation in legacy/log mode', async () => {
    const { req, grant, token, run } = setup();
    grant.approvedCapabilities = [AgentCapability.DeployUpload];
    req.params.sessionUuid = 'session';
    token.scope = ['read'];
    req.route.stack[0].handle = Object.defineProperty(() => {}, 'name', {
        value: 'DeployController_addDeployBatch',
    });
    expect((await run(allowApiKeyAuthentication)).error).toMatchObject({
        message: expect.stringContaining('scope'),
    });
});

it('refuses an API grant on the MCP audience before using the person', async () => {
    const { req, run, deps } = setup();
    req.baseUrl = '/api/v1/mcp';
    expect(await run(allowApiKeyAuthentication)).toMatchObject({
        status: 401,
        body: { error: 'invalid_token' },
    });
    expect(req.account).toBeUndefined();
    expect(deps.model.findActive).not.toHaveBeenCalled();
});

it('passes the contracted path project to managed org policy', async () => {
    const { req, run, grant, permissions } = setup();
    req.params = { projectUuid: grant.approvedProjectUuids[0] };
    req.body = { projectUuid: 'ignored' };
    req.method = 'POST';
    permissions.isManaged.mockResolvedValue(true);
    expect((await run(allowApiKeyAuthentication)).error).toBeUndefined();
    expect(permissions.assertOperation).toHaveBeenCalledWith(
        expect.objectContaining({ projectUuid: grant.approvedProjectUuids[0] }),
    );
});

it('uses Console-only enablement and rechecks the org switch without a restart', async () => {
    const { req, run, user, grant, deps } = setup();
    user.userUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    grant.subjectUserUuid = user.userUuid;
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    let organizationEnabled = true;
    tracker.on.select('feature_flags').response((query) => ({
        flag_id: query.bindings[0],
        default_enabled: false,
    }));
    tracker.on.select('feature_flag_overrides').response((query) => {
        if (!query.bindings.includes(FeatureFlags.AgentIdentity))
            return undefined;
        if (query.sql.includes('"user_uuid" =')) return { enabled: true };
        if (query.sql.includes('"user_uuid" is null'))
            return { enabled: organizationEnabled };
        return undefined;
    });
    const flags = new FeatureFlagModel({
        database,
        lightdashConfig: {
            ...lightdashConfigMock,
            mode: LightdashMode.DEFAULT,
            enabledFeatureFlags: new Set(),
            disabledFeatureFlags: new Set(),
            previewFeatureFlags: {
                ...lightdashConfigMock.previewFeatureFlags,
                enabled: false,
            },
        },
    });
    deps.featureFlags.get.mockImplementation((args) => flags.get(args));
    try {
        expect((await run(allowApiKeyAuthentication)).status).toBe(200);
        organizationEnabled = false;
        req.account = undefined;
        expect(await run(allowApiKeyAuthentication)).toMatchObject({
            status: 401,
            body: { error: 'invalid_token' },
        });
        organizationEnabled = true;
        expect((await run(allowApiKeyAuthentication)).status).toBe(200);
    } finally {
        tracker.reset();
        await database.destroy();
    }
});

it.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])('enforces a bound bearer with a session', async (middleware) => {
    const { req, run, deps } = setup();
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    deps.featureFlags.get.mockResolvedValue({ enabled: false });
    expect(await run(middleware)).toMatchObject({
        status: 401,
        body: { error: 'invalid_token' },
    });
});
it.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])(
    'refuses a people-only operation with a session and bound bearer',
    async (middleware) => {
        const { req, run } = setup();
        req.isAuthenticated = (() => true) as Request['isAuthenticated'];
        req.route.stack[0].handle = Object.defineProperty(() => {}, 'name', {
            value: 'UserController_createPersonalAccessToken',
        });
        expect((await run(middleware)).error).toBeDefined();
    },
);
it.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])('preserves a session with an unbound bearer', async (middleware) => {
    const { req, user, token, run, deps } = setup();
    req.account = fromApiKey(user, 'pat');
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    token.agentConnectionGrantUuid = null as unknown as string;
    expect((await run(middleware)).error).toBeUndefined();
    expect(req.account.authentication.type).toBe('pat');
    expect(deps.model.findActive).not.toHaveBeenCalled();
});

it.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])('does no OAuth lookup for a plain session', async (middleware) => {
    const { req, user, run } = setup();
    req.account = fromApiKey(user, 'pat');
    req.headers.authorization = undefined;
    req.isAuthenticated = (() => true) as Request['isAuthenticated'];
    const lookup = vi.spyOn(req.services, 'getOauthService');
    expect((await run(middleware)).error).toBeUndefined();
    expect(req.account.authentication.type).toBe('pat');
    expect(lookup).not.toHaveBeenCalled();
});

it.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])(
    'refuses an expired bound bearer with a live session',
    async (middleware) => {
        const { req, user, run, oauth } = setup();
        req.account = fromApiKey(user, 'pat');
        req.isAuthenticated = (() => true) as Request['isAuthenticated'];
        oauth.authenticate.mockRejectedValue(
            new Error('Access token has expired'),
        );
        oauth.isAccessTokenBoundToGrant.mockResolvedValue(true);
        expect(await run(middleware)).toEqual({
            status: 401,
            body: { error: 'invalid_token' },
        });
        expect(oauth.isAccessTokenBoundToGrant).toHaveBeenCalledExactlyOnceWith(
            'token',
        );
        expect(passport.authenticate).not.toHaveBeenCalled();
        expect(authenticateServiceAccount).not.toHaveBeenCalled();
    },
);
it.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])(
    'preserves a session after unknown, invalid and expired unbound bearer failures',
    async (middleware) => {
        await Promise.all(
            ['Unknown token', 'Invalid token', 'Access token has expired'].map(
                async (reason) => {
                    const { req, user, run, oauth } = setup();
                    req.account = fromApiKey(user, 'pat');
                    req.isAuthenticated = (() =>
                        true) as Request['isAuthenticated'];
                    oauth.authenticate.mockRejectedValue(new Error(reason));
                    expect(await run(middleware)).toEqual({
                        status: 200,
                        error: undefined,
                    });
                    expect(req.account.authentication.type).toBe('pat');
                    expect(
                        oauth.isAccessTokenBoundToGrant,
                    ).toHaveBeenCalledExactlyOnceWith('token');
                },
            ),
        );
    },
);
it('does no binding lookup on an OAuth failure without a session', async () => {
    const { run, oauth } = setup();
    oauth.authenticate.mockRejectedValue(new Error('Invalid token'));
    await run(allowOauthAuthentication);
    expect(oauth.isAccessTokenBoundToGrant).not.toHaveBeenCalled();
});

describe('revoked bound bearer lifecycle with a live session', () => {
    const cases = [
        'revoke',
        'replace',
        'refresh_reuse',
        'refresh_race',
    ] as const;
    const middlewares = [
        allowApiKeyAuthentication,
        allowOauthAuthentication,
        allowApiKeyAuthenticationIfPresent,
    ];
    it.each(
        cases.flatMap((lifecycle) =>
            middlewares.map((middleware) => ({ lifecycle, middleware })),
        ),
    )(
        'refuses $lifecycle before the downstream handler through $middleware.name',
        async ({ lifecycle, middleware }) => {
            const { req, user, grant, deps, run, downstream } = setup();
            const database = knex({ client: MockClient, dialect: 'pg' });
            const tracker = getTracker();
            const grantRow = {
                agent_connection_grant_uuid: grant.grantUuid,
                organization_uuid: grant.organizationUuid,
                subject_user_uuid: grant.subjectUserUuid,
                client_id: grant.clientId,
                credential_kind: grant.credentialKind,
                actor_kind: grant.actorKind,
                name: grant.name,
                resource: grant.resource,
                refresh_family_uuid: grant.refreshFamilyUuid,
                approved_capabilities: grant.approvedCapabilities,
                approved_project_uuids: grant.approvedProjectUuids,
                resource_constraints: grant.resourceConstraints,
                grant_contract_version: grant.grantContractVersion,
                grant_revision: grant.grantRevision,
                approval_policy_version: grant.approvalPolicyVersion,
                approved_by_user_uuid: grant.approvedByUserUuid,
                approval_method: grant.approvalMethod,
                approved_at: grant.approvedAt,
                approval_request_uuid: grant.approvalRequestUuid,
                expires_at: grant.expiresAt,
                revoked_at: null as Date | null,
                revoked_by_user_uuid: null,
                revocation_reason: null,
                replaced_by_grant_uuid: null,
                created_at: grant.createdAt,
                last_used_at: null,
            };
            const tokenRow = {
                access_token: 'token',
                refresh_token: 'refresh',
                expires_at: grant.expiresAt,
                revoked_at: new Date(),
                client_id: grant.clientId,
                user_id: 42,
                user_uuid: user.userUuid,
                organization_uuid: user.organizationUuid,
                resource: grant.resource,
                family_uuid: grant.refreshFamilyUuid,
                agent_connection_grant_uuid: grant.grantUuid,
                scope: ['read'],
            };
            let accessStored = true;
            let unboundFamilyStored = true;
            tracker.on
                .select('agent_connection_grants')
                .response(() => grantRow);
            tracker.on.update('agent_connection_grants').response(({ sql }) => {
                if (sql.includes('revoked_at'))
                    grantRow.revoked_at = new Date();
                return [grantRow];
            });
            tracker.on.select('projects').response(
                grant.approvedProjectUuids.map((project_uuid) => ({
                    project_uuid,
                })),
            );
            tracker.on
                .insert('agent_connection_grants')
                .response([
                    { ...grantRow, agent_connection_grant_uuid: 'replacement' },
                ]);
            tracker.on.delete('oauth2_authorization_codes').response(1);
            tracker.on
                .update('oauth2_refresh_tokens')
                .response(({ sql }) =>
                    sql.includes('"revoked_at" is null') ? 0 : 1,
                );
            tracker.on.select('oauth2_refresh_tokens').response(tokenRow);
            tracker.on.any(/pg_advisory/).response([]);
            tracker.on.delete('oauth2_access_tokens').response(({ sql }) => {
                if (!sql.includes('"agent_connection_grant_uuid" is null'))
                    accessStored = false;
                if (sql.includes('"family_uuid" ='))
                    unboundFamilyStored = false;
                return 1;
            });
            tracker.on
                .select('oauth2_access_tokens')
                .response(() => (accessStored ? tokenRow : undefined));
            tracker.on.select('users').response({ user_uuid: user.userUuid });
            const transaction = database.transaction.bind(database);
            const transactionSpy = vi
                .spyOn(database, 'transaction')
                .mockImplementation((async (
                    callback: (trx: Knex.Transaction) => Promise<unknown>,
                ) =>
                    transaction(async (trx) => {
                        Object.defineProperty(trx, 'transaction', {
                            configurable: true,
                            value: async (
                                nested: (
                                    inner: Knex.Transaction,
                                ) => Promise<unknown>,
                            ) => nested(trx),
                        });
                        return callback(trx);
                    })) as typeof database.transaction);
            const grants = new AgentConnectionGrantModel({ database });
            const oauthModel = new OAuth2Model(
                database,
                lightdashConfigMock,
                deps.featureFlags,
            );
            const oauthService = new OAuthService({
                oauthModel,
                userModel: {} as UserModel,
                lightdashConfig: lightdashConfigMock,
            });
            req.services.getOauthService = () => oauthService;
            req.account = fromApiKey(user, 'pat');
            req.isAuthenticated = (() => true) as Request['isAuthenticated'];
            req.route.stack[0].handle = Object.defineProperty(
                () => {},
                'name',
                { value: 'UserController_createPersonalAccessToken' },
            );
            try {
                if (lifecycle === 'revoke') {
                    await grants.revoke({
                        organizationUuid: grant.organizationUuid,
                        grantUuid: grant.grantUuid,
                        revokedByUserUuid: user.userUuid,
                        reason: 'user_request',
                    });
                } else if (lifecycle === 'replace') {
                    await grants.replace({
                        organizationUuid: grant.organizationUuid,
                        oldGrantUuid: grant.grantUuid,
                        actorUserUuid: user.userUuid,
                        newGrantInput: {
                            organizationUuid: grant.organizationUuid,
                            subjectUserUuid: user.userUuid,
                            clientId: grant.clientId,
                            name: grant.name,
                            resource: grant.resource,
                            approvedCapabilities: grant.approvedCapabilities,
                            approvedProjectUuids: grant.approvedProjectUuids,
                            resourceConstraints: grant.resourceConstraints,
                            approvalPolicyVersion: null,
                            approvedByUserUuid: user.userUuid,
                            approvalRequestUuid: null,
                            expiresAt: grant.expiresAt,
                        },
                    });
                } else if (lifecycle === 'refresh_reuse') {
                    expect(await oauthModel.getRefreshToken('refresh')).toBe(
                        false,
                    );
                } else {
                    await expect(
                        oauthModel.saveToken(
                            {
                                accessToken: 'rotated',
                                refreshToken: 'rotated-refresh',
                                parentRefreshToken: 'refresh',
                                agentConnectionGrantUuid: grant.grantUuid,
                                familyUuid: grant.refreshFamilyUuid,
                                resource: grant.resource,
                                scope: ['read'],
                                client: {
                                    id: grant.clientId,
                                    grants: [
                                        'authorization_code',
                                        'refresh_token',
                                    ],
                                },
                                user: {
                                    userId: 42,
                                    userUuid: user.userUuid,
                                    organizationUuid: grant.organizationUuid,
                                },
                            },
                            {
                                id: grant.clientId,
                                grants: ['authorization_code', 'refresh_token'],
                            },
                            {
                                userId: 42,
                                organizationUuid: grant.organizationUuid,
                            },
                        ),
                    ).rejects.toMatchObject({ name: 'invalid_grant' });
                }
                expect(grantRow.revoked_at).toBeInstanceOf(Date);
                expect(await run(middleware)).toEqual({
                    status: 401,
                    body: { error: 'invalid_token' },
                });
                expect(downstream).not.toHaveBeenCalled();
                expect(
                    await oauthModel.isAccessTokenBoundToGrant('token'),
                ).toBe(true);
                expect(unboundFamilyStored).toBe(false);
                expect(passport.authenticate).not.toHaveBeenCalled();
                expect(authenticateServiceAccount).not.toHaveBeenCalled();
            } finally {
                transactionSpy.mockRestore();
                tracker.reset();
                await database.destroy();
            }
        },
    );
});
