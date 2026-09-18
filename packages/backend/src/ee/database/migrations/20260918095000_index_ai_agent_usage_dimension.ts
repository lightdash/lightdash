import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a concurrent index for organization-scoped agent pagination without changing data or blocking writes.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    await knex.raw("SET lock_timeout = '10s'");
    try {
        const invalid = await knex.raw(
            `SELECT 1 FROM pg_index i
             JOIN pg_class c ON c.oid = i.indexrelid
             WHERE c.relname = 'ai_agent_org_uuid_agent_uuid_idx'
               AND i.indrelid = 'ai_agent'::regclass AND NOT i.indisvalid`,
        );
        if (invalid.rowCount > 0) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS ai_agent_org_uuid_agent_uuid_idx',
            );
        }
        await knex.raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_agent_org_uuid_agent_uuid_idx ON ai_agent (organization_uuid, ai_agent_uuid)',
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    await knex.raw("SET lock_timeout = '10s'");
    try {
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS ai_agent_org_uuid_agent_uuid_idx',
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}
