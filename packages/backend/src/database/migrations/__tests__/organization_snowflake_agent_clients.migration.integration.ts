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

test.each([false, true])(
    'serializes concurrent first saves (replacement=%s)',
    async (replacement) => {
        const { input } = await fixture();
        const first = await migrated.database.transaction();
        const second = await migrated.database.transaction();
        try {
            const firstModel = new OrganizationSnowflakeAgentClientModel({
                database: first,
                encryptionUtil,
            });
            const secondModel = new OrganizationSnowflakeAgentClientModel({
                database: second,
                encryptionUtil,
            });
            const [{ pid: firstPid }] = await first.select(
                first.raw('pg_backend_pid() as pid'),
            );
            const [{ pid: secondPid }] = await second.select(
                second.raw('pg_backend_pid() as pid'),
            );
            const created = await firstModel.upsert(input);
            const pending = secondModel.upsert(
                replacement ? { ...input, clientId: 'replacement' } : input,
            );
            await vi.waitFor(async () => {
                const { rows } = await migrated.database.raw(
                    'select ? = any(pg_blocking_pids(?)) as blocked',
                    [firstPid, secondPid],
                );
                expect(rows[0].blocked).toBe(true);
            });
            await first.commit();
            const saved = await pending;
            await second.commit();
            expect(created.action).toBe('created');
            expect(saved.action).toBe(replacement ? 'replaced' : 'unchanged');
            expect(saved.clientVersion === created.clientVersion).toBe(
                !replacement,
            );
            const rows = await migrated
                .database(table)
                .where('organization_uuid', input.organizationUuid);
            expect(rows).toHaveLength(1);
            expect(rows[0].client_version).toBe(saved.clientVersion);
            expect(rows[0].encrypted_client_secret.toString()).not.toContain(
                input.clientSecret,
            );
            expect(rows[0].created_by_user_uuid).toBe(input.userUuid);
            expect(
                rows[0].organization_snowflake_agent_client_uuid,
            ).toBeTruthy();
        } finally {
            if (!first.isCompleted()) await first.rollback();
            if (!second.isCompleted()) await second.rollback();
        }
    },
);

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
