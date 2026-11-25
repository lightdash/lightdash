import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Registers read, write, mcp:read and mcp:write on admin-created OAuth clients that have no registered scopes. Older releases treat these four scopes the same as an empty list, so no schema or behaviour changes for them.',
} as const;

const OAuthClientsTableName = 'oauth2_clients';
const ADMIN_CLIENT_SCOPES = '{read,write,mcp:read,mcp:write}';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `
        UPDATE ??
        SET scopes = ?::text[]
        WHERE organization_uuid IS NOT NULL
          AND cardinality(scopes) = 0
        `,
        [OAuthClientsTableName, ADMIN_CLIENT_SCOPES],
    );
}

// Rows updated here look the same as admin clients created later with these
// scopes. Older releases read these four scopes the same as an empty list, so
// a rollback does not need the old values.
export async function down(): Promise<void> {
    throw new Error('irreversible: cannot tell updated rows from new ones');
}
