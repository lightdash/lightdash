import { AgentCapability } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { AgentConnectionGrantModel } from '../../../models/AgentConnectionGrantModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { type DbAgentConnectionGrantInsert } from '../../entities/agentConnectionGrants';
import {
    down as downGrants,
    up as upGrants,
} from '../20261011000002_add_agent_connection_grants';
import {
    down as downBindings,
    up as upBindings,
} from '../20261011000003_add_oauth_agent_connection_grants';

let migrated: MigratedDatabase;
const oauthTables = [
    'oauth2_authorization_codes',
    'oauth2_access_tokens',
    'oauth2_refresh_tokens',
] as const;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Agent grant test' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'Grant', last_name: 'Subject' } as never)
        .returning('*');
    const clientId = randomUUID();
    await database('oauth2_clients').insert({
        client_id: clientId,
        client_name: 'Grant test',
        redirect_uris: ['https://client.example/callback'],
        grants: ['authorization_code', 'refresh_token'],
        scopes: ['read'],
    });
    const grantInput: DbAgentConnectionGrantInsert = {
        organization_uuid: org.organization_uuid,
        subject_user_uuid: user.user_uuid,
        client_id: clientId,
        credential_kind: 'oauth',
        actor_kind: 'agent',
        name: 'cli-dev',
        resource: 'https://server.example',
        approved_capabilities: [AgentCapability.Query],
        approved_project_uuids: [],
        grant_contract_version: 1,
        approval_method: 'browser_consent',
        expires_at: new Date(Date.now() + 86400000),
    };
    return { org, user, clientId, grantInput };
};

const insertTokens = async (
    data: Awaited<ReturnType<typeof fixture>>,
    grantUuid: string | null,
) => {
    const id = randomUUID();
    const common = {
        client_id: data.clientId,
        user_id: data.user.user_id,
        organization_uuid: data.org.organization_uuid,
        expires_at: new Date(Date.now() + 60000),
        agent_connection_grant_uuid: grantUuid,
    };
    await migrated.database('oauth2_authorization_codes').insert({
        ...common,
        authorization_code: id,
        redirect_uri: 'https://client.example/callback',
    });
    await migrated
        .database('oauth2_access_tokens')
        .insert({ ...common, access_token: id });
    await migrated
        .database('oauth2_refresh_tokens')
        .insert({ ...common, refresh_token: id });
    return id;
};

test('creates all grant columns with required types, nullability and defaults', async () => {
    const { database } = migrated;
    const columns = await database('agent_connection_grants').columnInfo();
    const required = {
        agent_connection_grant_uuid: 'uuid',
        organization_uuid: 'uuid',
        subject_user_uuid: 'uuid',
        client_id: 'text',
        credential_kind: 'text',
        actor_kind: 'text',
        name: 'text',
        resource: 'text',
        approved_capabilities: 'ARRAY',
        approved_project_uuids: 'ARRAY',
        resource_constraints: 'jsonb',
        grant_contract_version: 'integer',
        grant_revision: 'integer',
        approval_method: 'text',
        approved_at: 'timestamp with time zone',
        expires_at: 'timestamp with time zone',
        created_at: 'timestamp with time zone',
    };
    const nullable = {
        refresh_family_uuid: 'uuid',
        approval_policy_version: 'integer',
        approved_by_user_uuid: 'uuid',
        approval_request_uuid: 'uuid',
        revoked_at: 'timestamp with time zone',
        revoked_by_user_uuid: 'uuid',
        revocation_reason: 'text',
        replaced_by_grant_uuid: 'uuid',
        last_used_at: 'timestamp with time zone',
    };
    expect(Object.keys(columns)).toHaveLength(
        Object.keys(required).length + Object.keys(nullable).length,
    );
    Object.entries(required).forEach(([column, type]) =>
        expect(columns[column as keyof typeof columns]).toMatchObject({
            type,
            nullable: false,
        }),
    );
    Object.entries(nullable).forEach(([column, type]) =>
        expect(columns[column as keyof typeof columns]).toMatchObject({
            type,
            nullable: true,
        }),
    );
    const data = await fixture();
    const [grant] = await database('agent_connection_grants')
        .insert(data.grantInput)
        .returning('*');
    expect(grant).toMatchObject({
        grant_revision: 1,
        resource_constraints: { version: 1 },
        refresh_family_uuid: null,
        revoked_at: null,
        last_used_at: null,
    });
    expect(grant.agent_connection_grant_uuid).toMatch(/^[a-f0-9-]{36}$/);
    expect(grant.approved_at).toBeInstanceOf(Date);
    expect(grant.created_at).toBeInstanceOf(Date);
});

test.each(['credential_kind', 'actor_kind', 'approval_method'])(
    'rejects unsupported %s',
    async (column) => {
        const data = await fixture();
        await expect(
            migrated
                .database('agent_connection_grants')
                .insert({ ...data.grantInput, [column]: 'invalid' }),
        ).rejects.toMatchObject({ code: '23514' });
    },
);

test('requires expiry after approval and a unique non-null refresh family', async () => {
    const { database } = migrated;
    const data = await fixture();
    const approvedAt = new Date();
    await expect(
        database('agent_connection_grants').insert({
            ...data.grantInput,
            approved_at: approvedAt,
            expires_at: approvedAt,
        }),
    ).rejects.toMatchObject({ code: '23514' });
    const familyUuid = randomUUID();
    await database('agent_connection_grants').insert({
        ...data.grantInput,
        refresh_family_uuid: familyUuid,
    });
    await expect(
        database('agent_connection_grants').insert({
            ...data.grantInput,
            refresh_family_uuid: familyUuid,
        }),
    ).rejects.toMatchObject({ code: '23505' });
    await database('agent_connection_grants').insert([
        data.grantInput,
        data.grantInput,
    ]);
});

test.each([
    'organization_uuid',
    'subject_user_uuid',
    'client_id',
    'approved_by_user_uuid',
    'revoked_by_user_uuid',
    'replaced_by_grant_uuid',
] as const)('enforces the %s foreign key', async (column) => {
    const data = await fixture();
    await expect(
        migrated
            .database('agent_connection_grants')
            .insert({ ...data.grantInput, [column]: randomUUID() }),
    ).rejects.toMatchObject({ code: '23503' });
});

test('adds nullable OAuth bindings, valid indexes and validated cascading foreign keys', async () => {
    const { database } = migrated;
    await upBindings(database);
    await Promise.all(
        oauthTables.map(async (table) => {
            expect(
                (await database(table).columnInfo())
                    .agent_connection_grant_uuid,
            ).toMatchObject({
                type: 'uuid',
                nullable: true,
                defaultValue: null,
            });
            const constraints = await database.raw(
                'SELECT convalidated, confdeltype FROM pg_constraint WHERE conrelid = ?::regclass AND confrelid = ?::regclass',
                [table, 'agent_connection_grants'],
            );
            expect(constraints.rows).toEqual([
                { convalidated: true, confdeltype: 'c' },
            ]);
            const indexes = await database.raw(
                'SELECT i.indisvalid, pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indrelid = ?::regclass',
                [table],
            );
            expect(indexes.rows).toContainEqual({
                indisvalid: true,
                definition: expect.stringContaining(
                    '(agent_connection_grant_uuid)',
                ),
            });
        }),
    );
    const indexes = await database.raw(
        "SELECT i.indisvalid, pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indrelid = 'agent_connection_grants'::regclass",
    );
    [
        'agent_connection_grant_uuid',
        'organization_uuid',
        'subject_user_uuid',
        'client_id',
        'approved_by_user_uuid',
        'revoked_by_user_uuid',
        'replaced_by_grant_uuid',
        'refresh_family_uuid',
        'subject_user_uuid, organization_uuid',
    ].forEach((columns) => {
        expect(indexes.rows).toContainEqual({
            indisvalid: true,
            definition: expect.stringContaining(`(${columns})`),
        });
    });
});

test('preserves unbound OAuth rows and removes bound rows through down, re-up and a partial retry', async () => {
    const { database } = migrated;
    await downBindings(database);
    await database.transaction(downGrants);
    expect(await database.schema.hasTable('agent_connection_grants')).toBe(
        false,
    );
    const data = await fixture();
    const common = {
        client_id: data.clientId,
        user_id: data.user.user_id,
        organization_uuid: data.org.organization_uuid,
        expires_at: new Date(Date.now() + 60000),
    };
    await database('oauth2_authorization_codes').insert({
        ...common,
        authorization_code: data.clientId,
        redirect_uri: 'https://client.example/callback',
    });
    await database('oauth2_access_tokens').insert({
        ...common,
        access_token: data.clientId,
    });
    await database('oauth2_refresh_tokens').insert({
        ...common,
        refresh_token: data.clientId,
    });
    await database.transaction(upGrants);
    await database.raw(
        'ALTER TABLE oauth2_authorization_codes ADD COLUMN agent_connection_grant_uuid UUID NULL',
    );
    await database.raw(
        'ALTER TABLE oauth2_authorization_codes ADD CONSTRAINT oauth2_authorization_codes_agent_grant_fk FOREIGN KEY (agent_connection_grant_uuid) REFERENCES agent_connection_grants(agent_connection_grant_uuid) ON DELETE CASCADE NOT VALID',
    );
    await upBindings(database);
    await upBindings(database);
    await Promise.all(
        oauthTables.map(async (table) => {
            expect(
                await database(table).where('client_id', data.clientId).first(),
            ).toMatchObject({ ...common, agent_connection_grant_uuid: null });
            await expect(
                database(table)
                    .where('client_id', data.clientId)
                    .update({ agent_connection_grant_uuid: randomUUID() }),
            ).rejects.toMatchObject({ code: '23503' });
        }),
    );
    const [grant] = await database('agent_connection_grants')
        .insert(data.grantInput)
        .returning('*');
    const boundToken = await insertTokens(
        data,
        grant.agent_connection_grant_uuid,
    );
    await downBindings(database);
    await downBindings(database);
    const tokenColumns = {
        oauth2_access_tokens: 'access_token',
        oauth2_refresh_tokens: 'refresh_token',
        oauth2_authorization_codes: 'authorization_code',
    } as const;
    await Promise.all(
        oauthTables.map(async (table) => {
            expect(
                await database(table).where('client_id', data.clientId),
            ).toHaveLength(1);
            expect(
                await database(table)
                    .where(tokenColumns[table], boundToken)
                    .first(),
            ).toBeUndefined();
        }),
    );
    await database.transaction(downGrants);
    await database.transaction(upGrants);
    await upBindings(database);
    await Promise.all(
        oauthTables.map(async (table) => {
            expect(
                await database(table).where('client_id', data.clientId).first(),
            ).toMatchObject({ agent_connection_grant_uuid: null });
        }),
    );
});

test.each(oauthTables)(
    'resumes down after the %s binding column is gone',
    async (completedTable) => {
        const { database } = migrated;
        const data = await fixture();
        const [grant] = await database('agent_connection_grants')
            .insert(data.grantInput)
            .returning('*');
        await insertTokens(data, null);
        await insertTokens(data, grant.agent_connection_grant_uuid);
        await database(completedTable)
            .whereNotNull('agent_connection_grant_uuid')
            .delete();
        await database.schema.alterTable(completedTable, (table) =>
            table.dropColumn('agent_connection_grant_uuid'),
        );
        try {
            await downBindings(database);
            await Promise.all(
                oauthTables.map(async (table) => {
                    expect(
                        await database.schema.hasColumn(
                            table,
                            'agent_connection_grant_uuid',
                        ),
                    ).toBe(false);
                    expect(
                        await database(table).where('client_id', data.clientId),
                    ).toHaveLength(1);
                }),
            );
        } finally {
            await upBindings(database);
        }
    },
);

test.each(['organizations', 'users', 'oauth2_clients'] as const)(
    'cascades grants and bound tokens when deleting from %s',
    async (table) => {
        const { database } = migrated;
        const data = await fixture();
        const [grant] = await database('agent_connection_grants')
            .insert(data.grantInput)
            .returning('*');
        await insertTokens(data, grant.agent_connection_grant_uuid);
        if (table === 'organizations')
            await database(table)
                .where('organization_uuid', data.org.organization_uuid)
                .delete();
        if (table === 'users')
            await database(table)
                .where('user_uuid', data.user.user_uuid)
                .delete();
        if (table === 'oauth2_clients')
            await database(table).where('client_id', data.clientId).delete();
        expect(
            await database('agent_connection_grants').where(
                'agent_connection_grant_uuid',
                grant.agent_connection_grant_uuid,
            ),
        ).toHaveLength(0);
        await Promise.all(
            oauthTables.map(async (tokenTable) => {
                expect(
                    await database(tokenTable).where(
                        'client_id',
                        data.clientId,
                    ),
                ).toHaveLength(0);
            }),
        );
    },
);

test('sets nullable audit and replacement references to null on deletion', async () => {
    const { database } = migrated;
    const data = await fixture();
    const [actor] = await database('users')
        .insert({ first_name: 'Grant', last_name: 'Approver' } as never)
        .returning('*');
    const [replacement] = await database('agent_connection_grants')
        .insert(data.grantInput)
        .returning('*');
    const [grant] = await database('agent_connection_grants')
        .insert({
            ...data.grantInput,
            approved_by_user_uuid: actor.user_uuid,
            revoked_by_user_uuid: actor.user_uuid,
            replaced_by_grant_uuid: replacement.agent_connection_grant_uuid,
        })
        .returning('*');
    await database('users').where('user_uuid', actor.user_uuid).delete();
    await database('agent_connection_grants')
        .where(
            'agent_connection_grant_uuid',
            replacement.agent_connection_grant_uuid,
        )
        .delete();
    expect(
        await database('agent_connection_grants')
            .where(
                'agent_connection_grant_uuid',
                grant.agent_connection_grant_uuid,
            )
            .first(),
    ).toMatchObject({
        approved_by_user_uuid: null,
        revoked_by_user_uuid: null,
        replaced_by_grant_uuid: null,
    });
});

test('revokes one grant atomically without changing another grant or unbound tokens', async () => {
    const { database } = migrated;
    const data = await fixture();
    const [grant, other] = await database('agent_connection_grants')
        .insert([data.grantInput, data.grantInput])
        .returning('*');
    const boundToken = await insertTokens(
        data,
        grant.agent_connection_grant_uuid,
    );
    const otherToken = await insertTokens(
        data,
        other.agent_connection_grant_uuid,
    );
    const unboundToken = await insertTokens(data, null);
    const model = new AgentConnectionGrantModel({ database });
    const args = {
        organizationUuid: data.org.organization_uuid,
        grantUuid: grant.agent_connection_grant_uuid,
        revokedByUserUuid: data.user.user_uuid,
        reason: 'user_request',
    };
    await model.revoke(args);
    const first = await model.find(args.grantUuid);
    await model.revoke({
        ...args,
        revokedByUserUuid: null,
        reason: 'different',
    });
    expect(await model.find(args.grantUuid)).toEqual(first);
    expect(
        await database('oauth2_access_tokens').where(
            'access_token',
            boundToken,
        ),
    ).toMatchObject([
        { agent_connection_grant_uuid: grant.agent_connection_grant_uuid },
    ]);
    expect(
        await database('oauth2_authorization_codes').where(
            'authorization_code',
            boundToken,
        ),
    ).toHaveLength(0);
    expect(
        (
            await database('oauth2_refresh_tokens')
                .where('refresh_token', boundToken)
                .first()
        ).revoked_at,
    ).toBeInstanceOf(Date);
    await Promise.all(
        oauthTables.map(async (table) => {
            expect(
                await database(table)
                    .where('client_id', data.clientId)
                    .whereNull('agent_connection_grant_uuid'),
            ).toHaveLength(1);
            expect(
                await database(table).where(
                    'agent_connection_grant_uuid',
                    other.agent_connection_grant_uuid,
                ),
            ).toHaveLength(1);
        }),
    );
    expect(
        await database('oauth2_refresh_tokens')
            .whereIn('refresh_token', [otherToken, unboundToken])
            .whereNull('revoked_at'),
    ).toHaveLength(2);
    await database('agent_connection_grants')
        .where('agent_connection_grant_uuid', other.agent_connection_grant_uuid)
        .delete();
    await Promise.all(
        oauthTables.map(async (table) => {
            expect(
                await database(table).where(
                    'agent_connection_grant_uuid',
                    other.agent_connection_grant_uuid,
                ),
            ).toHaveLength(0);
            expect(
                await database(table)
                    .where('client_id', data.clientId)
                    .whereNull('agent_connection_grant_uuid'),
            ).toHaveLength(1);
        }),
    );
});

test('replaces an invalid concurrent index on retry', async () => {
    const { database } = migrated;
    const data = await fixture();
    await insertTokens(data, null);
    await insertTokens(data, null);
    await database.raw(
        'DROP INDEX CONCURRENTLY oauth2_access_tokens_agent_grant_idx',
    );
    await expect(
        database.raw(
            'CREATE UNIQUE INDEX CONCURRENTLY oauth2_access_tokens_agent_grant_idx ON oauth2_access_tokens (client_id)',
        ),
    ).rejects.toMatchObject({ code: '23505' });
    const invalid = await database.raw(
        "SELECT indisvalid FROM pg_index WHERE indexrelid = 'oauth2_access_tokens_agent_grant_idx'::regclass",
    );
    expect(invalid.rows).toEqual([{ indisvalid: false }]);
    await upBindings(database);
    const recovered = await database.raw(
        "SELECT indisvalid, pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid = 'oauth2_access_tokens_agent_grant_idx'::regclass",
    );
    expect(recovered.rows).toEqual([
        {
            indisvalid: true,
            definition: expect.stringContaining(
                '(agent_connection_grant_uuid)',
            ),
        },
    ]);
});

test('allows only one refresh family under concurrent binding and keeps repeat binding idempotent', async () => {
    const { database } = migrated;
    const data = await fixture();
    const [grant] = await database('agent_connection_grants')
        .insert(data.grantInput)
        .returning('*');
    const model = new AgentConnectionGrantModel({ database });
    const binding = {
        organizationUuid: data.org.organization_uuid,
        grantUuid: grant.agent_connection_grant_uuid,
    };
    const families = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled(
        families.map((familyUuid) =>
            model.bindRefreshFamily({ ...binding, familyUuid }),
        ),
    );
    expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    const winner =
        families[
            outcomes.findIndex((outcome) => outcome.status === 'fulfilled')
        ];
    expect(await model.find(binding.grantUuid)).toMatchObject({
        refreshFamilyUuid: winner,
    });
    await model.bindRefreshFamily({ ...binding, familyUuid: winner });
    expect(await model.find(binding.grantUuid)).toMatchObject({
        refreshFamilyUuid: winner,
    });
    await model.touchLastUsed(binding.grantUuid);
    const touched = await model.find(binding.grantUuid);
    await model.touchLastUsed(binding.grantUuid);
    expect(await model.find(binding.grantUuid)).toEqual(touched);
});
