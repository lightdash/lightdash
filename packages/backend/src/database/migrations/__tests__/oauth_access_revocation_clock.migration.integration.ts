import {
    AgentCapability,
    FeatureFlags,
    OrganizationMemberRole,
    ProjectType,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OAuth2Model } from '../../../models/OAuth2Model';
import { UserModel } from '../../../models/UserModel';
import { OAuthService } from '../../../services/OAuthService/OAuthService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

const lightdashConfig = {
    ...lightdashConfigMock,
    auth: {
        ...lightdashConfigMock.auth,
        oauthServer: {
            accessTokenLifetime: 3600,
            refreshTokenLifetime: 86400,
            mobileRefreshTokenLifetime: 86400,
            refreshTokenRotationGrace: 0,
        },
    },
};
let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

const fixture = async () => {
    const { database } = migrated;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Access revocation clock' })
        .returning('*');
    const [user] = await database('users')
        .insert({
            first_name: 'Clock',
            last_name: 'Person',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    await database('organization_memberships').insert({
        organization_id: organization.organization_id,
        user_id: user.user_id,
        role: OrganizationMemberRole.MEMBER,
    });
    const [project] = await database('projects')
        .insert({
            organization_id: organization.organization_id,
            name: 'Clock project',
            project_type: ProjectType.DEFAULT,
            created_by_user_uuid: user.user_uuid,
            dbt_connection: null,
            dbt_connection_type: null,
            copied_from_project_uuid: null,
            dbt_version: '1.7',
            organization_warehouse_credentials_uuid: null,
        })
        .returning('*');
    const clientId = randomUUID();
    await database('oauth2_clients').insert({
        client_id: clientId,
        client_name: 'Clock client',
        redirect_uris: ['http://localhost:8080/callback'],
        grants: ['authorization_code', 'refresh_token'],
        scopes: ['read', 'write'],
    });
    const model = new OAuth2Model(database, lightdashConfig, {
        get: async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: featureFlagId === FeatureFlags.AgentIdentity,
        }),
    });
    const service = new OAuthService({
        oauthModel: model,
        userModel: new UserModel({
            database,
            lightdashConfig,
            featureFlagModel: new FeatureFlagModel({
                database,
                lightdashConfig,
            }),
        }),
        lightdashConfig,
    });
    const grants = new AgentConnectionGrantModel({ database });
    const createConnection = async () => {
        const capability = AgentCapability.ReadDiscover;
        const grant = await grants.create({
            organizationUuid: organization.organization_uuid,
            subjectUserUuid: user.user_uuid,
            clientId,
            name: 'Clock connection',
            resource: lightdashConfig.siteUrl,
            approvedCapabilities: [capability],
            approvedProjectUuids: [project.project_uuid],
            resourceConstraints: {
                version: 2,
                projectCapabilities: { [project.project_uuid]: [capability] },
            },
            approvalPolicyVersion: null,
            approvedByUserUuid: user.user_uuid,
            approvalRequestUuid: randomUUID(),
            expiresAt: new Date(Date.now() + 86400000),
        });
        const familyUuid = randomUUID();
        await grants.bindRefreshFamily({
            organizationUuid: organization.organization_uuid,
            grantUuid: grant.grantUuid,
            familyUuid,
        });
        const accessToken = randomUUID();
        const refreshToken = randomUUID();
        const fields = {
            client_id: clientId,
            user_id: user.user_id,
            organization_uuid: organization.organization_uuid,
            scope: ['read', 'write'],
            resource: grant.resource,
            family_uuid: familyUuid,
            agent_connection_grant_uuid: grant.grantUuid,
            expires_at: new Date(Date.now() + 3600000),
        };
        await database('oauth2_access_tokens').insert({
            ...fields,
            access_token: accessToken,
        });
        await database('oauth2_refresh_tokens').insert({
            ...fields,
            refresh_token: refreshToken,
        });
        const authenticate = (token: string = accessToken) =>
            service.authenticate(
                new OAuth2Server.Request({
                    method: 'GET',
                    headers: { authorization: `Bearer ${token}` },
                    query: {},
                    body: {},
                }),
                new OAuth2Server.Response({}),
            );
        const refresh = () =>
            service.token(
                new OAuth2Server.Request({
                    method: 'POST',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                        'transfer-encoding': 'chunked',
                    },
                    query: {},
                    body: {
                        client_id: clientId,
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                        resource: grant.resource,
                    },
                }),
                new OAuth2Server.Response({}),
            );
        return { grant, accessToken, refreshToken, authenticate, refresh };
    };
    return { database, model, service, grants, createConnection };
};

it('refuses a revoked access token immediately when the API clock is years behind Postgres', async () => {
    const f = await fixture();
    const revoked = await f.createConnection();
    const unrelated = await f.createConnection();
    const apiTime = new Date('2000-01-01T00:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'], now: apiTime });
    try {
        const { rows } = await f.database.raw<{ rows: { now: Date }[] }>(
            'select now()',
        );
        expect(rows[0].now.getTime()).toBeGreaterThan(
            apiTime.getTime() + 60000,
        );
        await expect(revoked.authenticate()).resolves.toMatchObject({
            accessToken: revoked.accessToken,
        });
        await expect(unrelated.authenticate()).resolves.toMatchObject({
            accessToken: unrelated.accessToken,
        });
        const grantBefore = await f.grants.find(revoked.grant.grantUuid);
        const refreshBefore = await f
            .database('oauth2_refresh_tokens')
            .where('refresh_token', revoked.refreshToken)
            .first();
        await expect(f.service.revokeToken(revoked.accessToken)).resolves.toBe(
            true,
        );
        await expect(revoked.authenticate()).rejects.toMatchObject({
            name: 'invalid_token',
            message: 'Invalid token: access token has expired',
            code: 401,
        });
        expect(Date.now()).toBe(apiTime.getTime());
        const revokedRow = await f
            .database('oauth2_access_tokens')
            .where('access_token', revoked.accessToken)
            .first();
        expect(revokedRow).toMatchObject({
            expires_at: new Date(0),
            agent_connection_grant_uuid: revoked.grant.grantUuid,
        });
        await expect(
            f.model.isAccessTokenBoundToGrant(revoked.accessToken),
        ).resolves.toBe(true);
        await expect(f.service.revokeToken(revoked.accessToken)).resolves.toBe(
            true,
        );
        expect(
            await f
                .database('oauth2_access_tokens')
                .where('access_token', revoked.accessToken)
                .first(),
        ).toEqual(revokedRow);
        await expect(
            f.grants.findActive(revoked.grant.grantUuid, new Date()),
        ).resolves.toEqual(grantBefore);
        expect(
            await f
                .database('oauth2_refresh_tokens')
                .where('refresh_token', revoked.refreshToken)
                .first(),
        ).toEqual(refreshBefore);
        await expect(
            f.model.getRefreshToken(revoked.refreshToken),
        ).resolves.toMatchObject({ refreshToken: revoked.refreshToken });
        await expect(unrelated.authenticate()).resolves.toMatchObject({
            accessToken: unrelated.accessToken,
        });
    } finally {
        vi.useRealTimers();
    }
    const rotated = await revoked.refresh();
    expect(rotated.refreshToken).toBeDefined();
    expect(rotated.refreshToken).not.toBe(revoked.refreshToken);
    await expect(
        revoked.authenticate(rotated.accessToken),
    ).resolves.toMatchObject({ accessToken: rotated.accessToken });
    await expect(unrelated.authenticate()).resolves.toMatchObject({
        accessToken: unrelated.accessToken,
    });
});

it('keeps a bound expiry before the epoch unchanged on repeated revocation', async () => {
    const f = await fixture();
    const connection = await f.createConnection();
    const expiresAt = new Date('1969-12-31T23:59:59.000Z');
    await f
        .database('oauth2_access_tokens')
        .where('access_token', connection.accessToken)
        .update({ expires_at: expiresAt });
    const revokeAndCheckExpiry = async () => {
        await expect(
            f.service.revokeToken(connection.accessToken),
        ).resolves.toBe(true);
        expect(
            await f
                .database('oauth2_access_tokens')
                .where('access_token', connection.accessToken)
                .first(),
        ).toMatchObject({ expires_at: expiresAt });
    };
    await revokeAndCheckExpiry();
    await revokeAndCheckExpiry();
});

it.each(['America/New_York', 'Asia/Tokyo'])(
    'stores the same fixed expiry when the database session uses %s',
    async (timeZone) => {
        const f = await fixture();
        const live = await f.createConnection();
        const early = await f.createConnection();
        const earlyExpiry = new Date('1969-12-31T23:59:59.000Z');
        await f
            .database('oauth2_access_tokens')
            .where('access_token', early.accessToken)
            .update({ expires_at: earlyExpiry });
        await f.database.transaction(async (trx) => {
            await trx.raw('select set_config(?, ?, true)', [
                'TimeZone',
                timeZone,
            ]);
            const model = new OAuth2Model(trx, lightdashConfig, {
                get: async ({ featureFlagId }) => ({
                    id: featureFlagId,
                    enabled: featureFlagId === FeatureFlags.AgentIdentity,
                }),
            });
            await expect(
                model.deleteAccessToken(live.accessToken),
            ).resolves.toBe(true);
            await expect(
                model.deleteAccessToken(early.accessToken),
            ).resolves.toBe(true);
        });
        const expiry = async (token: string) =>
            (
                await f
                    .database('oauth2_access_tokens')
                    .where('access_token', token)
                    .first()
            )?.expires_at;
        expect(await expiry(live.accessToken)).toEqual(new Date(0));
        expect(await expiry(early.accessToken)).toEqual(earlyExpiry);
        await expect(live.authenticate()).rejects.toMatchObject({
            name: 'invalid_token',
        });
    },
);
