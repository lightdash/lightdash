import { FeatureFlags, OrganizationMemberRole } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { createHash, randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
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

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
afterEach(() => vi.restoreAllMocks());

const fixture = async (strict: boolean, hashed: boolean) => {
    const { database } = migrated;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'OAuth lifecycle' })
        .returning('*');
    const [user] = await database('users')
        .insert({
            first_name: 'OAuth',
            last_name: 'Person',
            is_active: true,
            is_setup_complete: true,
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
        })
        .returning('*');
    await database('emails').insert({
        user_id: user.user_id,
        email: `${user.user_uuid}@example.test`,
        is_primary: true,
    });
    await database('organization_memberships').insert({
        user_id: user.user_id,
        organization_id: organization.organization_id,
        role: OrganizationMemberRole.MEMBER,
    });
    const config = {
        ...lightdashConfigMock,
        auth: {
            ...lightdashConfigMock.auth,
            oauthServer: {
                accessTokenLifetime: 3600,
                refreshTokenLifetime: 86400,
                mobileRefreshTokenLifetime: 86400,
                refreshTokenRotationGrace: 60,
            },
        },
    };
    const model = new OAuth2Model(database, config, {
        get: async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: strict && featureFlagId === FeatureFlags.AgentIdentity,
        }),
    });
    const userModel = new UserModel({
        database,
        lightdashConfig: config,
        featureFlagModel: new FeatureFlagModel({
            database,
            lightdashConfig: config,
        }),
    });
    const service = new OAuthService({
        oauthModel: model,
        userModel,
        lightdashConfig: config,
    });
    const clientId = randomUUID();
    await database('oauth2_clients').insert({
        client_id: clientId,
        client_name: 'Lifecycle client',
        grants: ['refresh_token'],
        scopes: ['read'],
        redirect_uris: ['https://client.example/callback'],
    });
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const stored = (token: string) =>
        hashed
            ? `sha256:${createHash('sha256').update(token).digest('hex')}`
            : token;
    const common = {
        client_id: clientId,
        user_id: user.user_id,
        organization_uuid: organization.organization_uuid,
        expires_at: new Date(Date.now() + 86400000),
        scope: ['read'],
        family_uuid: randomUUID(),
    };
    await database('oauth2_access_tokens').insert({
        ...common,
        access_token: stored(accessToken),
    });
    await database('oauth2_refresh_tokens').insert({
        ...common,
        refresh_token: stored(refreshToken),
    });
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
                },
            }),
            new OAuth2Server.Response({}),
        );
    const authenticate = (token: string = accessToken) =>
        service.authenticate(
            new OAuth2Server.Request({
                method: 'GET',
                headers: { authorization: `Bearer ${token}` },
                query: {},
            }),
            new OAuth2Server.Response({}),
        );
    return {
        database,
        user,
        organization,
        userModel,
        model,
        clientId,
        accessToken,
        refreshToken,
        refresh,
        authenticate,
    };
};

describe.each([false, true])(
    'OAuth account lifecycle with strict mode %s',
    (strict) => {
        it('waits for an account update before saving refreshed credentials', async () => {
            const f = await fixture(strict, false);
            const transaction = await f.database.transaction();
            await transaction('users')
                .where('user_id', f.user.user_id)
                .update({ is_active: false });
            const outcome = f.refresh().then(
                () => ({ name: 'unexpected_success' }),
                (error: unknown) => error,
            );
            try {
                await vi.waitFor(
                    async () => {
                        const result = await f.database.raw<{
                            rows: { waiting: boolean }[];
                        }>(
                            `SELECT EXISTS (
                            SELECT 1 FROM pg_stat_activity
                            WHERE datname = current_database()
                              AND pid <> pg_backend_pid()
                              AND cardinality(pg_blocking_pids(pid)) > 0
                              AND query LIKE '%for share%'
                        ) AS waiting`,
                        );
                        expect(result.rows[0].waiting).toBe(true);
                    },
                    { timeout: 5000 },
                );
                await transaction.commit();
                await expect(outcome).resolves.toMatchObject({
                    name: 'invalid_grant',
                });
            } finally {
                if (!transaction.isCompleted()) await transaction.rollback();
                await outcome;
            }
        });

        it('refuses issuance when deactivation commits after refresh lookup', async () => {
            const f = await fixture(strict, false);
            const saveToken = f.model.saveToken.bind(f.model);
            vi.spyOn(f.model, 'saveToken').mockImplementationOnce(
                async (...args) => {
                    await f.userModel.updateUser(f.user.user_uuid, undefined, {
                        isActive: false,
                    });
                    return saveToken(...args);
                },
            );
            await expect(f.refresh()).rejects.toMatchObject({
                name: 'invalid_grant',
            });
            expect(f.model.saveToken).toHaveBeenCalledOnce();
            expect(
                await f
                    .database('oauth2_access_tokens')
                    .where('user_id', f.user.user_id),
            ).toHaveLength(0);
            expect(
                await f
                    .database('oauth2_refresh_tokens')
                    .where('user_id', f.user.user_id),
            ).toHaveLength(0);
        });

        it('preserves another person’s credentials when a user is deactivated', async () => {
            const f = await fixture(strict, false);
            const other = await fixture(strict, false);
            await f.userModel.updateUser(f.user.user_uuid, undefined, {
                isActive: false,
            });
            await expect(other.authenticate()).resolves.toMatchObject({
                accessToken: other.accessToken,
            });
            await expect(other.refresh()).resolves.toHaveProperty(
                'refreshToken',
            );
        });

        describe.each([false, true])('stored digest %s', (hashed) => {
            it('allows active members to authenticate and refresh', async () => {
                const f = await fixture(strict, hashed);
                await expect(f.authenticate()).resolves.toMatchObject({
                    accessToken: f.accessToken,
                });
                const rotated = await f.refresh();
                expect(rotated.refreshToken).toBeTruthy();
                await expect(
                    f.authenticate(rotated.accessToken),
                ).resolves.toMatchObject({ accessToken: rotated.accessToken });
            });

            it.each(['inactive', 'removed'] as const)(
                'refuses refresh for an %s member without issuing tokens',
                async (state) => {
                    const f = await fixture(strict, hashed);
                    if (state === 'inactive') {
                        await f
                            .database('users')
                            .where('user_id', f.user.user_id)
                            .update({ is_active: false });
                    } else {
                        await f
                            .database('organization_memberships')
                            .where('user_id', f.user.user_id)
                            .delete();
                        const [otherOrg] = await f
                            .database('organizations')
                            .insert({ organization_name: 'Other membership' })
                            .returning('organization_id');
                        await f.database('organization_memberships').insert({
                            user_id: f.user.user_id,
                            organization_id: otherOrg.organization_id,
                            role: OrganizationMemberRole.MEMBER,
                        });
                    }
                    await expect(f.refresh()).rejects.toMatchObject({
                        name: 'invalid_grant',
                        code: 400,
                    });
                    expect(
                        await f
                            .database('oauth2_access_tokens')
                            .where('user_id', f.user.user_id),
                    ).toHaveLength(1);
                    expect(
                        await f
                            .database('oauth2_refresh_tokens')
                            .where('user_id', f.user.user_id),
                    ).toHaveLength(1);
                },
            );

            it.each(['inactive', 'removed'] as const)(
                'refuses access for an %s member',
                async (state) => {
                    const f = await fixture(strict, hashed);
                    if (state === 'inactive') {
                        await f
                            .database('users')
                            .where('user_id', f.user.user_id)
                            .update({ is_active: false });
                    } else {
                        await f
                            .database('organization_memberships')
                            .where('user_id', f.user.user_id)
                            .delete();
                    }
                    await expect(f.authenticate()).rejects.toMatchObject({
                        name: 'invalid_token',
                        code: 401,
                    });
                },
            );

            it('keeps old credentials revoked after reactivation', async () => {
                const f = await fixture(strict, hashed);
                await f.userModel.updateUser(f.user.user_uuid, undefined, {
                    isActive: false,
                });
                await f.userModel.updateUser(f.user.user_uuid, undefined, {
                    isActive: true,
                });
                await expect(f.refresh()).rejects.toMatchObject({
                    name: 'invalid_grant',
                });
                await expect(f.authenticate()).rejects.toMatchObject({
                    name: 'invalid_token',
                });
            });
        });
    },
);
