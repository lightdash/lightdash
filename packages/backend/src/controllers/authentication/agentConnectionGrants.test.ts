import {
    AgentActorSurface,
    AgentCapability,
    FeatureFlags,
    LightdashMode,
} from '@lightdash/common';
import { type Request } from 'express';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import passport from 'passport';
import { fromSession } from '../../auth/account';
import { fromApiKey } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { AgentConnectionGrantService } from '../../auth/agentConnectionGrants/AgentConnectionGrantService';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { authenticateServiceAccount } from '../../ee/authentication';
import { AgentConnectionGrantModel } from '../../models/AgentConnectionGrantModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../models/OAuth2Model';
import { type UserModel } from '../../models/UserModel';
import {
    agentExecutionContext,
    buildResultReader,
} from '../../services/AiAccessService/agentExecutionContext';
import { OAuthService } from '../../services/OAuthService/OAuthService';
import { setupGrantAuthentication } from './agentConnectionGrants.mock';
import {
    allowApiKeyAuthentication,
    allowApiKeyAuthenticationIfPresent,
    allowOauthAuthentication,
} from './middlewares';

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));
const setup = () =>
    setupGrantAuthentication({
        ...defaultSessionUser,
        userUuid: 'user',
        organizationUuid: 'org',
    });
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
        permissions.getEnforcementMode.mockResolvedValue(
            managed ? 'managed' : 'off',
        );
        expect((await run(allowApiKeyAuthentication)).error).toMatchObject({
            message: expect.stringContaining('project'),
        });
    };
    await check(false);
    await check(true);
    expect(permissions.assertOperation).not.toHaveBeenCalled();
});
it('checks the grant before group admission when limits are off', async () => {
    const { req, run, grant, permissions } = setup();
    permissions.getEnforcementMode.mockResolvedValue('admission');
    req.params.projectUuid = 'outside';
    expect((await run(allowApiKeyAuthentication)).error).toMatchObject({
        message: expect.stringContaining('project'),
    });
    expect(permissions.assertOperation).not.toHaveBeenCalled();
    [req.params.projectUuid] = grant.approvedProjectUuids;
    expect((await run(allowApiKeyAuthentication)).error).toBeUndefined();
    expect(permissions.assertOperation).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ kind: 'rest_operation', projectUuid: null }),
    );
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
    permissions.getEnforcementMode.mockResolvedValue('managed');
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
        'revoke_access',
        'revoke_access_after_grant',
        'revoke_refresh',
        'revoke_expired_access',
        'revoke_unbound_access',
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
            const originalExpiry =
                lifecycle === 'revoke_expired_access'
                    ? new Date(Date.now() - 60000)
                    : grant.expiresAt;
            const tokenRow = {
                access_token: 'token',
                refresh_token: 'refresh',
                expires_at: originalExpiry,
                revoked_at: lifecycle === 'revoke_refresh' ? null : new Date(),
                client_id: grant.clientId,
                user_id: 42,
                user_uuid: user.userUuid,
                organization_uuid: user.organizationUuid,
                resource: grant.resource,
                family_uuid: grant.refreshFamilyUuid,
                agent_connection_grant_uuid:
                    lifecycle === 'revoke_unbound_access'
                        ? null
                        : grant.grantUuid,
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
            tracker.on
                .select('oauth2_refresh_tokens')
                .response(({ bindings }) =>
                    bindings.includes('refresh') ? tokenRow : undefined,
                );
            tracker.on.delete('oauth2_refresh_tokens').response(1);
            tracker.on.update('oauth2_access_tokens').response(({ sql }) => {
                if (tokenRow.agent_connection_grant_uuid === null) return 0;
                if (sql.includes('least(expires_at, now())'))
                    tokenRow.expires_at = new Date(
                        Math.min(tokenRow.expires_at.getTime(), Date.now()),
                    );
                return 1;
            });
            tracker.on.any(/pg_advisory/).response([]);
            tracker.on.delete('oauth2_access_tokens').response(({ sql }) => {
                if (
                    !sql.includes('"agent_connection_grant_uuid" is null') ||
                    tokenRow.agent_connection_grant_uuid === null
                )
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
                if (
                    lifecycle === 'revoke' ||
                    lifecycle === 'revoke_access_after_grant'
                ) {
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
                } else if (lifecycle === 'refresh_race') {
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
                if (lifecycle === 'revoke_unbound_access') {
                    expect(await oauthService.revokeToken('token')).toBe(true);
                    expect(accessStored).toBe(false);
                    expect(await run(middleware)).toEqual({
                        status: 200,
                        error: undefined,
                    });
                    expect(downstream).toHaveBeenCalledOnce();
                    expect(grantRow.revoked_at).toBeNull();
                    return;
                }
                if (
                    lifecycle === 'revoke_access' ||
                    lifecycle === 'revoke_expired_access' ||
                    lifecycle === 'revoke_access_after_grant'
                ) {
                    expect(await oauthService.revokeToken('token')).toBe(true);
                    expect(tokenRow.expires_at.getTime()).toBeLessThanOrEqual(
                        Date.now(),
                    );
                } else if (lifecycle === 'revoke_refresh') {
                    expect(await oauthService.revokeToken('refresh')).toBe(
                        true,
                    );
                }
                if (
                    lifecycle === 'revoke_access' ||
                    lifecycle === 'revoke_expired_access'
                ) {
                    expect(grantRow.revoked_at).toBeNull();
                } else {
                    expect(grantRow.revoked_at).toBeInstanceOf(Date);
                }
                expect(await run(middleware)).toEqual({
                    status: 401,
                    body: { error: 'invalid_token' },
                });
                expect(downstream).not.toHaveBeenCalled();
                expect(
                    await oauthModel.isAccessTokenBoundToGrant('token'),
                ).toBe(true);
                expect(unboundFamilyStored).toBe(
                    lifecycle === 'revoke_access' ||
                        lifecycle === 'revoke_expired_access',
                );
                expect(tokenRow.expires_at.getTime()).toBeLessThanOrEqual(
                    originalExpiry.getTime(),
                );
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

describe.each([
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    allowApiKeyAuthenticationIfPresent,
])('trusted connection continuation through %s', (middleware) => {
    it.each([false, true])(
        'keeps the validated scope through next and a later callback (cookie=%s)',
        async (cookie) => {
            const f = setup();
            f.req.body = { surface: 'mcp', agentIdentity: { sub: 'forged' } };
            if (cookie) {
                f.req.account = fromSession({
                    ...f.user,
                    userUuid: 'another-person',
                });
                f.req.isAuthenticated = (() =>
                    true) as Request['isAuthenticated'];
            }
            f.permissions.isManaged.mockResolvedValue(true);
            f.downstream.mockImplementation(async () => {
                const scope = agentExecutionContext.getStore();
                expect(scope).toMatchObject({
                    surface: AgentActorSurface.CLI,
                    organizationUuid: 'org',
                    writerUuid: 'user',
                    agentIdentityEnabled: true,
                    claim: {
                        sub: 'user:user',
                        subject: { type: 'user', uuid: 'user' },
                        act: {
                            sub: 'cli:lightdash-cli',
                            client_id: 'lightdash-cli',
                            agent_uuid: null,
                            agent_connection_grant: {
                                grantUuid: 'grant',
                                revision: 1,
                            },
                        },
                    },
                });
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
                expect(agentExecutionContext.getStore()).toBe(scope);
                expect(buildResultReader(f.req.account!)).toMatchObject({
                    kind: 'agent',
                    claim: scope!.claim,
                });
            });
            expect(await f.run(middleware)).toEqual({
                status: 200,
                error: undefined,
            });
            expect(f.downstream).toHaveBeenCalledOnce();
            expect(f.permissions.assertOperation).toHaveBeenCalledWith(
                expect.objectContaining({ surface: AgentActorSurface.CLI }),
            );
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
    it.each(['oauth', 'pat', 'session'] as const)(
        'ignores forged CLI fields for ordinary %s credentials',
        async (kind) => {
            const f = setup();
            f.token.agentConnectionGrantUuid = null as unknown as string;
            f.req.body = {
                surface: 'cli',
                agentIdentity: {
                    act: {
                        agent_connection_grant: {
                            grantUuid: 'forged',
                            revision: 1,
                        },
                    },
                },
            };
            f.req.headers['x-agent-surface'] = 'cli';
            if (kind !== 'oauth') {
                f.req.account =
                    kind === 'pat'
                        ? fromApiKey(f.user, 'pat')
                        : fromSession(f.user);
                f.req.isAuthenticated = (() =>
                    true) as Request['isAuthenticated'];
                f.req.headers.authorization =
                    kind === 'pat' ? 'ApiKey pat' : undefined;
            }
            f.downstream.mockImplementation(() => {
                expect(agentExecutionContext.getStore()).toBeUndefined();
                expect(buildResultReader(f.req.account!)).toMatchObject({
                    kind: 'person',
                });
            });
            expect((await f.run(middleware)).error).toBeUndefined();
            expect(f.downstream).toHaveBeenCalledOnce();
        },
    );
    it.each([
        'subject flag',
        'org flag',
        'inactive',
        'unsupported client',
        'failed bound bearer',
    ] as const)('never enters a scope for %s', async (failure) => {
        const f = setup();
        const run = vi.spyOn(agentExecutionContext, 'run');
        if (failure === 'inactive')
            f.deps.model.findActive.mockResolvedValue(null);
        if (failure === 'unsupported client') {
            f.grant.clientId = 'other';
            f.token.client.id = 'other';
        }
        if (failure === 'subject flag' || failure === 'org flag')
            f.deps.featureFlags.get.mockImplementation(async ({ user }) => ({
                enabled:
                    failure === 'subject flag'
                        ? user.userUuid === undefined
                        : user.userUuid !== undefined,
            }));
        if (failure === 'failed bound bearer') {
            f.req.account = fromSession({
                ...f.user,
                userUuid: 'another-person',
            });
            f.req.isAuthenticated = (() => true) as Request['isAuthenticated'];
            f.oauth.authenticate.mockRejectedValue(new Error('Expired'));
            f.oauth.isAccessTokenBoundToGrant.mockResolvedValue(true);
        }
        try {
            expect((await f.run(middleware)).status).toBe(401);
            expect(run).not.toHaveBeenCalled();
            expect(f.downstream).not.toHaveBeenCalled();
            expect(passport.authenticate).not.toHaveBeenCalled();
            expect(authenticateServiceAccount).not.toHaveBeenCalled();
        } finally {
            run.mockRestore();
        }
    });
    it('keeps the connection on a refused permission check without running downstream', async () => {
        const f = setup();
        f.permissions.isManaged.mockResolvedValue(true);
        const refusal = new Error('Permission refused');
        f.permissions.assertOperation.mockImplementation(async () => {
            expect(
                agentExecutionContext.getStore()?.claim?.act
                    .agent_connection_grant,
            ).toEqual({ grantUuid: 'grant', revision: 1 });
            throw refusal;
        });
        expect((await f.run(middleware)).error).toBe(refusal);
        expect(f.downstream).not.toHaveBeenCalled();
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });
    it('isolates concurrent connection requests', async () => {
        const a = setup();
        const b = setup();
        b.grant.grantUuid = 'second';
        b.token.agentConnectionGrantUuid = 'second';
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        a.downstream.mockImplementation(async () => {
            await gate;
            expect(
                agentExecutionContext.getStore()?.claim?.act
                    .agent_connection_grant?.grantUuid,
            ).toBe('grant');
        });
        b.downstream.mockImplementation(async () => {
            try {
                expect(
                    agentExecutionContext.getStore()?.claim?.act
                        .agent_connection_grant?.grantUuid,
                ).toBe('second');
            } finally {
                release();
            }
        });
        await Promise.all([a.run(middleware), b.run(middleware)]);
        expect(agentExecutionContext.getStore()).toBeUndefined();
    });
});
