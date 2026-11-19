import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable ai_agent_slack_integration.service_account_uuid column without a default or backfill; older pods ignore it.',
} as const;

const tableName = 'ai_agent_slack_integration';
const columnName = 'service_account_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(tableName, (table) => {
        table
            .uuid(columnName)
            .nullable()
            .references('service_account_uuid')
            .inTable('service_accounts')
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn(columnName);
    });
}
