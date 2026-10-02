import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds AI access to custom roles that can already use MCP or agents',
} as const;

const SCOPED_ROLES = 'scoped_roles';
const AI_ACCESS_SCOPE = 'view:AiAccess';
const EXISTING_ACCESS_SCOPES = [
    'view:Project',
    'manage:Project',
    'view:AiAgent',
    'manage:AiAgent',
    'create:AiAgentThread',
];

export async function up(knex: Knex): Promise<void> {
    try {
        await knex.raw(
            `
            INSERT INTO ?? (role_uuid, scope_name, granted_by)
            SELECT DISTINCT ON (role_uuid) role_uuid, ?, granted_by
            FROM ??
            WHERE scope_name IN (?, ?, ?, ?, ?)
            ORDER BY role_uuid, scope_name
            ON CONFLICT DO NOTHING
            `,
            [
                SCOPED_ROLES,
                AI_ACCESS_SCOPE,
                SCOPED_ROLES,
                ...EXISTING_ACCESS_SCOPES,
            ],
        );
    } catch (error) {
        process.stderr.write(
            `[migration 20261002130000] AI access backfill failed. Run INSERT INTO scoped_roles (role_uuid, scope_name, granted_by) SELECT DISTINCT ON (role_uuid) role_uuid, 'view:AiAccess', granted_by FROM scoped_roles WHERE scope_name IN ('view:Project', 'manage:Project', 'view:AiAgent', 'manage:AiAgent', 'create:AiAgentThread') ORDER BY role_uuid, scope_name ON CONFLICT DO NOTHING. ${String(error)}\n`,
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    try {
        await knex(SCOPED_ROLES).where('scope_name', AI_ACCESS_SCOPE).delete();
    } catch (error) {
        process.stderr.write(
            `[migration 20261002130000] AI access rollback failed. Run DELETE FROM scoped_roles WHERE scope_name = 'view:AiAccess'. ${String(error)}\n`,
        );
    }
}
