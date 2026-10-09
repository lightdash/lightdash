import { OrganizationSnowflakeAgentClientModel } from '../../../models/OrganizationSnowflakeAgentClientModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { OrganizationSnowflakeAgentClientsTableName as table } from '../../entities/organizationSnowflakeAgentClients';
import {
    down,
    up,
} from '../20261009155609_create_organization_snowflake_agent_clients';

let migrated: MigratedDatabase;
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: 'snowflake-client-test-key',
        lightdashSecrets: {
            active: 'snowflake-client-test-key',
            all: ['snowflake-client-test-key'],
            fallbacks: [],
        },
    },
});
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});
const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Snowflake client test' })
        .returning('organization_uuid');
    const [user] = await database('users')
        .insert({ first_name: 'Client', last_name: 'Admin' } as never)
        .returning('user_uuid');
    return {
        model: new OrganizationSnowflakeAgentClientModel({
            database,
            encryptionUtil,
        }),
        input: {
            organizationUuid: org.organization_uuid,
            userUuid: user.user_uuid,
            accountUrl: 'https://test.snowflakecomputing.com',
            accountIdentifier: 'test',
            clientId: 'test-client',
            clientSecret: 'test-client-secret',
        },
    };
};

test('stores ciphertext and serializes identical concurrent saves without replacing the version', async () => {
    const { model, input } = await fixture();
    const results = await Promise.all([
        model.upsert(input),
        model.upsert(input),
    ]);
    expect(results[0].clientVersion).toBe(results[1].clientVersion);
    const saved = await migrated
        .database(table)
        .where('organization_uuid', input.organizationUuid);
    expect(saved).toHaveLength(1);
    expect(saved[0].encrypted_client_secret.toString()).not.toContain(
        input.clientSecret,
    );
    expect(saved[0].created_by_user_uuid).toBe(input.userUuid);
    expect(saved[0].organization_snowflake_agent_client_uuid).toBeTruthy();
    expect(await model.getWithSecret(input.organizationUuid)).toMatchObject({
        clientSecret: input.clientSecret,
    });
});

test.each(['clientId', 'clientSecret', 'accountUrl'] as const)(
    'changes the version only when %s changes',
    async (field) => {
        const { model, input } = await fixture();
        const original = await model.upsert(input);
        const changed = { ...input, [field]: 'replacement' };
        const replaced = await model.upsert(changed);
        expect(replaced.clientVersion).not.toBe(original.clientVersion);
        expect((await model.upsert(changed)).clientVersion).toBe(
            replaced.clientVersion,
        );
    },
);

test('direct ciphertext rotation preserves the version and remains decryptable', async () => {
    const { model, input } = await fixture();
    const saved = await model.upsert(input);
    const rotated = new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: 'rotated-test-key',
            lightdashSecrets: {
                active: 'rotated-test-key',
                all: ['rotated-test-key'],
                fallbacks: [],
            },
        },
    });
    await migrated
        .database(table)
        .where('organization_uuid', input.organizationUuid)
        .update({
            encrypted_client_secret: rotated.encrypt(input.clientSecret),
        });
    const rotatedModel = new OrganizationSnowflakeAgentClientModel({
        database: migrated.database,
        encryptionUtil: rotated,
    });
    expect(
        await rotatedModel.getWithSecret(input.organizationUuid),
    ).toMatchObject({
        clientVersion: saved.clientVersion,
        clientSecret: input.clientSecret,
    });
});

test('keeps the client after user deletion and removes it after organization deletion', async () => {
    const { model, input } = await fixture();
    await model.upsert(input);
    await migrated
        .database('users')
        .where('user_uuid', input.userUuid)
        .delete();
    expect(
        await migrated
            .database(table)
            .where('organization_uuid', input.organizationUuid)
            .first(),
    ).toMatchObject({ created_by_user_uuid: null, updated_by_user_uuid: null });
    await migrated
        .database('organizations')
        .where('organization_uuid', input.organizationUuid)
        .delete();
    expect(await model.getMetadata(input.organizationUuid)).toBeNull();
});

test('down removes the table and up restores it', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(await trx.schema.hasTable(table)).toBe(false);
        await up(trx);
        expect(await trx.schema.hasTable(table)).toBe(true);
    });
});
