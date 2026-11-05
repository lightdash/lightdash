import {
    DeactivatedAccountError,
    OrganizationMemberRole,
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { deferred } from '../../../models/RefreshTokenRotation/fakeKnex.mock';
import { UserModel } from '../../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
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

describe('Agent sign-in deactivation on the migrated schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let users: UserModel;
    let credentials: UserWarehouseCredentialsModel;
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        users = new UserModel({
            database,
            lightdashConfig: lightdashConfigMock,
            featureFlagModel: new FeatureFlagModel({
                database,
                lightdashConfig: lightdashConfigMock,
            }),
        });
        credentials = new UserWarehouseCredentialsModel({
            database,
            encryptionUtil,
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });
    afterEach(() => vi.restoreAllMocks());

    const fixture = async (isActive: boolean) => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Agent sign-in deactivation' })
            .returning(['organization_id', 'organization_uuid']);
        const userUuid = randomUUID();
        const [user] = await database('users')
            .insert({
                user_uuid: userUuid,
                first_name: 'Agent',
                last_name: 'User',
                is_marketing_opted_in: false,
                is_tracking_anonymized: true,
                is_setup_complete: true,
                is_active: isActive,
            })
            .returning('user_id');
        await database('organization_memberships').insert({
            user_id: user.user_id,
            organization_id: organization.organization_id,
            role: OrganizationMemberRole.MEMBER,
        });
        const save = () =>
            credentials.upsertAiSnowflakeCredential(
                userUuid,
                'refresh-token',
                null,
                {
                    organizationUuid: organization.organization_uuid,
                    clientVersion: randomUUID(),
                },
                { strictPersonalOverlay: false },
            );
        const aiRows = () =>
            database('user_warehouse_credentials').where({
                user_uuid: userUuid,
                purpose: UserWarehouseCredentialPurpose.AI,
            });
        const deactivate = () =>
            users.updateUser(userUuid, undefined, { isActive: false });
        const readUser = () =>
            database('users').where('user_uuid', userUuid).first();
        return { userUuid, save, aiRows, deactivate, readUser };
    };

    it('deletes the AI credential and preserves the default credential on deactivation', async () => {
        const f = await fixture(true);
        await f.save();
        const [personal] = await database('user_warehouse_credentials')
            .insert({
                user_uuid: f.userUuid,
                name: 'Default',
                warehouse_type: WarehouseTypes.SNOWFLAKE,
                encrypted_credentials: encryptionUtil.encrypt(
                    JSON.stringify({
                        type: WarehouseTypes.SNOWFLAKE,
                        user: f.userUuid,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: 'personal-refresh-token',
                    }),
                ),
                project_uuid: null,
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
                expires_at: null,
            })
            .returning('*');
        expect(await f.aiRows()).toHaveLength(1);

        await f.deactivate();

        expect(await f.aiRows()).toHaveLength(0);
        expect(
            await database('user_warehouse_credentials').where(
                'user_uuid',
                f.userUuid,
            ),
        ).toEqual([personal]);
        expect(await f.readUser()).toMatchObject({ is_active: false });
    });

    it('does not restore the agent sign-in when the person is reactivated', async () => {
        const f = await fixture(true);
        await f.save();
        await f.deactivate();

        await users.updateUser(f.userUuid, undefined, { isActive: true });

        expect(await f.readUser()).toMatchObject({ is_active: true });
        expect(await f.aiRows()).toHaveLength(0);
    });

    it('cascades the agent sign-in deletion when the user is deleted', async () => {
        const f = await fixture(true);
        await f.save();
        expect(await f.aiRows()).toHaveLength(1);

        await users.delete(f.userUuid);

        expect(await f.readUser()).toBeUndefined();
        expect(await f.aiRows()).toHaveLength(0);
    });

    it('refuses to save an agent sign-in for an inactive person', async () => {
        const f = await fixture(false);

        await expect(f.save()).rejects.toThrow(DeactivatedAccountError);

        expect(await f.aiRows()).toHaveLength(0);
    });

    it('refuses the save when deactivation commits first', async () => {
        const f = await fixture(true);
        await f.save();
        await f.deactivate();

        await expect(f.save()).rejects.toThrow(DeactivatedAccountError);

        expect(await f.readUser()).toMatchObject({ is_active: false });
        expect(await f.aiRows()).toHaveLength(0);
    });

    it('blocks deactivation until the save commits, then deletes the new agent sign-in', async () => {
        const f = await fixture(true);
        const transaction = database.transaction.bind(database);
        const saveHeld = deferred<void>();
        const allowCommit = deferred<void>();
        const updateStarted = deferred<void>();
        const connectionPids: number[] = [];
        let first = true;
        vi.spyOn(database, 'transaction').mockImplementation(((
            callback: (trx: Knex.Transaction) => Promise<unknown>,
        ) =>
            transaction(async (trx) => {
                const pause = first;
                first = false;
                const result = await trx.raw<{ rows: { pid: number }[] }>(
                    'SELECT pg_backend_pid() AS pid',
                );
                connectionPids.push(result.rows[0].pid);
                if (!pause) {
                    trx.on('query', (query: { sql: string }) => {
                        if (query.sql.startsWith('update "users"'))
                            updateStarted.resolve();
                    });
                }
                const value = await callback(trx);
                if (pause) {
                    saveHeld.resolve();
                    await allowCommit.promise;
                }
                return value;
            })) as typeof database.transaction);

        const save = f.save();
        let deactivation: ReturnType<typeof f.deactivate> | undefined;
        try {
            await Promise.race([
                saveHeld.promise,
                save.then(() => {
                    throw new Error(
                        'Save completed before the transaction was held',
                    );
                }),
            ]);
            deactivation = f.deactivate();
            await Promise.race([
                updateStarted.promise,
                deactivation.then(() => {
                    throw new Error(
                        'Deactivation completed without updating the user',
                    );
                }),
            ]);
            expect(connectionPids).toHaveLength(2);
            expect(connectionPids[0]).not.toBe(connectionPids[1]);
            expect(
                await Promise.race([
                    deactivation.then(() => 'completed'),
                    new Promise<string>((resolve) => {
                        setTimeout(() => resolve('pending'), 100);
                    }),
                ]),
            ).toBe('pending');
        } finally {
            allowCommit.resolve();
            await Promise.all([save, deactivation]);
        }

        expect(await f.readUser()).toMatchObject({ is_active: false });
        expect(await f.aiRows()).toHaveLength(0);
    });
});
