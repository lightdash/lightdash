import type { Knex } from 'knex';

const tableName = 'ai_deep_research_runs';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table
            .uuid('resume_from_run_uuid')
            .nullable()
            .references('ai_deep_research_run_uuid')
            .inTable(tableName)
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('resume_from_run_uuid');
    });
}
