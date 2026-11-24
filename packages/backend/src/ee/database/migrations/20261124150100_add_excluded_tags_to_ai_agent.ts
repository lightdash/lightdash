import { Knex } from 'knex';

const AI_AGENT_TABLE = 'ai_agent';
const EXCLUDED_TAGS = 'excluded_tags';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.specificType(EXCLUDED_TAGS, 'text[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(AI_AGENT_TABLE, (table) => {
        table.dropColumn(EXCLUDED_TAGS);
    });
}
