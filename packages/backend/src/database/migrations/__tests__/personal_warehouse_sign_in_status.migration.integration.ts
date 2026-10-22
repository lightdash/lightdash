import {
    BigqueryAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseSignInRejection,
    WarehouseTypes,
    type CreateBigqueryCredentials,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    down,
    up,
} from '../20261022190000_add_personal_warehouse_sign_in_status';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [user] = await database('users')
        .insert({
            first_name: 'user_a',
            last_name: 'user_a',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    const model = new UserWarehouseCredentialsModel({
        database,
        encryptionUtil: new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        }),
    });
    const credentials: CreateBigqueryCredentials = {
        type: WarehouseTypes.BIGQUERY,
        project: 'project_a',
        dataset: 'dataset_a',
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
        authenticationType: BigqueryAuthenticationType.SSO,
        keyfileContents: {
            type: 'authorized_user',
            client_id: 'client_a',
            refresh_token: 'personal_token_a',
        },
    };
    const data = { name: 'credential_a', credentials };
    const policy = { strictPersonalOverlay: false };
    const uuid = await model.create(user.user_uuid, data, policy);
    const snapshot = await model.getSignInSnapshot(uuid, credentials);
    if (!snapshot) throw new Error('The fixture needs a personal snapshot');
    return {
        database,
        model,
        data,
        credentials,
        policy,
        uuid,
        userUuid: user.user_uuid,
        snapshot,
    };
};

test('marks the first rejection, preserves its time, and keeps status optional for older clients', async () => {
    const f = await fixture();
    await f.model.markNeedsSignIn(
        f.snapshot,
        WarehouseSignInRejection.INVALID_GRANT,
    );
    const marked = await f.model.getByUuid(f.uuid, true);
    expect(marked.needsSignIn).toEqual({
        since: expect.any(Date),
        reason: WarehouseSignInRejection.INVALID_GRANT,
    });
    await f.model.markNeedsSignIn(
        f.snapshot,
        WarehouseSignInRejection.INVALID_RAPT,
    );
    expect((await f.model.getByUuid(f.uuid, true)).needsSignIn).toEqual(
        marked.needsSignIn,
    );
    expect(await f.model.getByUuid(f.uuid)).not.toHaveProperty('needsSignIn');
    expect(
        (await f.model.getAllByUserUuid(f.userUuid, false))[0],
    ).not.toHaveProperty('needsSignIn');
    expect(
        (await f.model.getAllByUserUuid(f.userUuid, true))[0].needsSignIn,
    ).toEqual(marked.needsSignIn);
});

test.each(['personal_token_a', 'personal_token_b'])(
    'rejects stale marks after reconnect with %s',
    async (refreshToken) => {
        const f = await fixture();
        await f.model.markNeedsSignIn(
            f.snapshot,
            WarehouseSignInRejection.INVALID_GRANT,
        );
        await f.model.update(
            f.userUuid,
            f.uuid,
            {
                ...f.data,
                credentials: {
                    ...f.credentials,
                    keyfileContents: {
                        type: 'authorized_user',
                        client_id: 'client_a',
                        refresh_token: refreshToken,
                    },
                },
            },
            f.policy,
            true,
        );
        expect((await f.model.getByUuid(f.uuid, true)).needsSignIn).toBeNull();
        await f.model.markNeedsSignIn(
            f.snapshot,
            WarehouseSignInRejection.INVALID_GRANT,
        );
        expect((await f.model.getByUuid(f.uuid, true)).needsSignIn).toBeNull();
        const current = await f.model.getSignInSnapshot(f.uuid, {
            ...f.credentials,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client_a',
                refresh_token: refreshToken,
            },
        });
        expect(current).not.toBeNull();
        expect(
            current!.encryptedCredentials.equals(
                f.snapshot.encryptedCredentials,
            ),
        ).toBe(false);
        await f.model.markNeedsSignIn(
            current!,
            WarehouseSignInRejection.INVALID_GRANT,
        );
        expect(
            (await f.model.getByUuid(f.uuid, true)).needsSignIn,
        ).not.toBeNull();
    },
);

test('a reconnect clears the mark in the same database update as its credential', async () => {
    const f = await fixture();
    await f.model.markNeedsSignIn(
        f.snapshot,
        WarehouseSignInRejection.INVALID_GRANT,
    );
    const updates: string[] = [];
    const observe = (query: { sql: string }) => {
        if (query.sql.startsWith('update')) updates.push(query.sql);
    };
    f.database.on('query', observe);
    try {
        await f.model.update(f.userUuid, f.uuid, f.data, f.policy, true);
    } finally {
        f.database.removeListener('query', observe);
    }
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain('"encrypted_credentials" =');
    expect(updates[0]).toContain('"needs_sign_in_at" =');
    expect(updates[0]).toContain('"needs_sign_in_reason" =');
});

test('does not clear a stored mark when the effect is disabled', async () => {
    const f = await fixture();
    await f.model.markNeedsSignIn(
        f.snapshot,
        WarehouseSignInRejection.INVALID_GRANT,
    );
    const original = (await f.model.getByUuid(f.uuid, true)).needsSignIn;
    await f.model.update(f.userUuid, f.uuid, f.data, f.policy, false);
    expect((await f.model.getByUuid(f.uuid, true)).needsSignIn).toEqual(
        original,
    );
    expect(await f.model.getByUuid(f.uuid, false)).not.toHaveProperty(
        'needsSignIn',
    );
});

test('refuses a snapshot for another token or an AI credential', async () => {
    const f = await fixture();
    expect(
        await f.model.getSignInSnapshot(f.uuid, {
            ...f.credentials,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'client_a',
                refresh_token: 'project_token_a',
            },
        }),
    ).toBeNull();
    await f
        .database('user_warehouse_credentials')
        .where('user_warehouse_credentials_uuid', f.uuid)
        .update({ purpose: UserWarehouseCredentialPurpose.AI } as never);
    expect(await f.model.getSignInSnapshot(f.uuid, f.credentials)).toBeNull();
    await f.model.markNeedsSignIn(
        f.snapshot,
        WarehouseSignInRejection.INVALID_GRANT,
    );
    const row = await f
        .database('user_warehouse_credentials')
        .where('user_warehouse_credentials_uuid', f.uuid)
        .first();
    expect(row!.needs_sign_in_at).toBeNull();
});

test('reverses the migration after application rollback and preserves older credential reads', async () => {
    const f = await fixture();
    await f.database.transaction(down);
    try {
        expect(
            await f.database.schema.hasColumn(
                'user_warehouse_credentials',
                'needs_sign_in_at',
            ),
        ).toBe(false);
        expect(
            await f.database.schema.hasColumn(
                'user_warehouse_credentials',
                'needs_sign_in_reason',
            ),
        ).toBe(false);
        const row = await f
            .database('user_warehouse_credentials')
            .where('user_warehouse_credentials_uuid', f.uuid)
            .select('encrypted_credentials', 'name')
            .first();
        expect(
            row!.encrypted_credentials.equals(f.snapshot.encryptedCredentials),
        ).toBe(true);
    } finally {
        await f.database.transaction(up);
    }
    expect((await f.model.getByUuid(f.uuid, true)).needsSignIn).toBeNull();
    expect(await f.model.getByUuid(f.uuid)).not.toHaveProperty('needsSignIn');
});
