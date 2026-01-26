import { Knex } from 'knex';

const AiPromptTable = `ai_prompt`;
const SavedQueriesTable = `saved_queries`;

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiPromptTable, (table) => {
        table
            .uuid('saved_query_uuid')
            .references('saved_query_uuid')
            .inTable(SavedQueriesTable)
            .nullable()
            .onDelete('SET NULL');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiPromptTable, (table) => {
        table.dropColumn('saved_query_uuid');
    });
}
