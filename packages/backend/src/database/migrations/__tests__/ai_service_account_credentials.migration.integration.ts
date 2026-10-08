import { BigqueryAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { AiServiceAccountCredentialsModel } from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { down, up } from '../20261008120000_add_ai_service_account_credentials';

let migrated: MigratedDatabase;
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: 'slot-test-secret',
        lightdashSecrets: {
            active: 'slot-test-secret',
            all: ['slot-test-secret'],
            fallbacks: [],
        },
    },
});
const credentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        private_key: 'test-slot-key',
        client_email: 'agent@example.com',
    },
} as const;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Service account slots' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'Slot', last_name: 'Creator' } as never)
        .returning('user_uuid');
    const [project] = await database('projects')
        .insert({
            name: 'Slot project',
            organization_id: org.organization_id,
        } as never)
        .returning('project_uuid');
    const [other] = await database('projects')
        .insert({
            name: 'Other project',
            organization_id: org.organization_id,
        } as never)
        .returning('project_uuid');
    const [connection] = await database('warehouse_connections')
        .insert({
            project_uuid: project.project_uuid,
            name: 'Extra',
            is_original: false,
            warehouse_type: 'bigquery',
            encrypted_credentials: encryptionUtil.encrypt('{}'),
        })
        .returning('warehouse_connection_uuid');
    const model = new AiServiceAccountCredentialsModel({
        database,
        encryptionUtil,
    });
    return {
        projectUuid: project.project_uuid,
        otherProjectUuid: other.project_uuid,
        userUuid: user.user_uuid,
        connectionUuid: connection.warehouse_connection_uuid,
        model,
    };
};

test('stores encrypted auth only and preserves or rotates the generation on effective changes', async () => {
    const f = await fixture();
    const first = await f.model.upsert(
        f.projectUuid,
        null,
        credentials,
        f.userUuid,
    );
    const noChange = await f.model.upsert(
        f.projectUuid,
        null,
        credentials,
        f.userUuid,
    );
    expect(noChange.identityUuid).toBe(first.identityUuid);
    expect(noChange.uuid).toBe(first.uuid);
    expect(await f.model.getSecrets(f.projectUuid, null)).toEqual(credentials);
    const row = await migrated
        .database('ai_service_account_credentials')
        .where('project_uuid', f.projectUuid)
        .first();
    expect(row?.encrypted_credentials.toString()).not.toContain(
        'test-slot-key',
    );
    expect(encryptionUtil.decrypt(row!.encrypted_credentials)).toBe(
        JSON.stringify(credentials),
    );
    expect(first).not.toHaveProperty('encrypted_credentials');
    expect(first).not.toHaveProperty('keyfileContents');
    const replacement = await f.model.upsert(
        f.projectUuid,
        null,
        {
            ...credentials,
            keyfileContents: {
                ...credentials.keyfileContents,
                private_key: 'changed-key',
            },
        },
        f.userUuid,
    );
    expect(replacement.uuid).toBe(first.uuid);
    expect(replacement.identityUuid).not.toBe(first.identityUuid);
    const changedPrincipal = await f.model.upsert(
        f.projectUuid,
        null,
        {
            ...credentials,
            keyfileContents: {
                ...credentials.keyfileContents,
                client_email: 'replacement@example.com',
            },
        },
        f.userUuid,
    );
    expect(changedPrincipal.identityUuid).not.toBe(replacement.identityUuid);
    await f.model.delete(f.projectUuid, null);
    const recreated = await f.model.upsert(
        f.projectUuid,
        null,
        credentials,
        f.userUuid,
    );
    expect(recreated.uuid).not.toBe(first.uuid);
    expect(recreated.identityUuid).not.toBe(first.identityUuid);
});

test('replaces a slot whose saved credentials cannot be decrypted', async () => {
    const f = await fixture();
    const first = await f.model.upsert(
        f.projectUuid,
        null,
        credentials,
        f.userUuid,
    );
    await migrated
        .database('ai_service_account_credentials')
        .where('project_uuid', f.projectUuid)
        .update({ encrypted_credentials: Buffer.from('not-ciphertext') });
    await expect(f.model.getSecrets(f.projectUuid, null)).rejects.toThrow(
        'could not be read',
    );
    expect(await f.model.getReplaceableSecrets(f.projectUuid, null)).toBeNull();
    const replaced = await f.model.upsert(
        f.projectUuid,
        null,
        credentials,
        f.userUuid,
    );
    expect(replaced.uuid).toBe(first.uuid);
    expect(replaced.identityUuid).not.toBe(first.identityUuid);
    expect(await f.model.getSecrets(f.projectUuid, null)).toEqual(credentials);
});

test('concurrent upserts produce one original slot and one slot per extra connection', async () => {
    const f = await fixture();
    const originals = await Promise.all([
        f.model.upsert(f.projectUuid, null, credentials, f.userUuid),
        f.model.upsert(f.projectUuid, null, credentials, f.userUuid),
    ]);
    expect(originals[0].identityUuid).toBe(originals[1].identityUuid);
    const extras = await Promise.all([
        f.model.upsert(
            f.projectUuid,
            f.connectionUuid,
            credentials,
            f.userUuid,
        ),
        f.model.upsert(
            f.projectUuid,
            f.connectionUuid,
            credentials,
            f.userUuid,
        ),
    ]);
    expect(extras[0].identityUuid).toBe(extras[1].identityUuid);
    expect(extras[0].uuid).not.toBe(originals[0].uuid);
    const rows = await migrated
        .database('ai_service_account_credentials')
        .where('project_uuid', f.projectUuid);
    expect(rows).toHaveLength(2);
    const insert = {
        project_uuid: f.projectUuid,
        warehouse_type: WarehouseTypes.BIGQUERY,
        authentication_method: 'private_key' as const,
        encrypted_credentials: encryptionUtil.encrypt(
            JSON.stringify(credentials),
        ),
    };
    await expect(
        migrated
            .database('ai_service_account_credentials')
            .insert({ ...insert, warehouse_connection_uuid: null }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
        migrated
            .database('ai_service_account_credentials')
            .insert({ ...insert, warehouse_connection_uuid: f.connectionUuid }),
    ).rejects.toMatchObject({ code: '23505' });
});

test('rejects an extra connection from another project', async () => {
    const f = await fixture();
    await expect(
        f.model.upsert(
            f.otherProjectUuid,
            f.connectionUuid,
            credentials,
            f.userUuid,
        ),
    ).rejects.toMatchObject({ code: '23503' });
});

test('user deletion clears authors, connection deletion removes only its slot, and project deletion cascades', async () => {
    const f = await fixture();
    await f.model.upsert(f.projectUuid, null, credentials, f.userUuid);
    await f.model.upsert(
        f.projectUuid,
        f.connectionUuid,
        credentials,
        f.userUuid,
    );
    await migrated.database('users').where('user_uuid', f.userUuid).delete();
    expect(await f.model.getSlot(f.projectUuid, null)).toMatchObject({
        createdByUserUuid: null,
        updatedByUserUuid: null,
        credentialSubjectUserUuid: null,
    });
    await migrated
        .database('warehouse_connections')
        .where('warehouse_connection_uuid', f.connectionUuid)
        .delete();
    expect(await f.model.getSlot(f.projectUuid, f.connectionUuid)).toBeNull();
    expect(await f.model.getSlot(f.projectUuid, null)).not.toBeNull();
    await migrated
        .database('projects')
        .where('project_uuid', f.projectUuid)
        .delete();
    expect(await f.model.getSlot(f.projectUuid, null)).toBeNull();
});

test('ciphertext re-encryption keeps the slot generation and auth intact', async () => {
    const f = await fixture();
    const slot = await f.model.upsert(
        f.projectUuid,
        null,
        credentials,
        f.userUuid,
    );
    const rotated = new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: 'new-slot-test-secret',
            lightdashSecrets: {
                active: 'new-slot-test-secret',
                all: ['new-slot-test-secret'],
                fallbacks: [],
            },
        },
    });
    const row = await migrated
        .database('ai_service_account_credentials')
        .where('ai_service_account_credential_uuid', slot.uuid)
        .first();
    await migrated
        .database('ai_service_account_credentials')
        .where('ai_service_account_credential_uuid', slot.uuid)
        .update({
            encrypted_credentials: rotated.encrypt(
                encryptionUtil.decrypt(row!.encrypted_credentials),
            ),
        });
    const model = new AiServiceAccountCredentialsModel({
        database: migrated.database,
        encryptionUtil: rotated,
    });
    expect((await model.getSlot(f.projectUuid, null))?.identityUuid).toBe(
        slot.identityUuid,
    );
    expect(await model.getSecrets(f.projectUuid, null)).toEqual(credentials);
});

test('reverses and reapplies the migration', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(
            await trx.schema.hasTable('ai_service_account_credentials'),
        ).toBe(false);
        await up(trx);
        expect(
            await trx.schema.hasTable('ai_service_account_credentials'),
        ).toBe(true);
    });
});
