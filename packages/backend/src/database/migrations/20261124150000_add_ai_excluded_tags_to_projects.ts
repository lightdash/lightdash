import { Knex } from 'knex';

const PROJECTS_TABLE = 'projects';
const AI_EXCLUDED_TAGS = 'ai_excluded_tags';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.specificType(AI_EXCLUDED_TAGS, 'text[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(PROJECTS_TABLE, (table) => {
        table.dropColumn(AI_EXCLUDED_TAGS);
    });
}
