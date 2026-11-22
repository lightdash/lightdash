import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable ai_agent.live_source_uuids uuid[] column without a default or backfill; null keeps every integration available, so older pods ignore it.',
} as const;

const tableName = 'ai_agent';
const columnName = 'live_source_uuids';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(tableName, (table) => {
        table.specificType(columnName, 'uuid[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn(columnName);
    });
}
