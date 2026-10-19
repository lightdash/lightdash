import {
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { checkSnowflakeAgentSessionWithToken } from '@lightdash/warehouses';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import * as refresh from '../../../auth/snowflakeOAuthRefresh';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { deferred } from '../../../models/RefreshTokenRotation/fakeKnex.mock';
import { RefreshTokenRotation } from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { AgentSignInResolverHarness } from '../../../services/WarehouseClientFactory/resolvers/SnowflakeAgentSignInCredentialResolver.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: config };
});

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
}));

describe('Snowflake agent sign-in refresh on the migrated schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let model: UserWarehouseCredentialsModel;
    const clientVersion = randomUUID();
    let organizationUuid: string;
    const connection = {
        type: WarehouseTypes.SNOWFLAKE as const,
        account: 'stub-account',
        database: 'db',
        warehouse: 'wh',
        schema: 'public',
        user: 'person',
        authenticationType: SnowflakeAuthenticationType.SSO,
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Agent sign-in refresh' })
            .returning('organization_uuid');
        organizationUuid = organization.organization_uuid;
        model = new UserWarehouseCredentialsModel({
            database,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        vi.mocked(checkSnowflakeAgentSessionWithToken).mockResolvedValue({
            agentActivated: true,
            currentRole: 'role',
            activeRestrictedSessionScopes: 'scope',
        });
    });
    afterEach(() => vi.restoreAllMocks());

    const setup = async (lockEnabled: boolean, silentRefresh: boolean) => {
        const userUuid = randomUUID();
        await database('users').insert({
            user_uuid: userUuid,
            first_name: 'Agent',
            last_name: 'User',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        });
        const uuid = await model.upsertAiSnowflakeCredential(
            userUuid,
            'T1',
            null,
            { organizationUuid, clientVersion },
            { strictPersonalOverlay: false },
        );
        const client = {
            organizationUuid,
            clientVersion,
            source: 'organization' as const,
            clientId: 'stub-client',
            clientSecret: 'stub-secret',
            account: 'stub-account',
            accessUrl: 'https://stub.example.test',
            authorizationEndpoint: 'https://stub.example.test/authorize',
            tokenEndpoint: 'https://stub.example.test/token',
        };
        const deps = {
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: lockEnabled }),
            },
            refreshTokenRotation: new RefreshTokenRotation({ database }),
            snowflakeAgentClientResolver: {
                resolve: vi.fn().mockResolvedValue(client),
            },
            userWarehouseCredentialsModel: model,
            lightdashConfig: lightdashConfigMock,
        };
        const harness = new AgentSignInResolverHarness(deps);
        const args = {
            connection,
            person: {
                userUuid,
                organizationUuid,
                email: 'stub@example.test',
            },
            silentRefresh,
        };
        return { uuid, userUuid, deps, harness, args };
    };

    test.each([true, false])(
        'shares one exchange and commits the AI row with silent refresh %s',
        async (silentRefresh) => {
            const f = await setup(true, silentRefresh);
            const pending = deferred<refresh.SnowflakeRefreshResult>();
            const exchange = vi
                .spyOn(refresh, 'exchangeSnowflakeRefreshToken')
                .mockReturnValue(pending.promise);
            const first = f.harness.mint(f.args);
            await vi.waitFor(() => expect(exchange).toHaveBeenCalledOnce());
            const run = vi.spyOn(f.deps.refreshTokenRotation, 'run');
            const second = new AgentSignInResolverHarness(f.deps).mint(f.args);
            await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
            const expiresAt = new Date('2099-01-01');
            pending.resolve({
                accessToken: 'A2',
                refreshToken: 'T2',
                accessTokenExpiresAt: expiresAt,
                refreshTokenExpiresAt: expiresAt,
            });
            const results = await Promise.all([first, second]);
            expect(exchange).toHaveBeenCalledOnce();
            expect(results.map((result) => result.credentials.token)).toEqual([
                'A2',
                'A2',
            ]);
            expect(
                await model.findAiCredentialWithSecrets(
                    {
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    },
                    { strictPersonalOverlay: false },
                ),
            ).toMatchObject({
                uuid: f.uuid,
                credentials: { refreshToken: 'T2' },
                expiresAt: silentRefresh ? expiresAt : null,
            });
            expect(run.mock.calls[0][0].key).toMatchObject({
                purpose: UserWarehouseCredentialPurpose.AI,
                uuid: f.uuid,
            });
        },
    );

    test.each([true, false])(
        'writes an unchanged-token expiry only with silent refresh enabled (lock=%s)',
        async (lockEnabled) => {
            const f = await setup(lockEnabled, true);
            const expiresAt = new Date('2099-02-01');
            vi.spyOn(
                refresh,
                'exchangeSnowflakeRefreshToken',
            ).mockResolvedValue({
                accessToken: 'A2',
                refreshToken: 'T1',
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: expiresAt,
            });
            await f.harness.mint(f.args);
            expect(
                await model.findAiCredentialWithSecrets(
                    {
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    },
                    { strictPersonalOverlay: false },
                ),
            ).toMatchObject({
                credentials: { refreshToken: 'T1' },
                expiresAt,
            });
            expect(
                await model.rotateRefreshToken(f.uuid, 'obsolete', 'obsolete', {
                    kind: 'reported',
                    expiresAt: new Date('2000-01-01'),
                }),
            ).toBe(false);
            expect(
                await model.findAiCredentialWithSecrets(
                    {
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    },
                    { strictPersonalOverlay: false },
                ),
            ).toMatchObject({ expiresAt });
        },
    );
    test('attributes unchanged-token expiry to the token read after acquiring the lock', async () => {
        const f = await setup(true, true);
        const holder = await database.transaction();
        await holder.raw(
            'select pg_advisory_xact_lock(hashtextextended(?, 0))',
            [`oauth-refresh:user:${f.uuid}:ai`],
        );
        const expiresAt = new Date('2099-03-01');
        const exchange = vi
            .spyOn(refresh, 'exchangeSnowflakeRefreshToken')
            .mockResolvedValue({
                accessToken: 'A2',
                refreshToken: 'T2',
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: expiresAt,
            });
        const read = vi.spyOn(model, 'findAiCredentialWithSecrets');
        const persist = vi.spyOn(model, 'rotateRefreshToken');
        const pending = f.harness.mint(f.args);
        try {
            await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
            await model.rotateRefreshToken(f.uuid, 'T1', 'T2');
        } finally {
            await holder.commit();
        }
        await pending;
        expect(exchange).toHaveBeenCalledWith(
            expect.objectContaining({ refreshToken: 'T2' }),
        );
        expect(persist).toHaveBeenLastCalledWith(
            f.uuid,
            'T2',
            'T2',
            { kind: 'reported', expiresAt },
            expect.any(Function),
        );
        expect(
            await model.findAiCredentialWithSecrets(
                {
                    userUuid: f.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
                { strictPersonalOverlay: false },
            ),
        ).toMatchObject({ credentials: { refreshToken: 'T2' }, expiresAt });
    });

    test.each([true, false])(
        'resolves a fresh saved sign-in with locking disabled and silent refresh %s',
        async (silentRefresh) => {
            const f = await setup(false, silentRefresh);
            const run = vi.spyOn(f.deps.refreshTokenRotation, 'run');
            vi.spyOn(
                refresh,
                'exchangeSnowflakeRefreshToken',
            ).mockResolvedValue({
                accessToken: 'fresh-access',
                refreshToken: 'T2',
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
            });
            await expect(f.harness.mint(f.args)).resolves.toMatchObject({
                identityUuid: f.uuid,
                credentials: {
                    token: 'fresh-access',
                    requireAgentSession: true,
                },
            });
            expect(run).not.toHaveBeenCalled();
            expect(
                await model.findAiCredentialWithSecrets(
                    {
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    },
                    { strictPersonalOverlay: false },
                ),
            ).toMatchObject({ credentials: { refreshToken: 'T2' } });
        },
    );
});
