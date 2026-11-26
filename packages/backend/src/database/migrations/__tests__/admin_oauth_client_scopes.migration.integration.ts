import { randomUUID } from 'node:crypto';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261125150000_register_scopes_for_admin_oauth_clients';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const ALL_SCOPES = ['read', 'write', 'mcp:read', 'mcp:write'];

const insertClient = async (
    organizationUuid: string | null,
    scopes: string[],
) => {
    const clientId = `client-${randomUUID()}`;
    await migrated.database('oauth2_clients').insert({
        client_id: clientId,
        client_name: 'Scope backfill test',
        redirect_uris: ['https://client.example/callback'],
        grants: ['authorization_code', 'refresh_token'],
        scopes,
        organization_uuid: organizationUuid,
    });
    return clientId;
};

const scopesOf = async (clientId: string): Promise<string[]> =>
    (
        await migrated
            .database('oauth2_clients')
            .select('scopes')
            .where('client_id', clientId)
            .first()
    ).scopes;

it('registers all known scopes only on admin-created clients without scopes', async () => {
    const { database } = migrated;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'OAuth client scopes' })
        .returning('organization_uuid');
    const orgUuid: string = organization.organization_uuid;
    const adminEmpty = await insertClient(orgUuid, []);
    const adminRead = await insertClient(orgUuid, ['read']);
    const adminMcpRead = await insertClient(orgUuid, ['mcp:read']);
    const registeredEmpty = await insertClient(null, []);
    const registeredRead = await insertClient(null, ['read', 'write']);

    await up(database);

    expect(await scopesOf(adminEmpty)).toEqual(ALL_SCOPES);
    expect(await scopesOf(adminRead)).toEqual(['read']);
    expect(await scopesOf(adminMcpRead)).toEqual(['mcp:read']);
    expect(await scopesOf(registeredEmpty)).toEqual([]);
    expect(await scopesOf(registeredRead)).toEqual(['read', 'write']);

    await up(database);
    expect(await scopesOf(adminEmpty)).toEqual(ALL_SCOPES);
    expect(await scopesOf(registeredEmpty)).toEqual([]);
});

it('declares the down migration irreversible', async () => {
    await expect(down()).rejects.toThrow(/^irreversible:/);
});
