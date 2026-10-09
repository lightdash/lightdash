import {
    NotFoundError,
    ParameterError,
    sensitiveCredentialsFieldNames,
    WarehouseTypes,
    type CredentialOwnerKind,
    type CredentialPurpose,
} from '@lightdash/common';
import { createEncryptionUtil } from '../../../models/CredentialsModel/credentialCodec.mock';
import {
    CredentialsModel,
    type CreateCredential,
} from '../../../models/CredentialsModel/CredentialsModel';
import { rotateRegisteredCiphertext } from '../../../scripts/rotate-lightdash-secret/rotation';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { type DbCredentialBindingsInsert } from '../../entities/credentialBindings';
import { type DbCredentialsInsert } from '../../entities/credentials';
import { down, up } from '../20261009223647_create_credentials_tables';

let migrated: MigratedDatabase;
const encryptionUtil = createEncryptionUtil();
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Credentials test' })
        .returning('*');
    const users = await database('users')
        .insert([
            { first_name: 'First', last_name: 'Owner' },
            { first_name: 'Other', last_name: 'Owner' },
        ] as never)
        .returning('user_uuid');
    const projects = await database('projects')
        .insert([
            { name: 'First', organization_id: org.organization_id },
            { name: 'Other', organization_id: org.organization_id },
        ] as never)
        .returning('project_uuid');
    const [connection] = await database('warehouse_connections')
        .insert({
            project_uuid: projects[0].project_uuid,
            name: 'Extra',
            is_original: false,
            warehouse_type: 'snowflake',
            encrypted_credentials: encryptionUtil.encrypt('{}'),
        })
        .returning('warehouse_connection_uuid');
    const model = new CredentialsModel({ database, encryptionUtil });
    const base: CreateCredential = {
        organizationUuid: org.organization_uuid,
        ownerKind: 'organization',
        ownerUserUuid: null,
        ownerProjectUuid: null,
        ownerWarehouseConnectionUuid: null,
        purpose: 'shared_login',
        warehouseType: WarehouseTypes.SNOWFLAKE,
        authMode: 'password',
        subjectUserUuid: null,
        subjectLabel: null,
        issuerCredentialUuid: null,
        oauthGrantUuid: null,
        expiresAt: null,
        createdByUserUuid: users[0].user_uuid,
        updatedByUserUuid: users[0].user_uuid,
        identity: { user: 'alice' },
        secrets: { password: 'secret-password' },
    };
    const raw: DbCredentialsInsert = {
        organization_uuid: org.organization_uuid,
        owner_kind: 'organization',
        purpose: 'shared_login',
        warehouse_type: WarehouseTypes.SNOWFLAKE,
        auth_mode: 'password',
        encrypted_secrets: encryptionUtil.encrypt(
            '{"password":"secret-password"}',
        ),
    };
    return {
        model,
        base,
        raw,
        projectUuid: projects[0].project_uuid,
        otherProjectUuid: projects[1].project_uuid,
        userUuid: users[0].user_uuid,
        otherUserUuid: users[1].user_uuid,
        connectionUuid: connection.warehouse_connection_uuid,
    };
};

test('reverses and reapplies all three tables', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(
            await Promise.all(
                [
                    'credentials',
                    'credential_token_state',
                    'credential_bindings',
                ].map((table) => trx.schema.hasTable(table)),
            ),
        ).toEqual([false, false, false]);
        await up(trx);
        expect(
            await Promise.all(
                [
                    'credentials',
                    'credential_token_state',
                    'credential_bindings',
                ].map((table) => trx.schema.hasTable(table)),
            ),
        ).toEqual([true, true, true]);
    });
});

test('rejects every invalid credential CHECK shape', async () => {
    const f = await fixture();
    const invalid: Partial<DbCredentialsInsert>[] = [
        { purpose: 'unknown' as CredentialPurpose },
        { owner_kind: 'unknown' as CredentialOwnerKind },
        { purpose: 'ai_service_account' },
        { owner_kind: 'person', purpose: 'personal_sign_in' },
        { owner_user_uuid: f.userUuid },
        { owner_kind: 'connection' },
        { owner_project_uuid: f.projectUuid },
        { owner_warehouse_connection_uuid: f.connectionUuid },
        { warehouse_type: null },
        { purpose: 'ssh_key_pair', warehouse_type: WarehouseTypes.SNOWFLAKE },
        { identity: '[]' as unknown as Record<string, unknown> },
        { source_table: 'legacy' },
        { source_key: 'legacy-key' },
        { source_fingerprint: 'fingerprint' },
    ];
    await Promise.all(
        invalid.map((patch) =>
            expect(
                migrated.database('credentials').insert({ ...f.raw, ...patch }),
            ).rejects.toMatchObject({ code: '23514' }),
        ),
    );
});

test('enforces the full purpose to owner matrix and warehouse presence', async () => {
    const f = await fixture();
    const cases: Array<[CredentialPurpose, CredentialOwnerKind[], boolean]> = [
        ['shared_login', ['organization', 'connection'], true],
        ...(
            [
                'ai_service_account',
                'delivery_service_account',
                'embed_service_account',
                'automation_service_account',
            ] as const
        ).map(
            (purpose): [CredentialPurpose, CredentialOwnerKind[], boolean] => [
                purpose,
                ['connection'],
                true,
            ],
        ),
        ['personal_sign_in', ['person'], true],
        ['agent_sign_in', ['person'], true],
        ['agent_oauth_client', ['organization'], true],
        ['ssh_key_pair', ['organization'], false],
        ['git_installation', ['organization'], false],
        ['git_user', ['person'], false],
        ...(
            [
                'dbt_cloud',
                'dbt_git',
                'dbt_environment',
                'external_source',
            ] as const
        ).map(
            (purpose): [CredentialPurpose, CredentialOwnerKind[], boolean] => [
                purpose,
                ['connection'],
                false,
            ],
        ),
    ];
    await Promise.all(
        cases.map(async ([purpose, owners, warehouse]) => {
            await Promise.all(
                (['organization', 'connection', 'person'] as const).map(
                    async (owner) => {
                        const insert = {
                            ...f.raw,
                            purpose,
                            owner_kind: owner,
                            owner_user_uuid:
                                owner === 'person' ? f.userUuid : null,
                            owner_project_uuid:
                                owner === 'connection' ? f.projectUuid : null,
                            warehouse_type: warehouse
                                ? WarehouseTypes.SNOWFLAKE
                                : null,
                        };
                        if (owners.includes(owner)) {
                            await expect(
                                migrated.database('credentials').insert(insert),
                            ).resolves.toBeDefined();
                            await expect(
                                migrated.database('credentials').insert({
                                    ...insert,
                                    warehouse_type: warehouse
                                        ? null
                                        : WarehouseTypes.SNOWFLAKE,
                                }),
                            ).rejects.toMatchObject({ code: '23514' });
                        } else
                            await expect(
                                migrated.database('credentials').insert(insert),
                            ).rejects.toMatchObject({ code: '23514' });
                    },
                ),
            );
        }),
    );
});

test('rejects a connection credential whose extra connection belongs to another project', async () => {
    const f = await fixture();
    const credential = {
        ...f.raw,
        owner_kind: 'connection' as const,
        owner_project_uuid: f.otherProjectUuid,
        owner_warehouse_connection_uuid: f.connectionUuid,
    };
    await expect(
        migrated.database('credentials').insert(credential),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
        migrated.database('credentials').insert({
            ...credential,
            owner_project_uuid: f.projectUuid,
        }),
    ).resolves.toBeDefined();
});

test('allows an issuer credential only for agent sign-in', async () => {
    const f = await fixture();
    const issuer = await f.model.create({
        ...f.base,
        purpose: 'agent_oauth_client',
        authMode: 'oauth',
        identity: { clientId: 'agent-client' },
        secrets: { clientSecret: 'secret-client' },
    });
    await expect(
        migrated.database('credentials').insert({
            ...f.raw,
            issuer_credential_uuid: issuer.uuid,
        }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
        migrated.database('credentials').insert({
            ...f.raw,
            purpose: 'agent_sign_in',
            owner_kind: 'person',
            owner_user_uuid: f.userUuid,
            issuer_credential_uuid: issuer.uuid,
        }),
    ).resolves.toBeDefined();
});

test('refuses to bind credentials across organizations without inserting a binding', async () => {
    const f = await fixture();
    const credential = await f.model.create(f.base);
    const [otherOrg] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Other credentials test' })
        .returning('organization_id');
    const [otherProject] = await migrated
        .database('projects')
        .insert({
            name: 'Other organization project',
            organization_id: otherOrg.organization_id,
        } as never)
        .returning('project_uuid');
    const key = {
        projectUuid: otherProject.project_uuid,
        warehouseConnectionUuid: null,
        slot: 'shared_login' as const,
        userUuid: null,
    };
    await expect(f.model.bind(key, credential.uuid, null)).rejects.toThrow(
        ParameterError,
    );
    expect(await f.model.findBinding(key)).toBeNull();
    expect(
        await migrated
            .database('credential_bindings')
            .where('credential_uuid', credential.uuid),
    ).toHaveLength(0);
    await f.model.bind(
        { ...key, projectUuid: f.projectUuid },
        credential.uuid,
        null,
    );
    expect(
        await f.model.findBinding({ ...key, projectUuid: f.projectUuid }),
    ).toBe(credential.uuid);
});

test('keeps source rows unique only when a source is provided', async () => {
    const f = await fixture();
    await migrated.database('credentials').insert([f.raw, f.raw]);
    const source = { ...f.raw, source_table: 'legacy', source_key: 'row' };
    await migrated.database('credentials').insert(source);
    await expect(
        migrated.database('credentials').insert(source),
    ).rejects.toMatchObject({ code: '23505' });
});

test('rejects invalid binding slots, wrong owners, wrong purposes and cross-project connections', async () => {
    const f = await fixture();
    const shared = await f.model.create(f.base);
    const personal = await f.model.create({
        ...f.base,
        ownerKind: 'person',
        ownerUserUuid: f.userUuid,
        purpose: 'personal_sign_in',
    });
    const base: DbCredentialBindingsInsert = {
        project_uuid: f.projectUuid,
        slot: 'shared_login',
        credential_uuid: shared.uuid,
    };
    await Promise.all(
        [
            { slot: 'unknown' },
            { slot: 'personal_sign_in' },
            { slot: 'agent_sign_in' },
            { user_uuid: f.userUuid },
        ].map(async (patch) => {
            await expect(
                migrated.database('credential_bindings').insert({
                    ...base,
                    ...patch,
                } as DbCredentialBindingsInsert),
            ).rejects.toMatchObject({ code: '23514' });
        }),
    );
    await expect(
        migrated.database('credential_bindings').insert({
            ...base,
            slot: 'personal_sign_in',
            user_uuid: f.otherUserUuid,
            credential_uuid: personal.uuid,
        }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
        migrated
            .database('credential_bindings')
            .insert({ ...base, slot: 'ai_service_account' }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
        migrated.database('credential_bindings').insert({
            ...base,
            project_uuid: f.otherProjectUuid,
            warehouse_connection_uuid: f.connectionUuid,
        }),
    ).rejects.toMatchObject({ code: '23503' });
});

test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
])(
    'enforces slot uniqueness for extra=%s personal=%s',
    async (extra, personal) => {
        const f = await fixture();
        const input: CreateCredential = personal
            ? {
                  ...f.base,
                  purpose: 'personal_sign_in',
                  ownerKind: 'person',
                  ownerUserUuid: f.userUuid,
              }
            : f.base;
        const credential = await f.model.create(input);
        const replacement = await f.model.create(input);
        const key = {
            projectUuid: f.projectUuid,
            warehouseConnectionUuid: extra ? f.connectionUuid : null,
            slot: personal
                ? ('personal_sign_in' as const)
                : ('shared_login' as const),
            userUuid: personal ? f.userUuid : null,
        };
        await f.model.bind(key, credential.uuid, f.userUuid);
        await expect(
            f.model.bind(key, replacement.uuid, f.userUuid),
        ).rejects.toMatchObject({ code: '23505' });
        expect(await f.model.findBinding(key)).toBe(credential.uuid);
        await f.model.unbind(key);
        expect(await f.model.findBinding(key)).toBeNull();
        await f.model.bind(key, replacement.uuid, null);
    },
);

test('allows one credential on multiple projects and connections', async () => {
    const f = await fixture();
    const credential = await f.model.create(f.base);
    await Promise.all(
        [
            [f.projectUuid, null],
            [f.otherProjectUuid, null],
            [f.projectUuid, f.connectionUuid],
        ].map(async ([projectUuid, warehouseConnectionUuid]) => {
            await f.model.bind(
                {
                    projectUuid: projectUuid!,
                    warehouseConnectionUuid,
                    slot: 'shared_login',
                    userUuid: null,
                },
                credential.uuid,
                null,
            );
        }),
    );
    expect(
        await migrated
            .database('credential_bindings')
            .where('credential_uuid', credential.uuid),
    ).toHaveLength(3);
});

test('deleting a credential cascades bindings and token state', async () => {
    const f = await fixture();
    const credential = await f.model.create(f.base);
    await f.model.bind(
        {
            projectUuid: f.projectUuid,
            warehouseConnectionUuid: null,
            slot: 'shared_login',
            userUuid: null,
        },
        credential.uuid,
        null,
    );
    await f.model.upsertTokenState(credential.uuid, 'secret-refresh', null);
    await f.model.delete(credential.uuid);
    expect(
        await migrated
            .database('credential_bindings')
            .where('credential_uuid', credential.uuid),
    ).toHaveLength(0);
    expect(await f.model.findTokenState(credential.uuid)).toBeNull();
});

test('project deletion removes connection credentials and bindings but preserves organization and person credentials', async () => {
    const f = await fixture();
    const shared = await f.model.create(f.base);
    const person = await f.model.create({
        ...f.base,
        purpose: 'personal_sign_in',
        ownerKind: 'person',
        ownerUserUuid: f.userUuid,
    });
    const connection = await f.model.create({
        ...f.base,
        purpose: 'ai_service_account',
        ownerKind: 'connection',
        ownerProjectUuid: f.projectUuid,
    });
    const extra = await f.model.create({
        ...f.base,
        purpose: 'ai_service_account',
        ownerKind: 'connection',
        ownerProjectUuid: f.projectUuid,
        ownerWarehouseConnectionUuid: f.connectionUuid,
    });
    await Promise.all(
        [shared, person, connection].map(async (credential) => {
            await f.model.bind(
                {
                    projectUuid: f.projectUuid,
                    warehouseConnectionUuid: null,
                    slot: credential.purpose as
                        | 'shared_login'
                        | 'personal_sign_in'
                        | 'ai_service_account',
                    userUuid: credential.ownerUserUuid,
                },
                credential.uuid,
                null,
            );
            await f.model.upsertTokenState(
                credential.uuid,
                'secret-refresh',
                null,
            );
        }),
    );
    await migrated
        .database('projects')
        .where('project_uuid', f.projectUuid)
        .delete();
    expect(
        await migrated
            .database('credential_bindings')
            .where('project_uuid', f.projectUuid),
    ).toHaveLength(0);
    expect(await f.model.getMetadata(shared.uuid)).not.toBeNull();
    expect(await f.model.getMetadata(person.uuid)).not.toBeNull();
    expect(await f.model.findTokenState(shared.uuid)).not.toBeNull();
    expect(await f.model.findTokenState(person.uuid)).not.toBeNull();
    await expect(f.model.getMetadata(connection.uuid)).rejects.toThrow(
        NotFoundError,
    );
    await expect(f.model.getMetadata(extra.uuid)).rejects.toThrow(
        NotFoundError,
    );
    expect(await f.model.findTokenState(connection.uuid)).toBeNull();
});

test('round trips the model, rotates generations, and performs atomic token CAS', async () => {
    const f = await fixture();
    const created = await f.model.create(f.base);
    const metadata = await f.model.getMetadata(created.uuid);
    expect(metadata).toEqual(created);
    expect(metadata).not.toHaveProperty('identity');
    expect(metadata).not.toHaveProperty('encrypted_secrets');
    for (const key of sensitiveCredentialsFieldNames)
        expect(metadata).not.toHaveProperty(key);
    expect(await f.model.getIdentity(created.uuid)).toEqual(f.base.identity);
    expect(
        (await f.model.getSecretsForResolution(created.uuid)).secrets,
    ).toEqual(f.base.secrets);
    const rotated = await f.model.replaceSecrets(
        created.uuid,
        { password: 'secret-new' },
        f.otherUserUuid,
    );
    expect(rotated.generation).not.toBe(created.generation);
    expect(rotated.rotatedAt).toBeInstanceOf(Date);
    expect(rotated.updatedByUserUuid).toBe(f.otherUserUuid);
    expect(await f.model.getIdentity(created.uuid)).toEqual(f.base.identity);
    const replaced = await f.model.replaceIdentityAndSecrets(
        created.uuid,
        { user: 'bob' },
        { password: 'secret-replaced' },
        null,
    );
    expect(replaced.generation).not.toBe(rotated.generation);
    expect(await f.model.getIdentity(created.uuid)).toEqual({ user: 'bob' });
    expect(
        (await f.model.getSecretsForResolution(created.uuid)).secrets,
    ).toEqual({ password: 'secret-replaced' });
    await f.model.upsertTokenState(created.uuid, 'secret-refresh', null);
    expect((await f.model.findTokenState(created.uuid))?.version).toBe('0');
    const results = await Promise.all([
        f.model.compareAndSwapRefreshToken(
            created.uuid,
            '0',
            'secret-next',
            null,
        ),
        f.model.compareAndSwapRefreshToken(
            created.uuid,
            '0',
            'secret-next',
            null,
        ),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(await f.model.findTokenState(created.uuid)).toMatchObject({
        version: '1',
        refreshToken: 'secret-next',
    });
    expect(
        await migrated
            .database('credential_token_state')
            .where({ credential_uuid: created.uuid, version: '0' })
            .update({ version: migrated.database.raw('version + 1') }),
    ).toBe(0);
    await expect(
        migrated
            .database('credential_token_state')
            .where('credential_uuid', created.uuid)
            .update({ version: '-1' }),
    ).rejects.toMatchObject({ code: '23514' });
    await migrated
        .database('credential_token_state')
        .where('credential_uuid', created.uuid)
        .update({ version: '9007199254740993' });
    expect((await f.model.findTokenState(created.uuid))?.version).toBe(
        '9007199254740993',
    );
    await f.model.upsertTokenState(created.uuid, null, null);
    expect(await f.model.findTokenState(created.uuid)).toMatchObject({
        version: '9007199254740994',
        refreshToken: null,
    });
    expect((await f.model.getMetadata(created.uuid)).generation).toBe(
        replaced.generation,
    );
});

test('key rotation re-encrypts both new stores without changing generation or token version', async () => {
    const f = await fixture();
    const credential = await f.model.create(f.base);
    await f.model.upsertTokenState(credential.uuid, 'secret-refresh', null);
    const nextEncryption = createEncryptionUtil('new-active-key', [
        'active-test-key',
    ]);
    const context = {
        database: migrated.database,
        encryptionUtil: nextEncryption,
        lightdashSecrets: nextEncryption.lightdashConfig.lightdashSecrets,
    };
    const options = {
        execute: false,
        batchSize: 2,
        tables: ['credentials', 'credential_token_state'],
    };
    const before = await migrated
        .database('credentials')
        .select('encrypted_secrets')
        .where('credential_uuid', credential.uuid)
        .first();
    const dryRun = await rotateRegisteredCiphertext(context, options);
    expect(dryRun.every((entry) => entry.reEncrypted === 0)).toBe(true);
    expect(dryRun.every((entry) => entry.fallback > 0)).toBe(true);
    expect(
        (
            await migrated
                .database('credentials')
                .select('encrypted_secrets')
                .where('credential_uuid', credential.uuid)
                .first()
        )?.encrypted_secrets,
    ).toEqual(before?.encrypted_secrets);
    const results = await rotateRegisteredCiphertext(context, {
        ...options,
        execute: true,
    });
    expect(results).toHaveLength(2);
    expect(
        results.every(
            (entry) =>
                entry.reEncrypted > 0 &&
                entry.unreadablePrimaryKeys.length === 0,
        ),
    ).toBe(true);
    const reader = new CredentialsModel({
        database: migrated.database,
        encryptionUtil: createEncryptionUtil('new-active-key'),
    });
    expect(await reader.getSecretsForResolution(credential.uuid)).toEqual({
        secrets: f.base.secrets,
        keySource: { type: 'active' },
    });
    expect(await reader.findTokenState(credential.uuid)).toMatchObject({
        refreshToken: 'secret-refresh',
        version: '0',
        keySource: { type: 'active' },
    });
    expect((await reader.getMetadata(credential.uuid)).generation).toBe(
        credential.generation,
    );
});
