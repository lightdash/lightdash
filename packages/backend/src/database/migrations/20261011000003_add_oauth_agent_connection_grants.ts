import { type Knex } from 'knex';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds nullable grant bindings and concurrent indexes to OAuth tables without changing existing credentials. Foreign keys apply only to new bound tokens. Rollback removes bound credentials and preserves unbound credentials.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw("SET lock_timeout = '5s'");
        await knex.raw(
            'ALTER TABLE oauth2_authorization_codes ADD COLUMN IF NOT EXISTS agent_connection_grant_uuid UUID NULL',
        );
        const codeConstraint = await knex.raw(
            "SELECT 1 FROM pg_constraint WHERE conrelid = 'oauth2_authorization_codes'::regclass AND conname = 'oauth2_authorization_codes_agent_grant_fk'",
        );
        if (codeConstraint.rows.length === 0) {
            await knex.raw(
                'ALTER TABLE oauth2_authorization_codes ADD CONSTRAINT oauth2_authorization_codes_agent_grant_fk FOREIGN KEY (agent_connection_grant_uuid) REFERENCES agent_connection_grants(agent_connection_grant_uuid) ON DELETE CASCADE NOT VALID',
            );
        }
        const invalidCode = await knex.raw(
            "SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.oid = to_regclass('oauth2_authorization_codes_agent_grant_idx') AND NOT i.indisvalid",
        );
        if (invalidCode.rows.length > 0) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS oauth2_authorization_codes_agent_grant_idx',
            );
        }
        await knex.raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_authorization_codes_agent_grant_idx ON oauth2_authorization_codes (agent_connection_grant_uuid)',
        );
        await knex.raw(
            'ALTER TABLE oauth2_authorization_codes VALIDATE CONSTRAINT oauth2_authorization_codes_agent_grant_fk',
        );
        await knex.raw(
            'ALTER TABLE oauth2_access_tokens ADD COLUMN IF NOT EXISTS agent_connection_grant_uuid UUID NULL',
        );
        const accessConstraint = await knex.raw(
            "SELECT 1 FROM pg_constraint WHERE conrelid = 'oauth2_access_tokens'::regclass AND conname = 'oauth2_access_tokens_agent_grant_fk'",
        );
        if (accessConstraint.rows.length === 0) {
            await knex.raw(
                'ALTER TABLE oauth2_access_tokens ADD CONSTRAINT oauth2_access_tokens_agent_grant_fk FOREIGN KEY (agent_connection_grant_uuid) REFERENCES agent_connection_grants(agent_connection_grant_uuid) ON DELETE CASCADE NOT VALID',
            );
        }
        const invalidAccess = await knex.raw(
            "SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.oid = to_regclass('oauth2_access_tokens_agent_grant_idx') AND NOT i.indisvalid",
        );
        if (invalidAccess.rows.length > 0) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS oauth2_access_tokens_agent_grant_idx',
            );
        }
        await knex.raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_access_tokens_agent_grant_idx ON oauth2_access_tokens (agent_connection_grant_uuid)',
        );
        await knex.raw(
            'ALTER TABLE oauth2_access_tokens VALIDATE CONSTRAINT oauth2_access_tokens_agent_grant_fk',
        );
        await knex.raw(
            'ALTER TABLE oauth2_refresh_tokens ADD COLUMN IF NOT EXISTS agent_connection_grant_uuid UUID NULL',
        );
        const refreshConstraint = await knex.raw(
            "SELECT 1 FROM pg_constraint WHERE conrelid = 'oauth2_refresh_tokens'::regclass AND conname = 'oauth2_refresh_tokens_agent_grant_fk'",
        );
        if (refreshConstraint.rows.length === 0) {
            await knex.raw(
                'ALTER TABLE oauth2_refresh_tokens ADD CONSTRAINT oauth2_refresh_tokens_agent_grant_fk FOREIGN KEY (agent_connection_grant_uuid) REFERENCES agent_connection_grants(agent_connection_grant_uuid) ON DELETE CASCADE NOT VALID',
            );
        }
        const invalidRefresh = await knex.raw(
            "SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.oid = to_regclass('oauth2_refresh_tokens_agent_grant_idx') AND NOT i.indisvalid",
        );
        if (invalidRefresh.rows.length > 0) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS oauth2_refresh_tokens_agent_grant_idx',
            );
        }
        await knex.raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS oauth2_refresh_tokens_agent_grant_idx ON oauth2_refresh_tokens (agent_connection_grant_uuid)',
        );
        await knex.raw(
            'ALTER TABLE oauth2_refresh_tokens VALIDATE CONSTRAINT oauth2_refresh_tokens_agent_grant_fk',
        );
    } finally {
        await knex.raw('RESET lock_timeout');
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    const removeBinding = async (
        table:
            | 'oauth2_refresh_tokens'
            | 'oauth2_access_tokens'
            | 'oauth2_authorization_codes',
    ) => {
        await knex.transaction(async (transaction) => {
            await transaction.raw("SET LOCAL lock_timeout = '5s'");
            await transaction.raw(
                `LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`,
            );
            if (
                await transaction.schema.hasColumn(
                    table,
                    'agent_connection_grant_uuid',
                )
            ) {
                await transaction(table)
                    .whereNotNull('agent_connection_grant_uuid')
                    .delete();
                await transaction.raw(
                    `ALTER TABLE ${table} DROP COLUMN IF EXISTS agent_connection_grant_uuid`,
                );
            }
        });
    };
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await removeBinding('oauth2_refresh_tokens');
        await removeBinding('oauth2_access_tokens');
        await removeBinding('oauth2_authorization_codes');
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
