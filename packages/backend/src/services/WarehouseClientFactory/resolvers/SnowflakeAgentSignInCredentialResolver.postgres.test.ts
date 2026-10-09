import {
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { checkSnowflakeAgentSessionWithToken } from '@lightdash/warehouses';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import * as refresh from '../../../auth/snowflakeOAuthRefresh';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { deferred } from '../../../models/RefreshTokenRotation/fakeKnex.mock';
import { RefreshTokenRotation } from '../../../models/RefreshTokenRotation/RefreshTokenRotation';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { AgentSignInResolverHarness } from './SnowflakeAgentSignInCredentialResolver.mock';

vi.mock('@lightdash/warehouses', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
    checkSnowflakeAgentSessionWithToken: vi.fn(),
}));

describe.skipIf(!process.env.PGPORT)(
    'Snowflake agent resolver (PostgreSQL)',
    () => {
        const schema = `agent_refresh_${randomUUID().replaceAll('-', '')}`;
        let admin: Knex;
        let database: Knex;
        let model: UserWarehouseCredentialsModel;
        const clientVersion = randomUUID();
        const organizationUuid = randomUUID();
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
            const config = {
                client: 'pg',
                connection: {
                    host: process.env.PGHOST,
                    port: Number(process.env.PGPORT),
                    user: process.env.PGUSER,
                    password: process.env.PGPASSWORD,
                    database: process.env.PGDATABASE,
                },
            };
            admin = knex(config);
            await admin.schema.createSchema(schema);
            database = knex({
                ...config,
                searchPath: [schema],
                pool: { min: 0, max: 4 },
            });
            await database.schema.createTable(
                'user_warehouse_credentials',
                (table) => {
                    table
                        .uuid('user_warehouse_credentials_uuid')
                        .primary()
                        .defaultTo(database.raw('gen_random_uuid()'));
                    table.uuid('user_uuid').notNullable();
                    table.text('name').notNullable();
                    table.text('warehouse_type').notNullable();
                    table.binary('encrypted_credentials').notNullable();
                    table.uuid('project_uuid').nullable();
                    table.text('purpose').notNullable();
                    table.timestamp('expires_at', { useTz: true }).nullable();
                    table
                        .timestamp('updated_at', { useTz: true })
                        .defaultTo(database.fn.now());
                },
            );
            await database.raw(
                "CREATE UNIQUE INDEX agent_credential_user ON user_warehouse_credentials (user_uuid, warehouse_type) WHERE purpose = 'ai'",
            );
            model = new UserWarehouseCredentialsModel({
                database,
                encryptionUtil: new EncryptionUtil({
                    lightdashConfig: lightdashConfigMock,
                }),
            });
        });

        afterAll(async () => {
            await database?.destroy();
            await admin?.schema.dropSchemaIfExists(schema, true);
            await admin?.destroy();
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
            const uuid = await model.upsertAiSnowflakeCredential(
                userUuid,
                'T1',
                null,
                { organizationUuid, clientVersion },
            );
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
                const second = new AgentSignInResolverHarness(f.deps).mint(
                    f.args,
                );
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
                expect(
                    results.map((result) => result.credentials.token),
                ).toEqual(['A2', 'A2']);
                expect(
                    await model.findAiCredentialWithSecrets({
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    }),
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
                    await model.findAiCredentialWithSecrets({
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    }),
                ).toMatchObject({
                    credentials: { refreshToken: 'T1' },
                    expiresAt,
                });
                expect(
                    await model.rotateRefreshToken(
                        f.uuid,
                        'obsolete',
                        'obsolete',
                        { kind: 'reported', expiresAt: new Date('2000-01-01') },
                    ),
                ).toBe(false);
                expect(
                    await model.findAiCredentialWithSecrets({
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    }),
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
                await model.findAiCredentialWithSecrets({
                    userUuid: f.userUuid,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                }),
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
                    await model.findAiCredentialWithSecrets({
                        userUuid: f.userUuid,
                        warehouseType: WarehouseTypes.SNOWFLAKE,
                    }),
                ).toMatchObject({ credentials: { refreshToken: 'T2' } });
            },
        );
    },
);
