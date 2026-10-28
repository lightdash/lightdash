import {
    NotFoundError,
    OpenIdIdentityIssuerType,
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
        sshKeyPairPublicKey: null,
        webIdentityAudience: null,
        issuerAgentClientUuid: null,
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

const agentClient = async (f: Awaited<ReturnType<typeof fixture>>) => {
    const existing = await migrated
        .database('organization_snowflake_agent_clients')
        .where('organization_uuid', f.base.organizationUuid)
        .first();
    if (existing) return existing.organization_snowflake_agent_client_uuid;
    const [client] = await migrated
        .database('organization_snowflake_agent_clients')
        .insert({
            organization_uuid: f.base.organizationUuid,
            account_url: 'https://test.snowflakecomputing.com',
            account_identifier: 'test',
            client_id: 'client',
            encrypted_client_secret: encryptionUtil.encrypt('client-secret'),
        })
        .returning('organization_snowflake_agent_client_uuid');
    return client.organization_snowflake_agent_client_uuid;
};

const identityLinks = async (f: Awaited<ReturnType<typeof fixture>>) => {
    const publicKey = `public-${f.base.organizationUuid}`;
    const audience = `audience-${f.base.organizationUuid}`;
    await migrated.database('ssh_key_pairs').insert({
        public_key: publicKey,
        private_key: encryptionUtil.encrypt('private'),
        organization_uuid: f.base.organizationUuid,
    });
    await migrated.database('aws_web_identity_audiences').insert({
        audience,
        organization_uuid: f.base.organizationUuid,
        created_by_user_uuid: null,
    });
    return {
        ssh_key_pair_public_key: publicKey,
        web_identity_audience: audience,
        issuer_agent_client_uuid: await agentClient(f),
    };
};

test('reverses and reapplies all three tables', async () => {
    await migrated.database.transaction(async (trx) => {
        const links =
            await import('../20261028120000_link_credential_identities');
        await links.down(trx);
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
        await links.up(trx);
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
        { purpose: 'ssh_key_pair' as CredentialPurpose, warehouse_type: null },
        { purpose: 'agent_oauth_client' as CredentialPurpose },
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
    const issuerAgentClientUuid = await agentClient(f);
    await Promise.all(
        cases.map(async ([purpose, owners, warehouse]) => {
            await Promise.all(
                (['organization', 'connection', 'person'] as const).map(
                    async (owner) => {
                        const insert = {
                            ...f.raw,
                            purpose,
                            issuer_agent_client_uuid:
                                purpose === 'agent_sign_in'
                                    ? issuerAgentClientUuid
                                    : null,
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

test('refuses a connection credential owned by a project in another organization', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
        f.model.create({
            ...f.base,
            purpose: 'ai_service_account',
            ownerKind: 'connection',
            ownerProjectUuid: other.projectUuid,
        }),
    ).rejects.toThrow(ParameterError);
    expect(
        await migrated
            .database('credentials')
            .where('organization_uuid', f.base.organizationUuid),
    ).toHaveLength(0);
});

test('accepts a connection credential owned by a project in the same organization', async () => {
    const f = await fixture();
    const credential = await f.model.create({
        ...f.base,
        purpose: 'ai_service_account',
        ownerKind: 'connection',
        ownerProjectUuid: f.projectUuid,
    });
    expect(await f.model.getMetadata(credential.uuid)).toMatchObject({
        organizationUuid: f.base.organizationUuid,
        ownerKind: 'connection',
        ownerProjectUuid: f.projectUuid,
    });
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

test.each([
    ['another user', OpenIdIdentityIssuerType.GOOGLE, true, true],
    ['an organization', OpenIdIdentityIssuerType.GOOGLE, false, false],
    ['another provider', OpenIdIdentityIssuerType.SNOWFLAKE, false, true],
] as const)(
    'refuses an OAuth grant belonging to %s',
    async (_label, provider, otherUser, person) => {
        const f = await fixture();
        const [grant] = await migrated
            .database('user_oauth_grants')
            .insert({
                user_uuid: otherUser ? f.otherUserUuid : f.userUuid,
                provider,
                provider_subject: 'grant-subject',
                provider_email: 'alice@example.com',
                scopes: [],
                encrypted_refresh_token:
                    encryptionUtil.encrypt('refresh-token'),
            })
            .returning('user_oauth_grant_uuid');
        await expect(
            f.model.create({
                ...f.base,
                ownerKind: person ? 'person' : 'organization',
                ownerUserUuid: person ? f.userUuid : null,
                purpose: person ? 'personal_sign_in' : 'shared_login',
                oauthGrantUuid: grant.user_oauth_grant_uuid,
            }),
        ).rejects.toThrow(ParameterError);
        expect(
            await migrated
                .database('credentials')
                .where('organization_uuid', f.base.organizationUuid),
        ).toHaveLength(0);
    },
);

test('accepts a Google OAuth grant owned by the credential owner', async () => {
    const f = await fixture();
    const [grant] = await migrated
        .database('user_oauth_grants')
        .insert({
            user_uuid: f.userUuid,
            provider: OpenIdIdentityIssuerType.GOOGLE,
            provider_subject: 'alice',
            provider_email: 'alice@example.com',
            scopes: [],
            encrypted_refresh_token: encryptionUtil.encrypt('refresh-token'),
        })
        .returning('user_oauth_grant_uuid');
    const credential = await f.model.create({
        ...f.base,
        ownerKind: 'person',
        ownerUserUuid: f.userUuid,
        purpose: 'personal_sign_in',
        warehouseType: WarehouseTypes.BIGQUERY,
        authMode: 'sso',
        identity: { client_id: null },
        secrets: { token: 'access-token' },
        oauthGrantUuid: grant.user_oauth_grant_uuid,
    });
    expect(await f.model.getMetadata(credential.uuid)).toMatchObject({
        ownerUserUuid: f.userUuid,
        oauthGrantUuid: grant.user_oauth_grant_uuid,
    });
});

test('creates and reads all three identity links through the model', async () => {
    const f = await fixture();
    const links = await identityLinks(f);
    const shared = await f.model.create({
        ...f.base,
        sshKeyPairPublicKey: links.ssh_key_pair_public_key,
    });
    expect(await f.model.getMetadata(shared.uuid)).toMatchObject({
        sshKeyPairPublicKey: links.ssh_key_pair_public_key,
    });
    const web = await f.model.create({
        ...f.base,
        warehouseType: WarehouseTypes.ATHENA,
        authMode: 'web_identity',
        identity: { assumeRoleArn: 'role' },
        secrets: {},
        webIdentityAudience: links.web_identity_audience,
    });
    expect(await f.model.getMetadata(web.uuid)).toMatchObject({
        webIdentityAudience: links.web_identity_audience,
    });
    const agent = await f.model.create({
        ...f.base,
        ownerKind: 'person',
        ownerUserUuid: f.userUuid,
        purpose: 'agent_sign_in',
        authMode: 'sso',
        secrets: { token: 'access' },
        issuerAgentClientUuid: links.issuer_agent_client_uuid,
    });
    expect(await f.model.getMetadata(agent.uuid)).toMatchObject({
        issuerAgentClientUuid: links.issuer_agent_client_uuid,
        issuerCredentialUuid: null,
    });
});

test('identity replacement clears refresh state and rejects a stale token CAS', async () => {
    const f = await fixture();
    const credential = await f.model.create({
        ...f.base,
        ownerKind: 'person',
        ownerUserUuid: f.userUuid,
        purpose: 'personal_sign_in',
        authMode: 'sso',
        secrets: { token: 'original-access' },
    });
    await f.model.upsertTokenState(
        credential.uuid,
        'original-refresh',
        new Date('2030-01-01'),
    );
    await migrated
        .database('credential_token_state')
        .where('credential_uuid', credential.uuid)
        .update({ updated_at: new Date('2020-01-01') });
    const before = await f.model.findTokenState(credential.uuid);
    expect(before).toMatchObject({
        version: '0',
        refreshToken: 'original-refresh',
    });
    await f.model.replaceIdentityAndSecrets(
        credential.uuid,
        { user: 'bob' },
        { token: 'replacement-access' },
        null,
    );
    expect(
        await f.model.compareAndSwapRefreshToken(
            credential.uuid,
            before!.version,
            'stale-refresh',
            new Date('2030-01-01'),
        ),
    ).toBe(false);
    const after = await f.model.findTokenState(credential.uuid);
    expect(after).toMatchObject({
        version: '1',
        refreshToken: null,
        refreshExpiresAt: null,
    });
    expect(after!.updatedAt.getTime()).toBeGreaterThan(
        before!.updatedAt.getTime(),
    );
    expect(
        await migrated
            .database('credential_token_state')
            .select('encrypted_refresh_token')
            .where('credential_uuid', credential.uuid)
            .first(),
    ).toEqual({ encrypted_refresh_token: null });
});

test('secret rotation preserves refresh state for the same identity', async () => {
    const f = await fixture();
    const credential = await f.model.create(f.base);
    await f.model.upsertTokenState(
        credential.uuid,
        'original-refresh',
        new Date('2030-01-01'),
    );
    const before = await f.model.findTokenState(credential.uuid);
    await f.model.replaceSecrets(
        credential.uuid,
        { password: 'rotated-password' },
        null,
    );
    expect(await f.model.findTokenState(credential.uuid)).toEqual(before);
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

const linkedCredential = (
    f: Awaited<ReturnType<typeof fixture>>,
    column: string,
    value: string,
): DbCredentialsInsert => ({
    ...f.raw,
    ...(column === 'web_identity_audience'
        ? { warehouse_type: WarehouseTypes.ATHENA, auth_mode: 'web_identity' }
        : {}),
    ...(column === 'issuer_agent_client_uuid'
        ? {
              purpose: 'agent_sign_in' as const,
              owner_kind: 'person' as const,
              owner_user_uuid: f.userUuid,
          }
        : {}),
    [column]: value,
});

const linkColumns = [
    'ssh_key_pair_public_key',
    'web_identity_audience',
    'issuer_agent_client_uuid',
] as const;

test.each(linkColumns)(
    'enforces the organization and existence of %s',
    async (column) => {
        const f = await fixture();
        const other = await fixture();
        const links = await identityLinks(f);
        const row = linkedCredential(f, column, links[column]);
        await expect(
            migrated.database('credentials').insert({
                ...row,
                organization_uuid: other.base.organizationUuid,
            }),
        ).rejects.toMatchObject({ code: '23503' });
        await expect(
            migrated.database('credentials').insert(row),
        ).resolves.toBeDefined();
        await expect(
            migrated.database('credentials').insert({
                ...row,
                [column]:
                    column === 'issuer_agent_client_uuid'
                        ? '00000000-0000-0000-0000-000000000001'
                        : 'missing',
            }),
        ).rejects.toMatchObject({ code: '23503' });
    },
);

test.each(['ssh_key_pair_public_key', 'web_identity_audience'] as const)(
    'reserves %s only when it is present',
    async (column) => {
        const f = await fixture();
        const links = await identityLinks(f);
        await migrated.database('credentials').insert([f.raw, f.raw]);
        const row = linkedCredential(f, column, links[column]);
        await migrated.database('credentials').insert(row);
        await expect(
            migrated.database('credentials').insert(row),
        ).rejects.toMatchObject({ code: '23505' });
    },
);

test('limits SSH links to shared logins', async () => {
    const f = await fixture();
    const links = await identityLinks(f);
    const row = linkedCredential(
        f,
        'ssh_key_pair_public_key',
        links.ssh_key_pair_public_key,
    );
    await expect(
        migrated.database('credentials').insert({
            ...row,
            purpose: 'ai_service_account',
            owner_kind: 'connection',
            owner_project_uuid: f.projectUuid,
        }),
    ).rejects.toMatchObject({
        code: '23514',
        constraint: 'credentials_ssh_key_pair_purpose_check',
    });
    await expect(
        migrated.database('credentials').insert(row),
    ).resolves.toBeDefined();
});

test.each([
    { warehouse_type: WarehouseTypes.SNOWFLAKE, auth_mode: 'web_identity' },
    { warehouse_type: WarehouseTypes.ATHENA, auth_mode: 'access_key' },
    {
        purpose: 'git_installation',
        warehouse_type: null,
        auth_mode: 'web_identity',
    },
])(
    'limits web identity links to Athena web identity auth: %j',
    async (patch) => {
        const f = await fixture();
        const links = await identityLinks(f);
        const row = linkedCredential(
            f,
            'web_identity_audience',
            links.web_identity_audience,
        );
        await expect(
            migrated
                .database('credentials')
                .insert({ ...row, ...patch } as DbCredentialsInsert),
        ).rejects.toMatchObject({
            code: '23514',
            constraint: 'credentials_web_identity_auth_check',
        });
        await expect(
            migrated.database('credentials').insert(row),
        ).resolves.toBeDefined();
    },
);

test('requires an agent client exactly for agent sign-ins and lets it issue many sign-ins', async () => {
    const f = await fixture();
    const issuer = await agentClient(f);
    const row = linkedCredential(f, 'issuer_agent_client_uuid', issuer);
    await expect(
        migrated
            .database('credentials')
            .insert({ ...row, issuer_agent_client_uuid: null }),
    ).rejects.toMatchObject({
        code: '23514',
        constraint: 'credentials_agent_client_purpose_check',
    });
    await expect(
        migrated
            .database('credentials')
            .insert({ ...f.raw, issuer_agent_client_uuid: issuer }),
    ).rejects.toMatchObject({
        code: '23514',
        constraint: 'credentials_agent_client_purpose_check',
    });
    await expect(
        migrated.database('credentials').insert([row, row]),
    ).resolves.toBeDefined();
    await expect(
        migrated.database('credentials').insert(f.raw),
    ).resolves.toBeDefined();
});

test('requires Snowflake when an agent sign-in links a Snowflake client', async () => {
    const f = await fixture();
    const issuer = await agentClient(f);
    const row = linkedCredential(f, 'issuer_agent_client_uuid', issuer);
    await expect(
        migrated.database('credentials').insert({
            ...row,
            warehouse_type: WarehouseTypes.BIGQUERY,
        }),
    ).rejects.toMatchObject({
        code: '23514',
        constraint: 'credentials_agent_client_warehouse_check',
    });
    await expect(
        migrated.database('credentials').insert(row),
    ).resolves.toBeDefined();
});

test.each(['shared_login', 'agent_sign_in'] as const)(
    'forbids the old issuer credential link for %s',
    async (purpose) => {
        const f = await fixture();
        const issuer = await f.model.create(f.base);
        const row =
            purpose === 'agent_sign_in'
                ? linkedCredential(
                      f,
                      'issuer_agent_client_uuid',
                      await agentClient(f),
                  )
                : f.raw;
        await expect(
            migrated
                .database('credentials')
                .insert({ ...row, issuer_credential_uuid: issuer.uuid }),
        ).rejects.toMatchObject({
            code: '23514',
            constraint: 'credentials_issuer_credential_null_check',
        });
        await expect(
            migrated.database('credentials').insert(row),
        ).resolves.toBeDefined();
    },
);

test('restores the old checks on down and reapplies the identity links', async () => {
    const migration =
        await import('../20261028120000_link_credential_identities');
    const f = await fixture();
    const links = await identityLinks(f);
    await migrated.database.transaction(async (trx) => {
        await trx('credentials').delete();
        const checks = () =>
            trx('pg_constraint')
                .select(
                    'conname',
                    trx.raw('pg_get_constraintdef(oid) AS definition'),
                )
                .where({
                    conrelid: trx.raw("'credentials'::regclass"),
                    contype: 'c',
                })
                .orderBy('conname');
        const before = await checks();
        await migration.down(trx);
        expect(
            await Promise.all(
                linkColumns.map((column) =>
                    trx.schema.hasColumn('credentials', column),
                ),
            ),
        ).toEqual([false, false, false]);
        const previous = await trx('credentials')
            .insert(
                ['ssh_key_pair', 'agent_oauth_client'].map(
                    (purpose) =>
                        ({
                            ...f.raw,
                            purpose,
                            warehouse_type:
                                purpose === 'ssh_key_pair'
                                    ? null
                                    : WarehouseTypes.SNOWFLAKE,
                        }) as DbCredentialsInsert,
                ),
            )
            .returning('credential_uuid');
        await trx('credentials').insert({
            ...f.raw,
            purpose: 'agent_sign_in',
            owner_kind: 'person',
            owner_user_uuid: f.userUuid,
            issuer_credential_uuid: previous[1].credential_uuid,
        });
        await trx('credentials')
            .where('organization_uuid', f.base.organizationUuid)
            .delete();
        await migration.up(trx);
        expect(await checks()).toEqual(before);
        await trx('credentials').insert(
            linkColumns.map((column) =>
                linkedCredential(f, column, links[column]),
            ),
        );
    });
});
