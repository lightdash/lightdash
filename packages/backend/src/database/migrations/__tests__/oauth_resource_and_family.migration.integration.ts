import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261010231500_add_oauth_resource_and_family';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

it('adds nullable resource and family columns and valid family indexes on the real schema', async () => {
    const { database } = migrated;
    await up(database);
    await Promise.all(
        [
            'oauth2_authorization_codes',
            'oauth2_access_tokens',
            'oauth2_refresh_tokens',
        ].map(async (table) => {
            const columns = await database(table).columnInfo();
            expect(columns.resource).toMatchObject({
                type: 'text',
                nullable: true,
                defaultValue: null,
            });
            if (table !== 'oauth2_authorization_codes')
                expect(columns.family_uuid).toMatchObject({
                    type: 'uuid',
                    nullable: true,
                    defaultValue: null,
                });
        }),
    );
    const result = await database.raw(
        "SELECT c.relname, i.indisvalid FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname IN ('oauth2_access_tokens_family_uuid_idx', 'oauth2_refresh_tokens_family_uuid_idx')",
    );
    expect(result.rows).toHaveLength(2);
    result.rows.forEach((row: { indisvalid: boolean }) =>
        expect(row.indisvalid).toBe(true),
    );
});
it('reverses the migration and permits reapplication', async () => {
    const { database } = migrated;
    await down(database);
    await Promise.all(
        [
            'oauth2_authorization_codes',
            'oauth2_access_tokens',
            'oauth2_refresh_tokens',
        ].map(async (table) => {
            expect(await database.schema.hasColumn(table, 'resource')).toBe(
                false,
            );
        }),
    );
    await Promise.all(
        ['oauth2_access_tokens', 'oauth2_refresh_tokens'].map(async (table) => {
            expect(await database.schema.hasColumn(table, 'family_uuid')).toBe(
                false,
            );
        }),
    );
    await up(database);
    await up(database);
    expect(
        await database.schema.hasColumn('oauth2_access_tokens', 'family_uuid'),
    ).toBe(true);
});

it('leaves old-style inserts unbound and preserves rows across rollback and reapplication', async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'OAuth resources' })
        .returning('*');
    const [user] = await database('users')
        .insert({ first_name: 'OAuth', last_name: 'User' } as never)
        .returning('user_id');
    await database('oauth2_clients').insert({
        client_id: 'resource-schema-test',
        client_name: 'Resource test',
        redirect_uris: ['https://client.example/callback'],
        grants: ['authorization_code', 'refresh_token'],
        scopes: ['read'],
    });
    const common = {
        expires_at: new Date(Date.now() + 60000),
        client_id: 'resource-schema-test',
        user_id: user.user_id,
        organization_uuid: org.organization_uuid,
    };
    await database('oauth2_authorization_codes').insert({
        ...common,
        authorization_code: 'schema-code',
        redirect_uri: 'https://client.example/callback',
    });
    await database('oauth2_access_tokens').insert({
        ...common,
        access_token: 'schema-access',
    });
    await database('oauth2_refresh_tokens').insert({
        ...common,
        refresh_token: 'schema-refresh',
    });
    await Promise.all(
        [
            'oauth2_authorization_codes',
            'oauth2_access_tokens',
            'oauth2_refresh_tokens',
        ].map(async (table) => {
            const row = await database(table)
                .where('client_id', common.client_id)
                .first();
            expect(row.resource).toBeNull();
            if (table !== 'oauth2_authorization_codes')
                expect(row.family_uuid).toBeNull();
        }),
    );
    const resource = 'https://server.example/api/v1/mcp';
    const family = '11111111-1111-4111-8111-111111111111';
    await database('oauth2_authorization_codes')
        .where('authorization_code', 'schema-code')
        .update({ resource });
    await Promise.all(
        ['oauth2_access_tokens', 'oauth2_refresh_tokens'].map(async (table) => {
            await database(table)
                .where('client_id', common.client_id)
                .update({ resource, family_uuid: family });
            expect(
                await database(table)
                    .where('client_id', common.client_id)
                    .first(),
            ).toMatchObject({ resource, family_uuid: family });
        }),
    );
    await down(database);
    await up(database);
    await Promise.all(
        [
            'oauth2_authorization_codes',
            'oauth2_access_tokens',
            'oauth2_refresh_tokens',
        ].map(async (table) => {
            expect(
                await database(table)
                    .where('client_id', common.client_id)
                    .first(),
            ).toMatchObject({ resource: null });
        }),
    );
});
