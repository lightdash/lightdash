import OAuth2Server from '@node-oauth/oauth2-server';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { createHash } from 'node:crypto';
import { grantFixture } from '../auth/agentConnectionGrants/grant.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import oauthRouter from '../routers/oauthRouter';
import { OAuthService } from '../services/OAuthService/OAuthService';
import { AgentConnectionGrantModel } from './AgentConnectionGrantModel';
import { OAuth2Model } from './OAuth2Model';
import { type UserModel } from './UserModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const flags = { get: vi.fn().mockResolvedValue({ enabled: true }) };
const model = new OAuth2Model(database, lightdashConfigMock, flags);
const client = {
    id: 'client',
    grants: ['authorization_code', 'refresh_token'],
};
const user = { userId: 42, userUuid: 'user', organizationUuid: 'org' };
const grant = () => grantFixture();
const row = (overrides = {}) => ({
    access_token: 'access',
    refresh_token: 'refresh',
    authorization_code: 'code',
    expires_at: new Date(Date.now() + 60000),
    revoked_at: null,
    client_id: client.id,
    user_id: 42,
    user_uuid: 'user',
    organization_uuid: 'org',
    resource: grant().resource,
    family_uuid: 'family',
    agent_connection_grant_uuid: 'grant',
    scope: ['read'],
    ...overrides,
});
beforeEach(() => {
    flags.get.mockResolvedValue({ enabled: true });
    getTracker()
        .on.select(/from "users"/)
        .response({ user_uuid: 'user' });
    vi.spyOn(
        AgentConnectionGrantModel.prototype,
        'findActive',
    ).mockResolvedValue(grant());
    vi.spyOn(
        AgentConnectionGrantModel.prototype,
        'bindRefreshFamily',
    ).mockResolvedValue(undefined);
    vi.spyOn(AgentConnectionGrantModel.prototype, 'revoke').mockResolvedValue(
        undefined,
    );
});
afterEach(() => {
    vi.restoreAllMocks();
    getTracker().reset();
});
it.each(['access', 'refresh', 'code'])(
    'reads the binding and family from %s',
    async (kind) => {
        getTracker()
            .on.select(/from "oauth2_/)
            .response(row());
        const lookups = {
            access: () => model.getAccessToken('access'),
            refresh: () => model.getRefreshToken('refresh'),
            code: () => model.getAuthorizationCode('code'),
        };
        const result = await lookups[kind as keyof typeof lookups]();
        expect(result).toMatchObject({
            agentConnectionGrantUuid: 'grant',
            familyUuid: 'family',
            resource: grant().resource,
        });
    },
);
it('saves a bound code without issuing a grant', async () => {
    getTracker().on.insert('oauth2_authorization_codes').response([]);
    const saved = await model.saveAuthorizationCode(
        {
            authorizationCode: 'code',
            expiresAt: new Date(),
            redirectUri: 'http://localhost/callback',
            scope: ['read'],
            resource: grant().resource,
            agentConnectionGrantUuid: 'grant',
        },
        client,
        user,
    );
    expect(saved.agentConnectionGrantUuid).toBe('grant');
    expect(getTracker().history.insert[0].sql).toContain(
        'agent_connection_grant_uuid',
    );
    expect(getTracker().history.insert[0].bindings).toContain('grant');
});
it('binds the code-exchange family and clips both expiries', async () => {
    const active = grant();
    active.refreshFamilyUuid = null;
    vi.mocked(AgentConnectionGrantModel.prototype.findActive).mockResolvedValue(
        active,
    );
    getTracker()
        .on.insert(/oauth2_/)
        .response([]);
    getTracker().on.delete('oauth2_refresh_tokens').response(0);
    const saved = await model.saveToken(
        {
            accessToken: 'access',
            refreshToken: 'refresh',
            accessTokenExpiresAt: new Date(Date.now() + 3600000),
            refreshTokenExpiresAt: new Date(Date.now() + 86400000),
            scope: ['read'],
            resource: active.resource,
            familyUuid: 'family',
            agentConnectionGrantUuid: 'grant',
            client,
            user,
        },
        client,
        user,
    );
    expect(saved).toMatchObject({
        agentConnectionGrantUuid: 'grant',
        familyUuid: 'family',
        accessTokenExpiresAt: active.expiresAt,
        refreshTokenExpiresAt: active.expiresAt,
    });
    expect(
        AgentConnectionGrantModel.prototype.bindRefreshFamily,
    ).toHaveBeenCalledWith({
        grantUuid: 'grant',
        organizationUuid: 'org',
        familyUuid: 'family',
    });
    expect(getTracker().history.insert).toHaveLength(2);
    for (const query of getTracker().history.insert)
        expect(query.bindings).toContain('grant');
});
it.each([
    'inactive',
    'subject',
    'org',
    'client',
    'resource',
    'family',
    'flag_off',
])('refuses refresh with %s grant', async (mismatch) => {
    const active = grant();
    if (mismatch === 'subject') active.subjectUserUuid = 'other';
    if (mismatch === 'org') active.organizationUuid = 'other';
    if (mismatch === 'client') active.clientId = 'other';
    if (mismatch === 'resource') active.resource = 'other';
    if (mismatch === 'family') active.refreshFamilyUuid = 'other';
    if (mismatch === 'flag_off')
        flags.get.mockResolvedValue({ enabled: false });
    vi.mocked(AgentConnectionGrantModel.prototype.findActive).mockResolvedValue(
        mismatch === 'inactive' ? null : active,
    );
    getTracker().on.select('oauth2_refresh_tokens').response(row());
    await expect(model.getRefreshToken('refresh')).rejects.toMatchObject({
        name: 'invalid_grant',
    });
});
it('revokes the connection on reuse even with the ordinary flag off', async () => {
    flags.get.mockResolvedValue({ enabled: false });
    getTracker()
        .on.select('oauth2_refresh_tokens')
        .response(row({ revoked_at: new Date() }));
    getTracker()
        .on.any(/pg_advisory/)
        .response([]);
    getTracker().on.update('oauth2_refresh_tokens').response(1);
    getTracker().on.delete('oauth2_access_tokens').response(1);
    expect(await model.getRefreshToken('refresh')).toBe(false);
    expect(AgentConnectionGrantModel.prototype.revoke).toHaveBeenCalledWith({
        grantUuid: 'grant',
        organizationUuid: 'org',
        revokedByUserUuid: null,
        reason: 'refresh_reuse',
    });
});
it('keeps unbound access-token values with explicit null bindings', async () => {
    getTracker()
        .on.select('oauth2_access_tokens')
        .response(
            row({
                agent_connection_grant_uuid: null,
                family_uuid: null,
                resource: null,
            }),
        );
    expect(await model.getAccessToken('access')).toEqual({
        accessToken: 'access',
        accessTokenExpiresAt: expect.any(Date),
        scope: ['read'],
        resource: null,
        familyUuid: null,
        agentConnectionGrantUuid: null,
        client: {
            id: 'client',
            scopes: [],
            redirectUris: undefined,
            grants: undefined,
        },
        user,
    });
    expect(
        AgentConnectionGrantModel.prototype.findActive,
    ).not.toHaveBeenCalled();
});

it('cannot change scopes when saving a bound refresh', async () => {
    getTracker().on.select('oauth2_refresh_tokens').response(row());
    getTracker()
        .on.any(/pg_advisory/)
        .response([]);
    getTracker().on.update('oauth2_refresh_tokens').response(1);
    getTracker()
        .on.insert(/oauth2_/)
        .response([]);
    getTracker().on.delete('oauth2_refresh_tokens').response(0);
    await expect(
        model.saveToken(
            {
                accessToken: 'access',
                refreshToken: 'rotated',
                parentRefreshToken: 'refresh',
                agentConnectionGrantUuid: 'grant',
                familyUuid: 'family',
                resource: grant().resource,
                scope: ['write'],
                client,
                user,
            },
            client,
            user,
        ),
    ).rejects.toMatchObject({ name: 'invalid_scope' });
    expect(getTracker().history.insert).toHaveLength(0);
});
it('clips expiry again and retains the original scopes on refresh save', async () => {
    const active = grant();
    vi.mocked(AgentConnectionGrantModel.prototype.findActive).mockResolvedValue(
        active,
    );
    getTracker().on.select('oauth2_refresh_tokens').response(row());
    getTracker()
        .on.any(/pg_advisory/)
        .response([]);
    getTracker().on.update('oauth2_refresh_tokens').response(1);
    getTracker()
        .on.insert(/oauth2_/)
        .response([]);
    getTracker().on.delete('oauth2_refresh_tokens').response(0);
    await expect(
        model.saveToken(
            {
                accessToken: 'access',
                refreshToken: 'rotated',
                parentRefreshToken: 'refresh',
                agentConnectionGrantUuid: 'grant',
                familyUuid: 'family',
                resource: active.resource,
                accessTokenExpiresAt: new Date(Date.now() + 3600000),
                refreshTokenExpiresAt: new Date(Date.now() + 86400000),
                scope: ['read'],
                client,
                user,
            },
            client,
            user,
        ),
    ).resolves.toMatchObject({
        agentConnectionGrantUuid: 'grant',
        familyUuid: 'family',
        scope: ['read'],
        accessTokenExpiresAt: active.expiresAt,
        refreshTokenExpiresAt: active.expiresAt,
    });
});

it('propagates a model-created grant through code exchange and two refreshes', async () => {
    const tracker = getTracker();
    const approved = grant();
    const grantRow = {
        agent_connection_grant_uuid: approved.grantUuid,
        organization_uuid: approved.organizationUuid,
        subject_user_uuid: approved.subjectUserUuid,
        client_id: approved.clientId,
        credential_kind: approved.credentialKind,
        actor_kind: approved.actorKind,
        name: approved.name,
        resource: approved.resource,
        refresh_family_uuid: null,
        approved_capabilities: approved.approvedCapabilities,
        approved_project_uuids: approved.approvedProjectUuids,
        resource_constraints: approved.resourceConstraints,
        grant_contract_version: 1,
        grant_revision: 1,
        approval_policy_version: null,
        approved_by_user_uuid: approved.subjectUserUuid,
        approval_method: approved.approvalMethod,
        approved_at: approved.approvedAt,
        approval_request_uuid: null,
        expires_at: approved.expiresAt,
        revoked_at: null,
        revoked_by_user_uuid: null,
        revocation_reason: null,
        replaced_by_grant_uuid: null,
        created_at: approved.createdAt,
        last_used_at: null,
    };
    tracker.on.select('projects').response(
        approved.approvedProjectUuids.map((project_uuid) => ({
            project_uuid,
        })),
    );
    tracker.on.insert('agent_connection_grants').response([grantRow]);
    const created = await new AgentConnectionGrantModel({ database }).create(
        approved,
    );
    vi.mocked(AgentConnectionGrantModel.prototype.findActive).mockResolvedValue(
        created,
    );
    vi.mocked(
        AgentConnectionGrantModel.prototype.bindRefreshFamily,
    ).mockImplementation(async ({ familyUuid }) => {
        created.refreshFamilyUuid = familyUuid;
    });
    const verifier = 'a'.repeat(64);
    const code = {
        authorizationCode: 'code',
        expiresAt: new Date(Date.now() + 60000),
        redirectUri: 'http://localhost/callback',
        scope: ['read'],
        resource: created.resource,
        agentConnectionGrantUuid: created.grantUuid,
        codeChallenge: createHash('sha256')
            .update(verifier)
            .digest('base64url'),
        codeChallengeMethod: 'S256',
    };
    tracker.on.insert('oauth2_authorization_codes').response([]);
    tracker.on.select('oauth2_authorization_codes').response({
        ...row(),
        ...grantRow,
        authorization_code: code.authorizationCode,
        expires_at: code.expiresAt,
        redirect_uri: code.redirectUri,
        scope: code.scope,
        code_challenge: code.codeChallenge,
        code_challenge_method: 'S256',
        grants: client.grants,
        scopes: ['read'],
    });
    tracker.on.select(/from "oauth2_clients"/).response({
        client_id: client.id,
        grants: client.grants,
        redirect_uris: [code.redirectUri],
        scopes: ['read'],
    });
    tracker.on.insert(/oauth2_(access|refresh)_tokens/).response([]);
    tracker.on.delete(/oauth2_/).response(1);
    tracker.on.update('oauth2_refresh_tokens').response(1);
    tracker.on.any(/pg_advisory/).response([]);
    await model.saveAuthorizationCode(code, client, user);
    const service = new OAuthService({
        oauthModel: model,
        userModel: {} as UserModel,
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: created.resource,
            auth: {
                ...lightdashConfigMock.auth,
                oauthServer: {
                    accessTokenLifetime: 3600,
                    refreshTokenLifetime: 86400,
                    mobileRefreshTokenLifetime: 86400,
                    refreshTokenRotationGrace: 0,
                },
            },
        },
    });
    const exchange = (body: Record<string, string>) =>
        service.token(
            new OAuth2Server.Request({
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'transfer-encoding': 'chunked',
                },
                query: {},
                body: {
                    client_id: client.id,
                    client_secret: 'secret',
                    ...body,
                },
            }),
            new OAuth2Server.Response({}),
        );
    await exchange({
        grant_type: 'authorization_code',
        code: code.authorizationCode,
        redirect_uri: code.redirectUri,
        code_verifier: verifier,
    });
    const stored = (table: string) => {
        const query = tracker.history.insert
            .filter((item) => item.sql.includes(`"${table}"`))
            .at(-1)!;
        const columns = query.sql
            .match(/\(([^)]+)\) values/)![1]
            .split(',')
            .map((column) => column.trim().replaceAll('"', ''));
        return Object.fromEntries(
            columns.map((column, index) => [column, query.bindings[index]]),
        );
    };
    const family = stored('oauth2_refresh_tokens').family_uuid;
    expect(family).toEqual(expect.any(String));
    expect(created.refreshFamilyUuid).toBe(family);
    const rotate = async () => {
        const refreshRow = { ...row(), ...stored('oauth2_refresh_tokens') };
        expect(refreshRow.user_id).toBe(42);
        tracker.on.select('oauth2_refresh_tokens').responseOnce(refreshRow);
        tracker.on.select('oauth2_refresh_tokens').responseOnce(refreshRow);
        await exchange({
            grant_type: 'refresh_token',
            refresh_token: String(refreshRow.refresh_token),
        });
        for (const table of ['oauth2_access_tokens', 'oauth2_refresh_tokens']) {
            expect(stored(table)).toMatchObject({
                agent_connection_grant_uuid: created.grantUuid,
                family_uuid: family,
                scope: ['read'],
                resource: created.resource,
                expires_at: created.expiresAt,
            });
        }
    };
    await rotate();
    await rotate();
    expect(
        tracker.history.insert.filter((query) =>
            query.sql.includes('oauth2_access_tokens'),
        ),
    ).toHaveLength(3);
});

it('commits grant and family revocation when a bound refresh loses the rotation race', async () => {
    const tracker = getTracker();
    tracker.on
        .select('oauth2_refresh_tokens')
        .response(row({ revoked_at: new Date() }));
    tracker.on.any(/pg_advisory/).response([]);
    tracker.on.update('oauth2_refresh_tokens').responseOnce(0);
    tracker.on.update('oauth2_refresh_tokens').response(1);
    tracker.on.delete('oauth2_access_tokens').response(1);
    await expect(
        model.saveToken(
            {
                accessToken: 'access',
                refreshToken: 'rotated',
                parentRefreshToken: 'refresh',
                agentConnectionGrantUuid: 'grant',
                familyUuid: 'family',
                resource: grant().resource,
                scope: ['read'],
                client,
                user,
            },
            client,
            user,
        ),
    ).rejects.toMatchObject({ name: 'invalid_grant' });
    expect(AgentConnectionGrantModel.prototype.revoke).toHaveBeenCalledWith({
        grantUuid: 'grant',
        organizationUuid: 'org',
        revokedByUserUuid: null,
        reason: 'refresh_reuse',
    });
    expect(tracker.history.update.at(-1)?.bindings).toContain('family');
    expect(tracker.history.delete.at(-1)?.bindings).toContain('family');
    expect(
        tracker.history.transactions.every(
            (transaction) => transaction.state === 'committed',
        ),
    ).toBe(true);
    expect(tracker.history.insert).toHaveLength(0);
});

it('rejects an unsupported grant contract on refresh', async () => {
    const active = grant();
    active.grantContractVersion = 2;
    vi.mocked(AgentConnectionGrantModel.prototype.findActive).mockResolvedValue(
        active,
    );
    getTracker().on.select('oauth2_refresh_tokens').response(row());
    await expect(model.getRefreshToken('refresh')).rejects.toMatchObject({
        name: 'invalid_grant',
    });
});

it('refuses bound access-token authentication with the flag off', async () => {
    flags.get.mockResolvedValue({ enabled: false });
    getTracker().on.select('oauth2_access_tokens').response(row());
    await expect(model.getAccessToken('access')).rejects.toMatchObject({
        name: 'invalid_token',
    });
});
it('reports a disabled bound token as inactive through introspection', async () => {
    flags.get.mockResolvedValue({ enabled: false });
    getTracker().on.select('oauth2_access_tokens').response(row());
    const service = new OAuthService({
        userModel: {} as UserModel,
        oauthModel: model,
        lightdashConfig: lightdashConfigMock,
    });
    const handler = oauthRouter.stack.find(
        (layer) => layer.route?.path === '/introspect',
    )!.route.stack[0].handle;
    const req = {
        method: 'POST',
        query: {},
        headers: { authorization: 'Bearer access' },
        body: { token: 'access' },
        user,
        services: { getOauthService: () => service },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ active: false });
});
it.each(['inactive', 'subject', 'org', 'client', 'resource', 'family'])(
    'refuses access-token authentication with a %s binding',
    async (mismatch) => {
        const active = grant();
        if (mismatch === 'subject') active.subjectUserUuid = 'other';
        if (mismatch === 'org') active.organizationUuid = 'other';
        if (mismatch === 'client') active.clientId = 'other';
        if (mismatch === 'resource') active.resource = 'other';
        if (mismatch === 'family') active.refreshFamilyUuid = 'other';
        vi.mocked(
            AgentConnectionGrantModel.prototype.findActive,
        ).mockResolvedValue(mismatch === 'inactive' ? null : active);
        getTracker().on.select('oauth2_access_tokens').response(row());
        await expect(model.getAccessToken('access')).rejects.toMatchObject({
            name: 'invalid_token',
        });
    },
);
it('refuses a known bound token if lifecycle validation fails', async () => {
    vi.mocked(AgentConnectionGrantModel.prototype.findActive).mockRejectedValue(
        new Error('Grant storage unavailable'),
    );
    getTracker().on.select('oauth2_access_tokens').response(row());
    await expect(model.getAccessToken('access')).rejects.toMatchObject({
        name: 'invalid_token',
    });
});
