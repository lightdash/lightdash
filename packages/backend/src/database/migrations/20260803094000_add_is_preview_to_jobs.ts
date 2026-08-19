import { Knex } from 'knex';

const JOBS_TABLE_NAME = 'jobs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(JOBS_TABLE_NAME, (table) => {
        table.boolean('is_preview').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(JOBS_TABLE_NAME, (table) => {
        table.dropColumn('is_preview');
    });
}
