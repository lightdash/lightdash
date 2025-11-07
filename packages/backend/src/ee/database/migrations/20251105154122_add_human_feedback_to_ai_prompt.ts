import { Knex } from 'knex';

const tableName = 'ai_prompt';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.text('human_feedback').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('human_feedback');
    });
}
